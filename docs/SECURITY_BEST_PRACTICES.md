# JChat 3.0 — Mejores prácticas de seguridad de pagos (investigación 2026)

> Referencia consolidada de fuentes oficiales (Stripe docs, Supabase docs) +
> guías de la industria 2026. Fundamenta el diseño de P0-2 (recálculo
> server-side) y P0-3 (Edge Functions no confían en el cliente) + el checkout
> web (Fase 3). Fecha: julio 2026.

---

## PRINCIPIO CENTRAL (aplica a TODO)

**El cliente (app/web) NUNCA es fuente de verdad para dinero ni autorización.**
El servidor recalcula montos desde precios de BD, verifica permisos contra
tablas (no contra claims del JWT), y los webhooks confirman los pagos. Todo lo
que venga del cliente se trata como "sugerencia no confiable".

---

## 1 — STRIPE (server-side + webhooks)

### Recálculo de montos (P0-2)
- El servidor **recalcula el total desde cero**: lee los `order_items`, busca los
  precios reales en la BD (`menu_items`, `modifier_options`), suma modificadores,
  aplica impuestos (`business_tax_rate`), y ese total es el que va al PaymentIntent.
- El monto que manda el cliente se **ignora** (a lo sumo se compara para detectar
  manipulación y loguear, pero nunca se cobra).

### PaymentIntent creado SOLO server-side
- El `PaymentIntent` se crea en el servidor (Edge Function) con el monto calculado.
- El cliente recibe solo el `client_secret` para confirmar — nunca decide el monto.

### Idempotency keys (evita cobros dobles)
- **Todo POST mutante a Stripe** (crear PaymentIntent, refund, etc.) lleva un
  `Idempotency-Key`.
- La key debe ser **determinística y reproducible** desde el estado de la app
  (ej. `order_{orderId}_v1`), NO un UUID aleatorio que se pierde si el proceso
  crashea entre generar la key y llamar a Stripe.
- Stripe cachea el resultado 24h: si llega la misma key dos veces, devuelve el
  resultado de la primera en vez de ejecutar dos veces.

### Webhooks = fuente de verdad (no el cliente)
- **Nunca cumplir un pedido basándose en el redirect/respuesta del cliente** — el
  usuario puede cerrar el navegador antes de que llegue. El webhook llega igual.
- Cumplir el pedido (crear la orden pagada) SOLO cuando llega
  `payment_intent.succeeded` (o `checkout.session.completed` en checkout web).
- **Verificación de firma OBLIGATORIA:** `constructEventAsync` con el signing
  secret. Hoy está STUBBED (`// TODO(security)`) en `stripe-webhook` y
  `subscriptions` → **bloqueante, activar antes de cualquier tráfico real.**

### Idempotencia de webhooks (Stripe entrega "al menos una vez")
- Stripe puede enviar el mismo `event.id` varias veces (reintentos hasta 3 días).
- Guardar cada `event.id` procesado en una tabla con **constraint UNIQUE**, y
  cortar temprano si ya existe (antes de mutar estado). Evita doble-fulfillment,
  doble-refund, emails duplicados.
- Responder 2xx en < 10s (Stripe corta a los 10s). Para trabajo pesado: responder
  200 tras verificar firma, procesar async.

### PCI / manejo de tarjetas
- **Nunca** almacenar/loguear números de tarjeta, CVV, datos crudos. Guardar solo
  IDs de Stripe (customer, subscription, price, payment_intent).
- Usar Stripe SDK / Elements → el dato de tarjeta va directo a Stripe, nunca toca
  tu servidor → cumplimiento **SAQ A** (el tier más simple, ~20 controles vs 300+).
- Apple Pay / Google Pay: el número nunca sale del dispositivo (tokenizado) → suben
  conversión y seguridad. Buen encaje para pedido-en-mesa móvil.

### Testing
- Stripe CLI: `stripe listen --forward-to localhost` + `stripe trigger`.
- Tarjetas de prueba: `4242 4242 4242 4242` (éxito), `4000 0025 0000 3155`
  (3D Secure), `4000 0000 0000 9995` (rechazada por fondos).
- Probar TODOS los caminos de fallo (declinada, 3DS, expirada) — el bug más común
  es no manejar la tarjeta declinada (el usuario ve una página rota).
- Endpoints separados test vs live (cada uno con su signing secret).

---

## 2 — SUPABASE (Edge Functions + RLS)

### Edge Functions — modo de auth correcto por tipo de llamador
- **Llamadas de usuarios autenticados** (desde la app con `functions.invoke`):
  mantener `verify_jwt = true` (default) → la plataforma valida el JWT antes de
  correr el handler. Usar el cliente scopeado al usuario (respeta RLS), NO el
  service_role, salvo para la operación privilegiada específica.
- **Webhooks externos (Stripe)**: no mandan credenciales Supabase — firman el body
  con su propio secreto. `verify_jwt = false` + verificar la firma de Stripe
  DENTRO del handler. Nunca dejar el endpoint abierto sin verificar la firma.
- **Cron/workers internos**: validar un secret key propio, no un JWT de usuario.

### service_role — usar con cuidado (P0-3)
- El `service_role` **bypassa TODA la RLS**. Solo server-side, nunca en cliente.
- Cuando una Edge Function usa service_role, ELLA es responsable de verificar
  permisos manualmente (la RLS ya no protege). Ej: antes de crear un pago para el
  negocio X, verificar en la BD que el usuario autenticado tiene rol en ese negocio
  y que el `stripe_account_id` corresponde a ese negocio — no confiar en los IDs
  que mandó el cliente.

### RLS — la capa de autorización real
- RLS habilitada en TODA tabla del schema público (sin excepción). Tabla sin RLS =
  accesible por cualquiera con la anon key.
- `USING` filtra lectura/borrado; `WITH CHECK` valida escritura. UPDATE necesita
  ambos.
- **No usar claims de `raw_user_meta_data` para autorización** — el usuario puede
  modificarlos. Verificar contra una tabla de la BD (ej. `admin_roles`,
  membresía de negocio) usando `auth.uid()`.
- Indexar las columnas que usa la RLS (`user_id`, etc.) — mejora 100x en tablas
  grandes.
- Agregar `authenticated` al `TO` de las policies (descarta `anon` sin taxar la BD).

### Column-level privileges (brecha que la RLS NO cubre)
- RLS controla FILAS, no COLUMNAS. Una policy que deja actualizar la fila del
  negocio deja tocar TODAS sus columnas — incluidas `stripe_account_id`, `plan`,
  `tax_rate`, que nunca deberían cambiarse desde el cliente.
- Cerrar con **privilegios de columna de Postgres**: revocar el UPDATE amplio y
  conceder solo las columnas que el cliente sí puede escribir. Un UPDATE a otra
  columna falla con "permission denied" antes de que corra la RLS.

### Storage
- Buckets con su propia RLS. Restringir tipos de archivo (solo imágenes) y scopear
  por carpeta de usuario (`auth.uid()`).

---

## 3 — MÓVIL (iOS / Android)

### Secretos y claves
- **Nunca** hardcodear API keys/secretos en el bundle JS/binario — se extraen
  trivialmente. La `sk_live` de Stripe JAMÁS en el cliente (solo la publishable
  `pk_`, que es pública por diseño).
- Secretos que deben vivir en el device (tokens de sesión): usar
  `expo-secure-store` / iOS Keychain / Android Keystore (hardware-backed), nunca
  AsyncStorage plano ni SharedPreferences.

### Red
- HTTPS/TLS 1.3 en todo, sin excepción ni fallback a HTTP.
- **Certificate pinning** para endpoints sensibles (pagos) — previene MITM aun con
  una CA comprometida. Pinnear la **clave pública** (sobrevive la renovación del
  cert), con pin de respaldo y plan de rotación (un pin hardcodeado sin backup
  causa outages al rotar el cert).

### Tarjetas en móvil
- El SDK de Stripe (o Apple/Google Pay) tokeniza en el device → el dato de tarjeta
  nunca toca tu app ni tu servidor. Manda solo el token al backend.
- Nunca loguear/cachear datos de tarjeta (ni en crash reports ni analytics).

### Dispositivos comprometidos (jailbreak/root)
- Detectar root/jailbreak (`react-native-jail-monkey`) y **degradar** — deshabilitar
  pagos/features sensibles en device comprometido, pero permitir uso general
  (enfoque balanceado para app de consumo, no bancaria).

### Validación
- Toda validación del cliente es cosmética (UX). La validación real es SIEMPRE
  server-side — el cliente se puede reversear.

---

## 4 — WEB (checkout Fase 3 + dashboard)

### Checkout web
- Mismo principio: el `PaymentIntent`/`Checkout Session` se crea server-side con
  monto recalculado. El cliente solo confirma con Stripe.js/Elements.
- Cumplir el pedido por **webhook** (`checkout.session.completed`), no por el
  redirect de vuelta.
- Guardia anti open-redirect en el retorno del login (`startsWith('/') &&
  !startsWith('//')`) — ya anotado como deuda del web client.

### Headers y transporte
- HTTPS estricto (Vercel lo da), headers seguros (CSP, HSTS).
- Rate limiting en endpoints sensibles (crear pago, login) para frenar abuso/fuerza
  bruta.

### Datos sensibles
- Nunca poner datos personales/sensibles en URLs o query strings.
- El `service_role` / `SUPABASE_SERVICE_ROLE_KEY` solo en el servidor (Route
  Handlers, Edge), nunca en `NEXT_PUBLIC_*`.

---

## CHECKLIST DE APLICACIÓN A JCHAT (lo que hay que verificar/hacer)

### P0-2 — Recálculo server-side de dinero
- [ ] El PaymentIntent de pedidos se crea con total recalculado en el servidor
      (no el monto del cliente).
- [ ] Modificadores, split checks y propinas se recalculan server-side.
- [ ] Impuestos aplicados desde `business_tax_rate` de la BD.

### P0-3 — Edge Functions no confían en el cliente
- [ ] `payments`, `stripe-connect`, `subscriptions` verifican que el usuario
      autenticado tiene permiso sobre el negocio/recurso (contra la BD, no IDs del
      cliente).
- [ ] El `stripe_account_id` se resuelve server-side desde el negocio, no se acepta
      del cliente.

### Webhooks
- [ ] **Activar verificación de firma** (`constructEventAsync`) en `stripe-webhook`
      y `subscriptions` (hoy stubbed — BLOQUEANTE).
- [ ] Tabla de `event.id` procesados con UNIQUE constraint (idempotencia).
- [ ] Cumplir pedidos/suscripciones solo por webhook, no por respuesta del cliente.

### Idempotencia
- [ ] Idempotency-Key determinística en cada POST a Stripe.

### RLS / columnas
- [ ] Column-level privileges en `businesses` (proteger `stripe_account_id`,
      `plan`, `tax_rate` de escritura del cliente).
- [ ] Revisar que ninguna autorización dependa de `raw_user_meta_data`.

### Móvil / web
- [ ] Solo `pk_` en el cliente; `sk_` solo en Edge secrets.
- [ ] (Opcional, alto valor para pagos) Certificate pinning en móvil.
- [ ] Guardia anti open-redirect en el login web.

### Testing (Stripe test mode)
- [ ] Probar éxito / 3DS / declinada con las tarjetas de prueba.
- [ ] Probar que un monto manipulado por el cliente NO cambia lo cobrado.
- [ ] Probar reenvío de webhook (idempotencia) con Stripe CLI.
