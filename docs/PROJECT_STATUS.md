# JChat 3.0 — Project Status

Last updated: 2026-07-23

> **📋 Auditoría senior 2026-07-09 completada** (seguridad, escalabilidad, móvil iOS/Android,
> web, POS vs competencia). La hoja de ruta activa hacia el lanzamiento vive en
> **`docs/PLAN_LANZAMIENTO.md`**; los 3 informes de evidencia y los prompts de remediación
> están en `docs/AUDITORIA_*_2026.md` + `docs/PROMPT_CLAUDE_CODE_seguridad.md`.

> **Sesión 2026-07-10 — Seguridad + bloqueantes de review:** cerrados en código S1, S2,
> S3, S6, S7, E1, E5 (Bloque 1) y W1, W2, W3, M1, M2, M6 (Fase 2). 8 commits auditados y
> verificados en BD (`3172ae2`, `af43587`, `9a400cd`, `1af2168`, `89977e2`, `34303ce`,
> `55eaa2d`, `c746796`). Pendientes de Juan (no-código): S5 leaked-password toggle, S4 rate
> limiting (diferido), M4 capability Apple, flip W1 CSP a enforce, revocar/regenerar `.p8`
> de Apple, device testing (OAuth/delete/biometría vía EAS dev-client). Ver PLAN_LANZAMIENTO.md.
> Continuación: cerrados también M8 (`75dbfcf`), M3/Apple-Maps docs (`7051a34`) y M9 OTA
> (`12fc1f7`). Fase 2 de bloqueantes de review completa en código. Pendiente de Juan para
> OTA: correr `eas update:configure` una vez desde `mobile/`.

> **⚠️ SEGURIDAD PENDIENTE:** el archivo `.p8` de Sign in with Apple se expuso durante la
> configuración. Revocar la key en Apple Developer → Keys, generar una nueva, regenerar el
> JWT (client secret) y actualizarlo en Supabase **ANTES de producción.**

---

## Sesión 2026-07-23 (cont.) — Códigos promocionales vía Stripe (CERRADO, verificado en producción)

Corrección del modelo de códigos: ya NO otorgan plan, alimentan la prueba de Stripe. Ver D-71 y D-72.
- **HALLAZGO:** el flujo "tarjeta + cobro automático" YA EXISTÍA en la Edge Function `subscriptions`
  (Checkout en modo suscripción pide tarjeta por defecto, `trial_period_days: 30`, webhook completo,
  Portal de Cliente para cancelar). Lo que faltaba era conectarle el código promocional. Cuarta vez
  que algo dado por pendiente resulta estar hecho.
- **Migración 087** (aplicada vía MCP, archivo en git): elimina `redeem_promo_code` (era un atajo a
  Pro gratis para cualquier autenticado) y la sustituye por `validate_promo_code` (solo lee).
- **Migración 088:** revoca EXECUTE a `anon` en las funciones de promo. Supabase concede EXECUTE por
  defecto a anon/authenticated en toda función nueva, y `revoke ... from public` NO lo quita.
- **Edge Function `subscriptions`** (`e576634`, desplegada, verify_jwt=false sin cambio): acepta
  `promo_code`, lo revalida server-side, usa sus días como `trial_period_days`, y lo consume en el
  webhook al completarse el checkout.
- **UI en `/pricing`** (`b1908cf` + `991e00c`): campo de código con validación en vivo y paso al
  checkout; mensaje honesto cuando no hay sesión (D-72).
- ✅ **VERIFICADO END-TO-END en producción** (Stripe en modo prueba, confirmado por Juan): código
  `7C5NQD9Z7V5Q` (Pro, 60 días) → `pruebagate` entró a Pro/trialing con **60 días** (no los 30 por
  defecto — eso es lo que prueba que el código actuó), con cliente y suscripción de Stripe REALES, y
  el código marcado canjeado por él. Limpieza previa: `adriana_p` devuelta a `regular` y el código
  viejo liberado (eran residuo del modelo anterior).
- ✅ **(2) Consentimiento de renovación automática — HECHO** (`af6b7b3`, ver D-73): casilla separada
  y sin marcar en `/pricing`, con los términos ANTES de la tarjeta; botones de checkout bloqueados
  hasta aceptar, con doble puerta (botón `disabled` + comprobación dentro de `handleSubscribe`). El
  plan Custom queda exento a propósito (abre un `mailto`, no un checkout). Limitación: el
  consentimiento no se registra en BD — cumple la divulgación, no da prueba auditable.
- 🟠 **(1) Aviso previo al cobro — NO es tarea de código:** lo manda STRIPE con un interruptor de su
  panel (Settings → Billing → Subscriptions and emails → "Send a reminder email 7 days before a free
  trial ends", + "Link to a Stripe-hosted page" para que incluya el enlace de actualizar tarjeta, +
  "Send emails about upcoming renewals", + revisar Settings → Branding porque salen con esa
  identidad). Investigado y confirmado en la doc de Stripe: cumple los requisitos de las redes de
  tarjetas. **DIFERIDO por Juan (2026-07-23):** activarlo exige completar los datos del negocio en
  Stripe y prefiere seguir en modo prueba. Avisos: el ajuste es POR MODO (test y vivo son
  independientes) → **activarlo en VIVO es REQUISITO DE LANZAMIENTO**; en sandbox Stripe casi no
  envía estos correos (solo a dominios verificados o miembros del equipo); y no hay recordatorio para
  pruebas de ≤7 días. El `TODO` de `trial_will_end` en la Edge Function puede quedarse: solo haría
  falta si algún día se quieren correos propios, bilingües y con marca.
- ⚠️ **NO existe infraestructura de correo transaccional** (comprobado 2026-07-23): en
  `supabase/functions/_shared` solo hay `connect.ts` y `pricing.ts`, y en Vercel no hay ningún
  proveedor de email (solo Twilio, que es SMS). Cualquier funcionalidad futura que necesite mandar
  correos (recibos propios, avisos, recuperación) requiere montar un proveedor primero. Hoy los
  únicos correos que salen son los de Supabase Auth y los que mande Stripe.
- ⚪ Anomalía sin atribuir: durante pruebas locales con automatización, `/pricing` saltó dos veces a
  `/auth/login` SIN `?next=`, solo acompañando a un scroll sintético; no reproducible con scroll
  programático. Probable inestabilidad de la herramienta. Si aparece navegando normal, investigar un
  escuchador de sesión que redirija al caducar el token.

## Sesión 2026-07-23 — Bienvenida post-registro (CERRADO, en producción)

- ✅ **Gate de prueba vencida VERIFICADO en vivo** (ver bloque de la sesión anterior).
- 🔴 **Bucle de registro encontrado y arreglado** (`3f55cd3`, ver D-70): el registro empujaba a
  `/dashboard` y el gate rebotaba al usuario nuevo de vuelta al registro. Nueva pantalla
  `web/app/auth/welcome/page.tsx`: felicita, ofrece Business/Pro (botón → `/pricing`), y si ya tiene
  plan vigente se salta sola al panel. Registro y OAuth de Google ahora apuntan ahí. Bilingüe ES/EN
  leyendo `users.language` (base para el i18n real). VERIFICADO en producción por Juan.
- ⚠️ **Verificación de correo DESACTIVADA** (decisión de Juan, 2026-07-23): hoy `email_confirmed_at`
  se rellena solo — cualquiera se registra con un correo falso (se comprobó con un dominio inventado).
  Aceptable pre-lanzamiento. **REQUISITO ANTES DE LANZAR con clientes reales:** activarla, o no hay
  recuperación de cuenta ni forma de mandar el aviso previo al cobro que exige la ley (ver el bloque
  legal de la sesión de códigos promocionales).
- ⚠️ **Deuda:** la regla de prueba vencida está duplicada (gate + welcome). Consolidar con Stripe.
- **PENDIENTE (tanda Stripe):** el código promocional debe alimentar `trial_period_days` en Checkout
  con tarjeta; la pantalla de "elegir plan → felicitar → panel" se completa ahí.

## Sesión 2026-07-22 (cont.) — Códigos promocionales (CERRADO 2a+2b, en producción)

Sistema de códigos promocionales para super_admin. Ver D-67 (modelo) y D-68 (lección de tipos).
- **Migración 086** (aplicada vía MCP, archivo en git `086_promo_codes.sql`): tabla `promo_codes` +
  RLS solo super_admin + RPCs `create_promo_code` / `redeem_promo_code`. El código otorga plan de
  prueba (Pro/Business) por N días; un solo uso; solo 'regular' canjea.
- **Pantalla `/super-admin/promo-codes`** (nav nuevo): 2a genera código de 12 chars (plan+días+vence)
  y lista; 2b seguimiento con nombre del canjeador + días restantes (verde/ámbar/gris). Commits
  `b9ec839` (2a + tipos regenerados) y `4fada38` (2b). `537e5a5` corrigió 2 falsos positivos de tipos
  (qr_token/p_tab_id) — solo tipo, sin cambio de runtime.
- **Verificado end-to-end:** super_admin generó `K8GJ33AJKD7A` (Pro/30) → canje REAL con cuenta regular
  (`adriana_p`) vía `redeem_promo_code` → quedó Pro/trialing, `plan_trial_end` +30d → seguimiento
  muestra "adriana_p · quedan 30 días". Producción `b9ec839`+`4fada38` READY.
- **Botones de gestión** (`db5cf24`): cancelar/reactivar y eliminar, SOLO en códigos sin canjear —
  borrar uno ya usado destruiría el registro de seguimiento, y "cancelar" uno usado no le quita el
  plan a nadie (mentiría).
- 🔴 **BUG DE DINERO ENCONTRADO Y TAPADO** (`6bc2bb3`, ver D-69): el gate del dashboard solo miraba
  `plan_status IN ('active','trialing')` y NUNCA `plan_trial_end`, y no existe ningún cron que caduque
  pruebas (solo hay 3 jobs: anon-users, mensajes, carritos). Resultado: **el código promocional
  regalaba Pro PARA SIEMPRE**. El gate ahora deniega si `plan_status='trialing'` y `plan_trial_end`
  ya pasó; fail-open si la fecha es NULL (esas pruebas las gobierna Stripe).
  ✅ **VERIFICADO EN VIVO (2026-07-23)** con la cuenta desechable `pruebagate`
  (`prueba+gate@tucorreo.com`, uid `d0e6768d-fcfe-4719-b161-03fbf596e598`, devuelta a `regular` para
  reutilizarla en futuras pruebas del gate): con `plan_trial_end` vencida (−5 días) el dashboard
  REBOTA a `/auth/register?upgrade=1`; con fecha futura (+20 días) DEJA ENTRAR. Confirma que bloquea
  lo vencido SIN expulsar a quien está en prueba válida.
- ⚠️ **PARCHE PARCIAL, no la solución de fondo:** el gate tapa la puerta principal, pero
  `enforce_business_limit()` lee `users.plan` directo → alguien con prueba vencida aún podría crear
  negocio llamando a la API por fuera del dashboard. La solución real es un job que DEGRADE a
  `regular` al vencer: arregla gate, límite y todo consumidor de una vez. Va con la tanda de Stripe.

**CAMBIO DE MODELO decidido por Juan (2026-07-22, PENDIENTE de implementar):** el código promocional
NO debe regalar el plan. El cliente debe **meter tarjeta primero**, y al terminar la prueba Stripe
cobra automáticamente; si cancela dentro de los 30 días, cero cargo. Principio rector: **que Stripe
sea el dueño de la prueba**, no nuestra columna `plan_trial_end` (que no sabe cobrar, avisar ni
cancelar). El código pasará a alimentar `subscription_data.trial_period_days` en el Checkout.
Investigado: los cupones nativos de Stripe NO sirven (hacen descuentos, no alargan la prueba) → la
tabla `promo_codes` se queda, pero cambia de trabajo. Requisitos legales (EE.UU.) que esto arrastra:
divulgación clara ANTES de pedir la tarjeta, casilla de consentimiento SEPARADA y sin marcar,
cancelación tan fácil como el alta (Portal de Cliente de Stripe), aviso antes de convertir (algunos
estados exigen 14 días) y confirmación por correo. La regla "click-to-cancel" de la FTC fue anulada
en julio 2025, PERO siguen vigentes ROSCA, la Sección 5 y las leyes estatales, en plena aplicación.
NO SOY ABOGADO: los textos los debe revisar uno antes de lanzar (EE.UU. + RD).
⚠️ El spec de la pantalla de canje en `/pricing` quedó OBSOLETO con este cambio — hay que rehacerlo
alrededor de Stripe Checkout, no del RPC directo.
- **PENDIENTE:** sistema de afiliados (greenfield, no empezado). "Mes gratis": diferido (toca Stripe).

## Sesión 2026-07-22 — Rediseño del checkout de invitado + fix de captcha (CERRADO, en producción)

Rama `feat/guest-checkout-ui` → merge `dd262e6` a `main` → **producción `jchat.cloud` READY**.
Solo código frontend + un cambio menor de `guest-pay` (ya desplegado). Auditado diff por diff.

**Qué se hizo (todo verificado con evidencia real, no de palabra):**
- **B1** (`12e65d7`): la hoja de recogida (PickupSheet) pre-llena la mesa escaneada por QR y
  añade un campo "Nombre" OPCIONAL debajo del número de mesa; el nombre nunca bloquea el pago.
- **B2a** (`f666810`): para usuarios logueados, el "Nombre" se pre-llena del perfil
  (display_name→username), editable y opcional (fetch perezoso, las ediciones del usuario ganan).
- **B2b** (`4106a39`): el checkout deja de pedir nombre/correo en un paso aparte; enruta por
  sesión (logueado→EF `payments`, invitado→EF `guest-pay`) al entrar, dispara el pago solo, y
  el recibo es SOLO-IMPRIMIR (sin email, sin "te enviamos el recibo"). −213/+56.
- **guest-pay** (`9d940f9`, desplegada v2→v5): `contact_name` ahora OPCIONAL (sin 400 si falta;
  fuera de la metadata salvo que venga).
- **Fix de timing del captcha** (`0c97d3d`): `InvisibleCaptcha` espera al `onLoad` del widget
  antes de `execute()` → el primer intento de pago va directo a la tarjeta, sin el falso "No
  pudimos verificar que eres una persona". Ver D-66.

**Los dos secretos de hCaptcha (el lío que costó la sesión) — ver D-65:**
El secreto de hCaptcha estaba desincronizado en DOS sitios independientes de Supabase. Se
arreglaron ambos:
- **Edge Functions → `HCAPTCHA_SECRET`** (lo usa `guest-pay`): se pegó el `ES_563..` correcto y
  se REDESPLEGÓ guest-pay (v5) para que lo tomara → pago de invitado 200.
- **Authentication → CAPTCHA secret** (lo usa el login con contraseña): tenía el secreto viejo →
  el login daba `400 sitekey-secret-mismatch`. Se pegó el `ES_563..` → login con contraseña 200.

**Verificación end-to-end (leída de logs/BD reales):**
- Pago de invitado: `guest-pay` v5 POST 200 + `stripe-webhook` v34 POST 200.
- Conteo de dinero: 15 pedidos, 3 de invitado (`user_id NULL`, clasificados `guest_order`),
  $461.82 cobrado, **0 orphan_payments**.
- Login con contraseña: `POST /token grant_type=password` status 200 (usuario test1), tras el
  reload de la config de Auth.
- Caso logueado: nombre "test1" pre-llenado en el checkout (confirmado por Juan en device).
- Producción: deploy `dpl_BRM3...` state READY, commit `dd262e6`, target production.

**Nota sobre la integración Supabase↔Vercel** (Juan la instaló durante la sesión): duplicó
variables de entorno con nombres nuevos (`SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`,
`POSTGRES_*`, etc.) SIN sobrescribir las que usa el código. Verificado que la `SUPABASE_URL`
sigue apuntando a `klfsgcfoahdtkojyqspd`. No rompe nada; los duplicados son deuda a limpiar.

**Pendientes detectados esta sesión (para retomar):**
- ✅ **Deriva de `payments` — VERIFICADA, sin problema (2026-07-22):** se leyó
  `supabase/functions/payments/index.ts` en `main`; los fixes P0-2 (recálculo server-side vía
  `priceLinesFromDb`/`computeTaxCents`/`serverTotalCents`, ignora el total del cliente) y P0-3
  (`verifyCaller` valida el JWT, opera sobre `authUserId` y nunca `body.user_id`; `table_qr_token`
  resuelto server-side y rechazando negocio cruzado) ESTÁN en el repo — cabecera fechada
  2026-06-24 / FIX #7 2026-07-08. El "v39 vs v37" era conteo de DESPLIEGUES, no deriva de código:
  cada `supabase functions deploy` sube el número tenga o no cambios. Un redeploy desde `main` NO
  revierte los fixes. (Caveat: no se hizo diff byte-a-byte del bundle desplegado v39; la lógica de
  seguridad coincide en `main` y en lo desplegado, que era la preocupación real.)
- 🟠 **`stripe-webhook` 400 repetidos** en los logs (v30/v32): reintentos de Stripe con firma que
  no verifica (probable secret de sandbox stale). Revisar antes del go-live de Stripe.
- ⚪ Limpiar los duplicados de env vars de la integración + el archivo untracked
  `CLIENT_ID=com.juangarciacruz.jchatapp.signin` (creado por error).
- ⚪ Borrar la rama `feat/guest-checkout-ui` (ya mergeada).

---

## Pruebas manuales pendientes

### PENDIENTE DE PROBAR — Fase A+B social (follow / privacidad)
Commits `96dc2bf` (BD) + `56efb33` (móvil). Estado: **aplicado, pendiente de verificación
manual en dispositivo**. Requiere 2 usuarios (usar `jcgarcia007@icloud.com` + una cuenta seed
`userNN@seed.jchat.test` / `SeedPass123!`). Pasos:
- Recargar Metro. Seguir a un usuario desde una lista de miembros de sala (UserActionSheet) →
  debe cambiar a "Siguiendo" (cuenta pública) o "Solicitado" (cuenta privada).
- Abrir FriendsScreen → ver 3 tabs (Seguidores / Siguiendo / Solicitudes).
- Poner la cuenta propia como privada (PrivacyScreen); que otro usuario pida seguir → aparece
  en Solicitudes → Aceptar/Rechazar.
- Bloquear a alguien → corta el follow en ambos sentidos.

### PENDIENTE DE PROBAR — Fix #6 (cobro de modificadores)
Commits `995fcbe` (server payments v11) + `85297c8` (cliente móvil). Estado: **aplicado,
pendiente de verificación manual en dispositivo**. Pasos:
- Recargar Metro (`npx expo start --dev-client --clear`).
- Pedir un ítem con tamaño (ej. "Doble +$5") y/o un extra desde el menú.
- Ir al checkout y confirmar que el total mostrado incluye los modificadores.
- Pagar con tarjeta de prueba `4242 4242 4242 4242`.
- Verificar en el dashboard de Stripe (test mode) que el monto **cobrado = base + tamaño +
  extras + tax** (antes solo cobraba la base).
- Requiere un ítem con `menu_items.options` (sistema legacy sizes/extras) configurado; si
  Bar XZX no tiene uno, crear un ítem de prueba con modificadores.
- Objetivo: confirmar que el usuario ve X y Stripe cobra X (sin discrepancia).

### PENDIENTE DE PROBAR — Fase D (gate de DM + bloqueo)
Commits `670e82e` (BD) + `c06fde7` (Send DM). Estado: **aplicado, pendiente de verificación
manual en dispositivo**. Requiere 2 usuarios. Pasos:
- Desde una lista de miembros de sala (UserActionSheet) → **Send DM** a un usuario que acepta DMs
  (`whoCanDMMe='everyone'`) → abre DMChat.
- Poner el receptor en `whoCanDMMe='followers'` (PrivacyScreen) y NO seguirlo → Send DM debe mostrar
  Alert "Debes seguir a este usuario…"; seguirlo → ya abre DMChat.
- Poner el receptor en `nobody` → Alert "no acepta mensajes directos" (salvo conversación previa).
- Enviar una foto en un DM → sube a `dm-media` (privado) y se ve vía signed URL.
- Bloquear al otro → la conversación desaparece de la lista (soft-hide); desbloquear → reaparece con historial.

### PENDIENTE DE PROBAR — Chat Fase 2 (purga TTL 24h)
Commit `c63479c` (migr 043). Estado: **aplicado y probado en BD (191→0); pendiente verificación
en app**. Pasos:
- Enviar mensajes a una sala; confirmar que a las +24h (o forzando el cron / `select
  purge_expired_messages()`) desaparecen al reabrir la sala.
- Anclar (pin) un mensaje viejo → NO debe borrarse.
- (Conocido/diferido) las **fotos** de mensajes purgados quedan huérfanas en `post-media` — GC vía
  Storage API pendiente (ver "What's next" + D-14).

---

## Estado de la base de datos (2026-07-22)
- **Migraciones aplicadas: hasta 086** (`086_promo_codes`, aplicada vía MCP; verificado vía Supabase MCP). Tras cada migración de schema, regenerar `web/lib/database.types.ts` (D-68).
- **Edge Functions desplegadas (8):** `payments` v39 (jwt=true) · `stripe-connect` v27 (jwt=true) · `stripe-webhook` v34 (jwt=false) · `subscriptions` v29 (jwt=false) · `delete-account` v14 (jwt=true) · `stripe-refund` v5 (jwt=true) · `tab-pay` v4 (jwt=false) · `guest-pay` v5 (jwt=false). El número de versión = conteo de despliegues (no atado a commits de git).

---

## Sesión 2026-07-13/14 (noche) — Reembolsos reales + auditoría de la nav del dashboard

### El hallazgo que lo desencadenó todo
Juan notó que el KDS **no tenía enlace en la barra lateral**. Tirando de ese hilo: **8 de las
22 páginas del dashboard estaban HUÉRFANAS** — construidas y funcionales (o no), pero
inalcanzables salvo escribiendo la URL a mano. Ningún cliente las encontraría.

### Cerrado
- **KDS enlazado** (`fa2eb95`). La pantalla que mira la cocina toda la noche era invisible.
- **`/dashboard/chat` era CÓDIGO MUERTO** (`c5413cd`): consultaba un `demo-business-id`
  hardcodeado, tenía un `PLAN_ROOM_LIMIT` en cliente (violaba D-42) y un toggle de
  "password protected" que NUNCA hasheaba nada. **1.521 líneas borradas.** Ahora la ruta sin
  `?room=` redirige a `/dashboard/chat-rooms` (la página buena). El camino vivo
  (`?room=<id>` → LiveChat, destino del botón "Open Chat") quedó intacto.
- **Reviews arreglada** (`3389cff` + migr 064 `e6adee3`): tenía un `DEMO_BUSINESS_ID`
  hardcodeado (la misma enfermedad). Y al arreglarlo salió un agujero mayor: **el dueño NO
  PODÍA responder**. La única política de UPDATE era `auth.uid() = user_id` (solo el autor),
  así que el UPDATE del dueño no matcheaba ninguna política → Postgres devolvía éxito con
  **0 filas y sin error** → la respuesta se perdía en silencio. Migración 064 añade la
  política del dueño + allow-list `(response, responded_at)`. Probado en vivo.
- **BACKEND DE REEMBOLSOS COMPLETO**:
  - EF **`stripe-refund` v1** (`178e1e5`): emite el reembolso REAL. Antes, el botón "Approve
    Refund" solo escribía `status='approved'` en la BD y **NO MOVÍA UN CENTAVO** — el dueño
    creía haber devuelto el dinero. Con `reverse_transfer` + `refund_application_fee` (D-53).
  - **`stripe-webhook` v24** (`4435b00`): escucha `refund.created`/`refund.updated`, NO
    `charge.refunded`. Dos motivos: (1) `charge.refunded` **ni siquiera estaba suscrito** en
    el endpoint → el handler nunca se habría ejecutado; (2) el endpoint serializa en
    `2026-05-27.dahlia` mientras la EF pinnea `2024-06-20`, y la lista anidada
    `charge.refunds` cambia de forma entre versiones (D-49 mordiendo de verdad). El objeto
    Refund es plano → inmune.
  - **Migración 065** (`115855f`) — **EL HALLAZGO MÁS GRAVE DEL DÍA**: `authenticated` Y `anon`
    tenían UPDATE sobre las 12 columnas de `disputes`, **incluida `refund_id`**. El guard
    anti-doble-reembolso de la EF (`if refund_id !== null`) era **decorativo**: el dueño podía
    poner `refund_id = null` vía PostgREST y re-disparar el reembolso (la idempotencyKey de
    Stripe expira a las 24h) → mismo pedido reembolsado en bucle, drenando el balance de la
    cuenta conectada; y con destination charges, el negativo lo cubre la PLATAFORMA. Ver D-54.
- **Migración 063** (`c00f861`): `profile-media` ya no se puede LISTAR (hallazgo del linter).
- **D-51** (`e276171`): `public_profiles` es SECURITY DEFINER A PROPÓSITO — es la capa entera
  de descubrimiento de perfiles. El ERROR del linter se acepta; la salvaguarda es una regla de
  proceso (toda columna nueva en la vista exige revisión de seguridad).
- **D-52** (`990a155`): en React Native, `instanceof` contra globals del navegador NO funciona
  (fetch polyfilleado) → duck-typing. El fix del 409 pasó tsc, se desplegó, y **no funcionaba
  en el device**. Solo el smoke lo destapó.
- **D-53 / D-54** (`2a82cae`): reembolsos y column grants.
- **`.p8` de Apple ROTADA**: key vieja `5HJZYQUV98` revocada, nueva creada, JWT regenerado y
  verificado con un login real en el iPhone. **DESCUBIERTO: la `.p8` NUNCA estuvo commiteada
  en el repo público** — verificado del lado del servidor (búsqueda de código: 0 resultados;
  `ef7c221` solo añade 5 líneas al `.gitignore`, cero borrados). La premisa que arrastrábamos
  era FALSA; `ef7c221` fue preventivo, no remedial. El `git filter-repo` se canceló.
  ⚠️ El client secret de Apple es un JWT que **CADUCA ~ENERO 2027**. Cuando caduque, el login
  con Apple se rompe EN SILENCIO. Regenerar con `generar-jwt.mjs` antes de esa fecha.
- **Smokes en device PASADOS**: (a) pagar en un negocio sin Connect muestra el mensaje real
  del servidor ("This business is not set up to accept payments yet", 409) en vez del genérico;
  (b) el KDS mueve un pedido de `confirmed` a `preparing` y persiste (migr 060 bien acotada).

### EL PATRÓN: controles que MIENTEN
La UI se construyó ANTES que las políticas de la BD, así que varios controles engañan al
usuario. Encontrados hoy:
1. Toggle "password protected" de salas — nunca hasheó nada (borrado con el código muerto).
2. "Approve Refund" de disputes — nunca reembolsaba (backend ya arreglado; falta la UI).
3. "Responder" de reviews — fallaba en silencio (ARREGLADO, migr 064).
4. `reportReview` — no hay política de RLS para reporters. **SIGUE ROTO.**
Regla: **antes de enlazar una pantalla a la nav, auditarla.** Una página huérfana puede estarlo
porque nadie la enlazó, o porque nunca se terminó.

### PENDIENTES — sesión 2026-07-13/14
🔴 1. **Frontend de `/dashboard/disputes`**: el botón "Approve Refund" sigue haciendo
   `UPDATE status='approved'` directo en vez de llamar a `stripe-refund`. **El reembolso NO se
   dispara desde la app.** Además usa `.single()` sobre `businesses` por `owner_id` → revienta
   con dueños de varios negocios (Juan tiene 5) y muestra las disputas de todos mezcladas.
   La página está HUÉRFANA, así que nadie puede llegar — no hay riesgo mientras siga así.
🟠 2. **Trigger de transición de `disputes.status`** (Opción A, elegida): un trigger que, si el
   escritor NO es service_role, solo permita `status → 'rejected'`. Hoy el dueño puede poner
   `status='refunded'` a mano sin reembolso real. La migr 065 cerró la parte de COLUMNAS; esto
   cierra la parte de VALOR.
🟠 3. **`refund_failed`**: estado nuevo para cuando Stripe reporta el refund como
   failed/canceled. Hoy la disputa se queda `open` (reintentable, no miente) → no urgente.
🟠 4. **Barrer TODAS las tablas** buscando el patrón de D-54 (grants de UPDATE de tabla
   completa a authenticated/anon). Solo se han revisado 3: orders, reviews, disputes.
🟠 5. **`reportReview` roto**: sin política de RLS para reporters.
🟠 6. **Analytics**: NO enlazar hasta arreglarla. Lee datos reales, pero el **Forecast es una
   regresión placeholder FALSA**, la pestaña de API genera **claves inventadas**, y el Loyalty
   ROI está clavado a 0. Es el argumento de venta del plan Pro. Decidir: implementarlo de
   verdad o QUITAR esas pestañas.
🟠 7. **Huérfanas restantes**: `billing` (va con la tanda de monetización), `create` (es un
   entry point desde un botón — correcto que no tenga item), `events` (SANA, pendiente de
   enlazar).
⚪ 8. **Leaked password protection**: BLOQUEADO por plan — requiere Supabase Pro ($25/mes). No
   es un agujero de la app; se activa cuando se suba de plan (que hará falta igualmente antes
   de lanzar).
⚪ 9. **Go-live de Stripe**: el endpoint de webhook actual vive en un **SANDBOX**. Al pasar a
   live hay que recrear TODOS los endpoints, sus eventos y sus secrets desde cero. Eventos a
   suscribir: `payment_intent.succeeded`, `payment_intent.payment_failed`,
   `payment_intent.canceled`, `refund.created`, `refund.updated` (+ `account.updated` en el
   endpoint de Connected accounts).
⚪ 10. **Rediseño dashboard 4A (diferido)** — ver [docs/design/dashboard-4a/STATUS.md](design/dashboard-4a/STATUS.md).

---

## Sesión 2026-07-13 — Auditoría Stripe + cierre de hallazgos (CERRADO)

**Auditoría de mejores prácticas de Stripe** contra la documentación oficial. Resultado: la
integración cumple lo importante (PaymentIntents legítimo para checkout propio, SetupIntents,
dynamic payment methods, apiVersion pinneada, idempotencia, destination charges sin mezclar
tipos, IDs en text, nunca PAN crudo). Dos deudas registradas (**D-48** Connect v1 con techo de
migración; **D-49** upgrade de API como tanda propia post-live) y un riesgo aceptado: con
destination charges la PLATAFORMA responde por disputas y el fee es neutro (D-35) → vigilar la
tasa de disputas.

**Decisiones D-40 a D-50** registradas en `docs/DECISIONS.md`.

**Cierres de hallazgos de la auditoría:**
- **#2 UX del 409 en móvil (`e8bd767`):** `mobile/services/stripe.ts` ya no se traga el body del
  error de las Edge Functions; el usuario ve el mensaje real del servidor ("This business is not
  set up to accept payments yet", etc.) en vez del genérico "Edge Function returned a non-2xx
  status code". PENDIENTE: smoke en device.
- **#3 Allow-list de columnas en `orders` (migr 060, `5ed3b67`):** el dueño ya NO puede hacer
  UPDATE de `total_cents`/`stripe_pi_id`/etc. de un pedido pagado. Único UPDATE de cliente:
  authenticated → (`status`, `status_updated_at`). anon sin UPDATE/DELETE/TRUNCATE. PENDIENTE:
  smoke del KDS en device.
- **#7 Gate SERVER-SIDE en `/super-admin` (`265aafb`):** el layout es ahora un server component
  que verifica `is_platform_admin()` y redirige. Capas: server gate → client gate (SuperAdminGate)
  → RLS. Fue por rama + preview (D-43).
- **Hallazgos #5, #7, #9 — CERRADO COMPLETO:**
  - **Buckets (migr 061, `ebf6c29`):** `profile-media` y `voice-notes` tenían `file_size_limit` y
    `allowed_mime_types` en NULL y SELECT abierto a anon sobre todo el bucket. Ahora: `profile-media`
    público con 10 MB + MIME de imagen; `voice-notes` PRIVADO (public=false) con 5 MB + MIME de audio;
    INSERT restringido a la carpeta del propio usuario (`(storage.foldername(name))[1] = auth.uid()`).
    Ambos buckets estaban vacíos → sin migración de datos.
  - **Límite de empleados (migr 062, `576b04b`):** era solo del cliente (violaba D-42). Ahora trigger
    BEFORE INSERT en `employees`: business = 10, pro = 50, platform admins exentos. Probado en vivo:
    el insert 11 falla con el mensaje del límite, cero residuo.
  - **`public_profiles`:** VERIFICADA, sin fugas. Expone solo id, username, display_name, avatar_url,
    bio, profile_theme_id, is_verified, is_private, created_at.

### PENDIENTES — por prioridad (2026-07-13)
🔴 1. **REVOCAR la `.p8` de Apple** (`AuthKey_5HJZYQUV98.p8`). Estuvo físicamente en la raíz de un
   repo PÚBLICO. Ya gitignoreada, pero la clave está COMPROMETIDA. Apple Developer → Keys → revocar
   → nueva → regenerar JWT → actualizar en Supabase. Además: purgar el archivo del historial de git
   (gitignorear no des-expone lo ya pusheado).
🔴 2. **PRODUCTO — República Dominicana:** Stripe Connect NO opera en RD. Hay un negocio con
   `country='DO'` (Bistró Flambeau) que no puede conectar Stripe; el gate de payments lo rechaza
   correctamente. Decidir: (a) lanzar en USA con pagos y RD solo capa social, (b) procesador local
   (Azul/CardNet) detrás de una interfaz, (c) aparcar RD.
🟠 3. **TWILIO:** los 3 secrets existen → el kill-switch de `/api/verify` NO salta, pero el envío de
   SMS sigue comentado (TODO). El usuario nunca recibe el código: flujo roto en silencio. DECIDIR:
   conectar Twilio de verdad, o ELIMINAR el paso de SMS (la verificación ya la hace el super_admin a
   mano). OJO: `/api/verify` es Next.js en VERCEL, lee `process.env` de Vercel, no de Supabase.
🟠 4. **Leaked password protection:** DESACTIVADO. Supabase → Auth → Policies. 30 segundos.
🟠 5. **SMTP propio (Resend/SendGrid) ANTES de activar "Confirm email".** El SMTP de Supabase limita
   a 2 emails/hora → el 3er registro de la hora no recibe su correo. Subir el número no sirve; hay que
   poner SMTP propio.
🟠 6. **Smokes en device pendientes:** (a) mensaje del 409 al intentar pagar en un negocio sin Connect;
   (b) cambio de estado de un pedido en el KDS (tras la allow-list de migr 060).
⚪ 7. **Purga de datos:** `pending_order_carts` huérfanos (PIs abandonados) y `processed_stripe_events`
   (crece para siempre y NO tiene `created_at` → no se puede purgar por antigüedad; requiere un ALTER).
   Ojo **D-50**: el purge de binarios en Storage NO se puede hacer con pg_cron SQL (Supabase bloquea
   DELETE en `storage.objects`) → Edge Function con Storage API.
⚪ 8. **Stripe sigue en TEST.** Pasar a live = rotar claves + REDESPLEGAR las 4 EF + nuevos webhook
   secrets (los DOS endpoints) + recorrer el Go-Live Checklist de Stripe.
⚪ 9. **Commitear** `docs/PLAN_SEGURIDAD_2026.md` y `docs/PLAN_i18n.md` (solo viven en el Mac).
⚪ 10. **`app.config.ts`** no declara `usesAppleSignIn:true` → EAS intenta APAGAR Sign in with Apple en
   cada build. Workaround actual: `EXPO_NO_CAPABILITY_SYNC=1`.

### Camino al MVP (estimación 2026-07-13)
Restante: ~150–210 h de trabajo efectivo (~2 meses a ~25 h/semana). Bloques grandes: monetización
(pricing page, trial 30 días, límites de plan server-side, promo codes, ~20–30 h); checkout invitado
web D-37 (~12–16 h, el backend ya lo soporta); i18n ES/EN (~20–30 h); bugs conocidos + device testing
(~35–50 h); lanzamiento: Stripe live, builds EAS, assets de stores, review de Apple (~15–25 h).
NOTA: no existe ningún usuario con `plan='business'` en la BD (solo 'pro' y 'regular') → el tier de $49
nunca se ha ejercitado end-to-end. Probarlo en la tanda de monetización.

---

## Sesión 2026-07-12 — Seguridad, Stripe Connect, CAPTCHA + CSP (CERRADO)

- **CAPTCHA hCaptcha (D-38):** móvil + web, EN PRODUCCIÓN. Modo 99.9% Passive, hosts jchat.cloud +
  www.jchat.cloud. Secret solo en Supabase → Attack Protection.
- **CSP en ENFORCE en producción (hallazgo #8).** Añadidos m.stripe.network, q.stripe.com,
  fonts.googleapis.com, fonts.gstatic.com, hcaptcha.
- **Rate limit anónimo 30 → 300/h (D-39).**
- **Tanda S1 de seguridad (4 bloqueantes):** `/api/verify` blindada (JWT + ownership, `__dev_code`
  eliminado, ya no toca `businesses.status`), deny_all en `pending_order_carts`,
  `business_verifications` read-only para el dueño, REVOKE EXECUTE de `handle_new_auth_user`/
  `derive_username`.
- **Verificación de negocios por super_admin** en `/super-admin/verification`, con trazabilidad
  (`businesses.verified_by` / `verified_at`). RPC único: `admin_set_business_status(uuid,text)`,
  gateado con `is_platform_admin()`.
- **6 fallos de Stripe Connect arreglados:** `payments` exige `status='verified'` +
  `stripe_account_id` + `charges_enabled` (antes el 100% del dinero iba a la plataforma);
  `business_type` ya no hardcodeado; `country` desde `businesses.country`; URLs de retorno a
  jchat.cloud; columnas `stripe_charges_enabled`/`payouts_enabled`/`details_submitted` (migr 058);
  webhook `account.updated` con DOS endpoints y DOS secrets.
- **BUG CRÍTICO resuelto:** el webhook insertaba `orders.contact_email`/`contact_phone`, columnas
  que no existían → 500 → pago cobrado sin orden creada. Migración 059 añadió las columnas. La orden
  perdida (`pi_3TsVdbBiS0nTrsOC1Db9TKAk`) se recuperó con un Resend del evento en Stripe y quedó
  VERIFICADA en la BD: order `a232b0cf`, confirmed, $27.06, subtotal 2200 + tax 176 + tip 330 = 2706,
  1 item, `pending_order_carts` consumido. Origen del bug → D-47.

---

## Sesión 2026-07-11 — Device testing (EAS dev-client) + fixes en cadena

Build EAS dev-client en iPhone de Juan. Se probaron los flujos reales y salieron VARIOS
bugs que solo se ven en device. Todos auditados (get_commit full_patch) y pusheados a
origin/main.

**Bugs de device testing resueltos:**
- `3eef6e2` (migración 048, aplicada vía MCP): trigger `on_auth_user_created` auto-crea
  `public.users` al registrarse (OAuth + email). Deriva username del email local-part /
  nombre de Google, editable luego. Backfill del huérfano OAuth. CAUSA: OAuth no pasaba por
  RegisterStep2 → sin fila en public.users → fallaba enviar mensajes.
- `589fdde`: nombres del chat vía `public_profiles` (la RLS de `users` es own-row+admin y
  bloqueaba el embedded join `sender:users!fkey`). El chat resuelve nombres batch desde
  public_profiles + cache + realtime async.
- `c7581fa`: subida de foto de perfil (avatar/cover). CAUSA: EditProfileScreen tenía su
  propia `uploadImage` con `fetch().blob()` (rompe en RN/Hermes, sube 0 bytes). Fix: usar
  la `uploadImage` de `services/storage.ts` (expo-file-system/legacy + base64-arraybuffer),
  la misma que ya funcionaba en el chat.
- `3aa9e38`: avatares en mensajes del chat (faltaba `avatar_url` en el batch a
  public_profiles → sender_avatar vacío).
- `7bcc661`: avatares en la fila de presencia. CAUSA: usePresenceChannels emite el avatar
  desde `user.user_metadata.avatar_url`, no desde public.users. Fix: EditProfileScreen
  ahora sincroniza `supabase.auth.updateUser({ data: { avatar_url } })` al guardar.
- `6a0b055`: customizador de menú no abría en móvil. CAUSA: ProductRow decidía abrir el
  detalle con `options.sizes` (sistema viejo), pero los ítems usan grupos de modificadores
  (migraciones 030-032). Fix: `services/menu` trae `has_modifiers` (embedded count de
  `menu_item_modifier_groups`), ProductRow abre el detalle con `has_modifiers || sizes`, y
  la fila entera es tappable (paridad con web).

**Feature UX — tarjeta rápida de usuario (quick card):**
- `f807355`: tap en avatar/nombre de un mensaje abre una tarjeta compacta ANCLADA al avatar
  (measureInWindow + flip arriba/abajo + piquito), fondo opaco, 6 acciones en grid (Perfil,
  DM, Seguir, Silenciar, Reportar, Bloquear). Silenciar delega al UserActionSheet grande
  (que conserva duración de mute + moderación de dueño) vía onOpenFull.
- `c73844f`: quitado el long-press del avatar/nombre de mensajes (tap-only).
- `d93f164`: la fila de presencia (ChatTopBar) también abre la quick card con tap (mismo
  handler); se eliminó `handleUserLongPress` (ya sin uso).

**Biometría:**
- `2b31f27`: prompt de enrolamiento biométrico post-login (una vez, tras el primer login de
  cualquier método; texto adaptativo Face ID/Touch ID/huella) + botón Face ID del login solo
  visible si el lock está activado (opt-in). Reusa el flag `@jchat/biometric_enabled` de M2.

**Config OAuth (acciones en Supabase/Google, no código):** el provider Google en Supabase
tenía el Client Secret VACÍO → "missing OAuth secret"; tras poner el secret, "Unable to
exchange external code" por mismatch → regenerado el Client Secret del Web Client
(257672140298-rbeq5...) en Google Cloud y pegado en Supabase. Google login OK.

**Resultados device testing (PASÓ):** M4 Apple login, M1 Google login, chat (envío +
nombres + avatares de ambas cuentas + presencia), mapa + venues (Apple Maps M3), quick card
(mensajes + presencia), subida de foto (perfil + chat + presencia), menú (6 categorías, 19
ítems, add-to-cart).

**Pendiente de probar en device:** M2 biometría (toggle + prompt + lock — estaba bloqueado
por bundle viejo, ya debería andar), cambio de idioma ES/EN, menú customizador (6a0b055,
recargar y confirmar), borrado de cuenta M6 (cuenta desechable).

**Pendiente de Juan (no código):** revocar/regenerar el .p8 de Apple (expuesto en sesión
anterior), decisión de native sign-in, confirmar `eas update:configure`.

### Parte 2 — Paridad de menú, cadena de pagos y crashes de realtime

**Menú móvil a la par de la web:**
- `f543937`: ProductDetail pasa a `presentation: 'modal'` (entra desde abajo, paridad web).
  (Su intento de scroll por categoría con `scrollToLocation` FALLÓ en device — superado por a883048.)
- `a883048`: scroll por categoría FIABLE — se reemplazó SectionList por ScrollView; cada
  sección es hijo DIRECTO del ScrollView y registra su Y absoluta vía `onLayout` en
  `sectionOffsets`; `scrollToCategory` hace `scrollTo({y})`. Tab activa vía `onScroll`.
  CAUSA del fallo previo: `SectionList.scrollToLocation` + `ListHeaderComponent` +
  sticky headers no movía la lista en absoluto. Trade-off aceptado: se pierden los
  headers de sección pegajosos.
- `1683b95` (TANDA A): grupos de modificadores en el customizador móvil.
  `services/menu`: tipos `ModifierGroup`/`ModifierChoice` + `getItemModifierGroups()`
  (embedded desde `menu_item_modifier_groups`). `ProductDetailScreen`: single=radio /
  multi=checkbox respetando `min_select`/`max_select`, validación de requeridos
  (bloquea "Añadir"), precio dinámico. `CartContext`: `CartModifierSelection` +
  `CartLine.modifierSelections`; `makeLineId` incluye los modificadores (configs
  distintas del mismo ítem = líneas separadas).
- `88a8589`: tipo de pedido por defecto = 'table'; card de 'gift' OCULTA (la lógica del
  gift picker y el type 'gift' se conservan inertes → reactivable restaurando la card).

**Número de mesa en el pedido (cadena completa):**
- `1eee04d` + **migración 049 (APLICADA vía MCP)**: `orders.table_label` (text, ≤40 chars).
  La cadena: CartContext → CartScreen (input obligatorio si order_type='table') →
  CheckoutScreen → `services/stripe` → EF `payments` (sanitiza, mete en metadata del
  PaymentIntent) → EF `stripe-webhook` (lee metadata → INSERT en orders).
  CLAVE: las órdenes las crea el SERVIDOR (webhook, service_role — migración 033), NUNCA
  el móvil en producción. Cualquier campo nuevo de orden debe atravesar TODA la cadena.

**Fixes de realtime (crashes en device):**
- `c8e0836`: "cannot add postgres_changes callbacks after subscribe()" al volver del
  checkout. CAUSA: `supabase.channel(topic)` DEVUELVE el canal existente si el topic se
  repite; `removeChannel` es async, así que un remonte rápido reutiliza el canal ya
  suscrito y `.on()` lanza. FIX: topic ÚNICO por suscripción en PinnedBanner y
  ChatRoomScreen (el `filter` del `.on()` hace el scoping real, no el topic).
- `0b593ad`: mismo crash en PRESENCIA. La presencia NO puede usar topic único (todos los
  dispositivos deben compartir `presence:${roomId}` para verse). FIX: `subscribePresence`
  es ahora async — purga los canales stale del mismo topic y AWAITa su `removeChannel`
  antes de crear el nuevo. Ambos efectos corren en IIFE async con guard `cancelled`.

**Pagos — idempotencia:**
- `e1e02aa`: StripeIdempotencyError en device. CAUSA: la EF derivaba la clave del carrito
  (`pi:user:business:total:itemsFingerprint`) → totalmente determinista, así que un cliente
  repitiendo un pedido IDÉNTICO (mismo total) reusaba la clave con parámetros distintos →
  Stripe 400. En producción BLOQUEARÍA pedir dos veces lo mismo.
  FIX: el cliente genera una clave fresca por intento (`makeIdempotencyKey`) enviada en
  `body.idempotency_key`; la EF la valida (`[A-Za-z0-9_-]{8,64}`) y la namespacea con el
  usuario verificado por JWT (fallback `crypto.randomUUID()`).
  VERIFICADO con datos: dos órdenes con total idéntico (1782, mesa 5) creadas sin error.

**INFRAESTRUCTURA (fuera de git — NO PERDER):**
- Migración **049 aplicada** vía Supabase MCP.
- Edge Functions **`payments` y `stripe-webhook` DESPLEGADAS** (payments quedó en v17).
- Secretos de Supabase configurados: **`STRIPE_SECRET_KEY`** y **`EXPO_PUBLIC_STRIPE_PK`**
  (llaves de TEST de Stripe). Sin `STRIPE_SECRET_KEY` la EF hace `throw` → 500 y el móvil
  no recibe la publishable key → "no puedo agregar la tarjeta".
- RECORDATORIO: **tras cambiar secretos hay que REDESPLEGAR** la Edge Function.

**HITO — flujo de compra completo verificado end-to-end por primera vez:**
menú → customizador con modificadores → carrito → mesa → Stripe (tarjeta test 4242) →
webhook → orden en la BD con impuesto (8%) y propina. 6 órdenes reales creadas.

**Estado de Bar XZX:** `stripe_account_id = NULL` (sin onboarding de Stripe Connect). La EF
lo maneja (`if (stripeAccountId)`) → cobra sin destination charges. Pendiente onboardear
Connect para que el negocio reciba el dinero.

### Parte 3 — TANDA C: cobro de modificadores — RESUELTO ✅

`4ea3d00` + **migración 050 (APLICADA)** + ambas Edge Functions REDESPLEGADAS.

**El bug (dinero):** la app mostraba el precio con modificadores (Alitas BBQ $23) pero se
cobraba solo el precio base ($14). CAUSA: CheckoutScreen enviaba únicamente
`options: { size, extras }` (sistema legacy); las `modifierSelections` (Tanda A) nunca
llegaban al servidor, y la EF sumaba $0 por modificadores.

**El segundo bug (latente, descubierto al diseñar el fix):** el webhook armaba los
`order_items` desde `paymentIntent.metadata.items`, que Stripe capa a 500 chars (la EF corta
a 490). Al añadir los modificadores, un carrito real desborda → JSON truncado → el webhook no
puede parsear → **orden SIN ÍTEMS, en silencio**. Arreglar solo el cobro habría cambiado un
fallo silencioso por otro.

**La solución (ambos a la vez):**
1. `CheckoutScreen` envía las selecciones como `options.modifiers = [{ g: groupId, c: [label] }]`
   — SOLO ids y etiquetas, NUNCA precios (ambos paths: real y demo).
2. EF `payments`: batch-fetch de `menu_item_modifier_groups` para todos los ítems; nueva
   `resolveGroupModifierCents()` precia cada selección desde `modifier_groups.choices` EN LA BD.
   Rechaza (400) grupos no vinculados al ítem y etiquetas de choice inexistentes.
   `lineUnitCents = base(BD) + legacy size/extras(BD) + grupos(BD)`. El `price_cents` del
   cliente se sigue ignorando.
3. **Migración 050 — `pending_order_carts`** (payment_intent_id PK, business_id, user_id,
   items jsonb). RLS ON **sin políticas** → solo `service_role`. La EF `payments` guarda ahí
   el carrito RESUELTO POR EL SERVIDOR (precios de BD + etiquetas verificadas) tras crear el
   PaymentIntent.
4. EF `stripe-webhook`: lee `pending_order_carts` por PI id para construir `order_items`
   (sin límite de tamaño); cae a la metadata para PIs viejos; borra la fila después.

**VERIFICADO con datos reales (orden 2026-07-12 00:08):**
- `order_items.price_cents` = **2300** (base 1400 + 900 de modificadores) — antes cobraba 1400.
- `order_items.options.modifiers` = ["8 piezas","BBQ","Suave","Ranch","Papas a la francesa",
  "Aros de cebolla","Dip extra"] — etiquetas verificadas por el servidor (lo que ve la cocina).
- Cuadre: 2300 × 2 = subtotal 4600 → impuesto 368 (8%) → propina 690 → total 5658.
- Esas 7 etiquetas habrían desbordado los 500 chars de la metadata → `pending_order_carts`
  fue lo que permitió que los ítems llegaran completos.

### Parte 4 — Auditoría de seguridad: P0-2 y P0-3 RESUELTOS ✅ + hallazgo nuevo

**P0-2 (recálculo de totales server-side) — RESUELTO.** La EF `payments` recalcula todo desde
la BD: `amount: serverTotalCents` ("client total_cents is ignored"); subtotal desde precios de
BD (base + modificadores), impuesto desde `businesses.tax_rate`, descuento forzado a 0. Lo
único del cliente es `tip_cents`, validado y capado al 200% del subtotal del servidor. La
metadata se escribe con valores del SERVIDOR y el webhook lee de ahí. Además, `orders` NO
tiene política de INSERT → el cliente no puede crear órdenes con montos inventados
(migración 033). EVIDENCIA: impuesto = 8% exacto sobre el subtotal del servidor; los
modificadores se precian desde `modifier_groups.choices` (Tanda C).

**P0-3 (Edge Functions confían en IDs del cliente) — RESUELTO.** Las CUATRO EF verifican el
JWT (`verifyCaller`). Las que actúan sobre un negocio comprueban PROPIEDAD antes de nada
(`assertOwnerOrAdmin` → 403 "not the owner of this business"): en `stripe-connect` está en el
ROUTER, antes del switch (cubre las 3 acciones); en `subscriptions`, dentro de
`create_checkout`. `body.user_id` nunca se usa para auth ni consultas — solo como traza.

**🔴 HALLAZGO NUEVO (cerrado en migración 051):** `order_items` tenía una política que permitía
al CLIENTE insertar ítems en su propia orden ya pagada → la cocina los prepararía gratis. El
total estaba protegido, los ítems no. Política eliminada (051). El webhook usa service_role
(salta RLS) → no se rompe nada.

### Parte 5 — Web a la par, Stripe Connect operativo, y decisiones de negocio

**Paridad web (el móvil iba por delante — se invirtió el patrón):**
- `ce9c37c`: portados a web los 2 fixes de canales realtime (topic único en postgres_changes;
  purgar+AWAITar el canal stale en presencia, que DEBE mantener topic compartido).
- `6f89b64`: **BUG REAL, invisible para el dueño.** El chat web resolvía el remitente con un
  join embebido `users(...)`, bloqueado por RLS (`users` = fila propia + platform admin).
  Juan veía los nombres SOLO porque es super_admin; un usuario normal veía "Usuario" en todos
  los mensajes. Fix: leer de `public_profiles` (como móvil) + renderizar avatar en las burbujas.
  El incógnito NO filtra su foto real (senderAvatar = null si incognito).
- `f77e2df`: el botón "Menú" del panel "+" del chat web estaba deshabilitado ("pronto") →
  ahora abre `/m/[slug]` (slug leído de `businesses`, que es public-read).

**Stripe Connect — OPERATIVO (el negocio ya recibe el dinero):**
- `d50e802`: página `/dashboard/payments` (era un placeholder "coming in Task 3.6") → UI de
  onboarding que llama a la EF `stripe-connect` (get_account_status / create_connect_account /
  create_login_link). 5 estados. El estado real SIEMPRE viene de get_account_status, nunca del
  query param.
- `99aa98c`: **BUG.** La página (y `billing`) usaban `.maybeSingle()` sobre `owner_id` →
  PostgREST ERROR con múltiples filas. Juan tiene **5 negocios** (y el plan Pro permite 10).
  Fix: cargar TODOS los negocios + selector (solo si hay >1).
- `48093fa`: **BUG DE CORS.** Las EF declaraban `Access-Control-Allow-Headers:
  "Content-Type, Authorization"`, pero supabase-js SIEMPRE envía `apikey` + `x-client-info`
  → el navegador BLOQUEABA el POST tras el preflight (los logs solo mostraban `OPTIONS 204`).
  `payments` no lo sufría porque solo la llamaba el MÓVIL (las apps nativas no aplican CORS).
  Fix en las 3 EF: `"authorization, x-client-info, apikey, content-type"` (+ stripe-signature
  en subscriptions).

**Infraestructura (fuera de git — NO PERDER):**
- Secretos Supabase: `CONNECT_RETURN_URL` / `CONNECT_REFRESH_URL` → `https://jchat.cloud/dashboard/payments?connect=success|refresh`
  (el fallback del código apuntaba a `jchat.app`, que NO es de Juan).
- `PLATFORM_FEE_PERCENT="2.9"` / `PLATFORM_FEE_FIXED_CENTS="30"` (ver D-35).
- EF desplegadas: `stripe-connect`, `payments`, `subscriptions`, `stripe-webhook`.
- **Dominio de producción: `jchat.cloud`** (Vercel; también www.jchat.cloud, jchat-3.vercel.app).

**VERIFICADO end-to-end con dinero real (test mode):**
Bar XZX conectado → `stripe_account_id = acct_1TsFZ2BnfRF5wjlh`. Pago de $39.36 desde móvil:
Stripe muestra `Connected account: acct_1TsFZ2Bn…`, `Application fee: $1.44`,
`Net amount: $37.92` → **el dinero LLEGA al negocio**. Cuadra al centavo con lo calculado.
Los otros 4 negocios de Juan siguen sin conectar (cada uno tiene su propia cuenta).

### PENDIENTES (actualizado 2026-07-11 parte 5)

> ✅ RESUELTO (Parte 3, `4ea3d00`): el bloqueante 🔴 "los modificadores no se cobran" quedó
> arreglado — cobro server-side desde `modifier_groups.choices` + carrito en
> `pending_order_carts`. Ver Parte 3 arriba.

**🔴 BLOQUEANTE DE PRODUCCIÓN — CAPTCHA (próxima sesión, decidido: hCaptcha):**
Hay que implementarlo en WEB + MÓVIL antes de lanzar. Es global en Supabase, así que activarlo
sin el móvil rompe el login. Plan:
1. Juan: cuenta hCaptcha → Sitekey (público) + Secret key.
2. Supabase Dashboard → Authentication → Bot and Abuse Protection → Enable CAPTCHA →
   provider hCaptcha → pegar Secret key. (NO activar hasta que el móvil esté listo.)
3. Móvil: `@hcaptcha/react-native-hcaptcha` (+ peers `react-native-modal`,
   `react-native-webview`). ⚠️ **REQUIERE BUILD NATIVO NUEVO** (no OTA). Tocar login/registro
   por email+contraseña. OAuth (Google/Apple) NO necesita captcha (redirige al proveedor).
4. Web: `@hcaptcha/react-hcaptcha` en login, registro, reset y checkout de invitado.
5. Pasar el token: `supabase.auth.signUp/signInWithPassword/signInAnonymously({ options: { captchaToken } })`.
6. Rate limit: SUBIRLO a ~300/h (NO bajarlo — ver D-39).

**🔴 CHECKOUT DE INVITADO (diseñado, NO implementado) — ver D-37.** Plan en 2 tandas:
- **Tanda 1 (backend):** migración `orders.contact_email` + `contact_phone`; arreglar el trigger
  `handle_new_auth_user` para invitados anónimos (username derivado del UUID, sin bucle de
  dedupe); EF `payments` acepta y sanitiza el contacto → metadata + `receipt_email`;
  EF `stripe-webhook` lo inserta en orders; **cron diario** que borre invitados anónimos SIN
  pedidos de más de 7 días (los que SÍ pidieron se conservan: registro financiero + reembolsos).
- **Tanda 2 (web):** instalar `@stripe/stripe-js` + `@stripe/react-stripe-js` (la web solo tiene
  el SDK de SERVIDOR); en `MenuPageClient`: anonymous sign-in al pagar, paso de contacto
  (email/teléfono opcionales + aviso), Stripe Elements, llamar a la EF `payments`, confirmar.
  El carrito web YA guarda los modificadores como `{groupId, choices}` → mapea directo al
  `{g, c}` que espera la EF.
DATOS CLAVE: `orders.user_id` es **NOT NULL** → toda orden necesita un usuario real (por eso
la auth anónima). El menú web `/m/[slug]` es HOY completamente público (sin auth).

**⚠️ BUG — borrar un usuario con pedidos FALLA.** `orders.user_id` es NOT NULL pero la FK es
`ON DELETE SET NULL` → se contradicen: el DELETE revienta. Esto significa que la función de
**eliminar cuenta (M6) FALLARÍA** para cualquier usuario que haya pedido algo. REVISAR.

**⚠️ El dashboard necesita un SELECTOR GLOBAL de negocio.** `billing/page.tsx` sigue usando
`.maybeSingle()` → roto para dueños con varios negocios. El plan Pro (10 negocios) no es usable
sin esto. Tanda propia.

**⚠️ Stripe NO opera en República Dominicana.** Un negocio dominicano NO puede conectarse a
Stripe Connect. Como el mercado objetivo es US + RD, hay que resolverlo a nivel de producto
(otro procesador para RD, o lanzar solo en US primero).

**Otros pendientes:**
- Purga de `pending_order_carts`: las filas de PIs abandonados (pago no completado) quedan
  huérfanas. Falta un job/cron que borre las de más de unos días.
- Pantalla de Cart: no muestra el desglose de modificadores por línea (se guardan, pero no
  se listan).
- `UserProfileScreen` (ver perfil de OTRO usuario) NO EXISTE — el botón "Perfil" de la quick
  card solo muestra un Alert placeholder.
- D-27: plantillas de menú en móvil (`businesses.menu_template_id` — hoy solo la web las
  respeta).
- Stripe Connect: Bar XZX YA conectado (Parte 5); los otros 4 negocios de Juan siguen sin
  `stripe_account_id` → onboarding pendiente por cada uno.
- Pruebas de device pendientes: biometría (toggle/prompt/lock), cambio de idioma ES/EN,
  borrado de cuenta (M6).
- `mobile/eas.json`: reformat del linter sin commitear en el working tree.
- Revocar/regenerar la .p8 de Apple (expuesta en sesión anterior).

---

## Sesión 2026-07-08 — completado

### Seguridad de pagos — CERRADA COMPLETA (P0 + P1 integridad)
- **Tanda 1 (P0):** `orders` solo por webhook (migr 033/035) + columnas financieras de
  `businesses` protegidas (034/036, revoke + allow-list) + RPC `admin_set_business_status`.
  Verificado en BD.
- **Tanda 2 (P0):** `stripe-connect` verifica propiedad/IDOR (verifyCaller + assertOwnerOrAdmin,
  v9) + `subscriptions.create_checkout` autentica en el path app (v10→v11). Verificado (anónimo → 401).
- **Tanda 3 (P1 integridad):** #8 `UNIQUE` parcial `orders.stripe_pi_id` (migr 037) · #9 proteger
  `businesses.is_verified` (038) · #7 JWT en `payments` `ensure_customer`/`create_setup_intent`
  (v10) · #5 idempotencia de webhooks insert-first + delete-on-error (039 + `stripe-webhook` v9 +
  `subscriptions` v11). Verificado en BD (helpers, RPCs, índice parcial, tabla `processed_stripe_events`).
- **Fix #6 modificadores:** server `payments` v11 recalcula size/extras desde
  `menu_items.options` (995fcbe) + cliente envía labels (85297c8). **PENDIENTE prueba manual
  móvil** (anotada arriba).
- **Estado funciones Edge:** `payments` v11 (jwt=true) · `stripe-connect` v9 (jwt=true) ·
  `stripe-webhook` v9 (jwt=false) · `subscriptions` v11 (jwt=false).

### Sistema social (Stage 1, estilo Instagram) — Fases A+B+C aplicadas
- **Plan maestro** completo en `docs/PLAN_MAESTRO_SOCIAL.md` (6 decisiones cerradas, D-13 en
  DECISIONS.md). Hallazgo clave: el social estaba **~70% andamiado pero SIN aplicar** (RLS de
  lectura en `true`); el trabajo fue aplicar privacidad + cablear, no reconstruir.
- **Fase A+B** (BD `96dc2bf` + móvil `56efb33`): columna `users.is_private`; helpers SECURITY
  DEFINER `is_blocked` / `can_view_profile` / `can_view_user_content`; 5 RPCs
  `request_or_follow` / `accept_follow_request` / `remove_follower` / `block_user` /
  `unblock_user`; RLS de `follows` aplica privacidad; servicios `follows.ts` / `blocks.ts`;
  `FriendsScreen` reconstruida (3 tabs: Seguidores/Siguiendo/Solicitudes); botón seguir con
  estado (público→Siguiendo / privado→Solicitado) en `useFollowSystem` + `UserActionSheet`.
  Verificado en BD. **PENDIENTE prueba manual móvil** (anotada arriba).
- **Fase C** (`2dbc46b`, migr 041): bucket **`profile-media`** (público) separado del
  **`post-media`** efímero del chat; `posts.ts:uploadPostMedia` repuntado; RLS `posts_read` /
  `comments_read` / `post_likes_read` pasan de `true` a aplicar `whoSeesMyPosts` + bloqueo
  (via `can_view_user_content`). Write policies intactas. Verificado en BD.

### Fase D — gate de DM + bloqueo soft-hide + bucket dm-media (aplicada)
- **BD+móvil `670e82e`** + **cableado Send DM `c06fde7`**: RPC `start_dm` (SECURITY DEFINER) aplica
  el gate `whoCanDMMe` (everyone/followers/nobody) + bloqueo antes de crear la conversación; RLS de
  `dm_conversations`/`dm_messages` reescrita con **soft-hide** de bloqueados (no borra, reaparece al
  desbloquear) + INSERT deny-by-default (solo el RPC crea). Bucket **`dm-media` privado** (upload +
  signed URLs). "Send DM" (UserActionSheet→ChatRoom) navega a DMChat vía `getOrCreateConversation`/
  `start_dm`, con `DmGateError`→Alert. Verificado en BD. **PENDIENTE prueba manual móvil** (anotada arriba).

### Chat Fase 2 — purga TTL 24h de mensajes de sala (aplicada)
- **`c63479c`, migr 043**: `pg_cron` (1.6.4) + función `purge_expired_messages()` cada 15 min borra
  mensajes de sala con +24h (excluye anclados; `reply_to`→SET NULL). Probada en vivo: **191→0 mensajes**.
  **Fotos DIFERIDAS (Option C)**: Supabase bloquea el `DELETE` directo sobre `storage.objects`
  (`protect_delete`), así que el borrado de binarios se omite con gracia (log + continúa) — quedan
  huérfanos en `post-media` hasta una limpieza vía Storage API. Ver D-14.

**Otros (housekeeping):** ESLint Tanda A (`f129184`, 73→47 avisos); docs de diseño creados
(`DIAGNOSTICO_TTL_CHAT.md`, `DISENO_FIX_INTEGRIDAD_PAGOS.md`, `PLAN_MAESTRO_SOCIAL.md`).

---

## Estado julio 2026 — completado

### Sistema de menús (web) — COMPLETO
- 21 plantillas de menú portadas a React (arquetipos del board + classic).
- 40 paletas de color aplicables por negocio (menu_palette_id, migración 034) + botón "volver a original"; tipografía fija (Playfair/Space Grotesk); colorPalettes.ts en templates/shared/.
- Paletas originales del board por plantilla (MENU_PALETTES); modales/sheets heredan la paleta activa.
- Responsive: shell columna centrada max-width 480px (transform device-frame); carritos unificados IconShoppingCart; sheets vía createPortal.
- Selector dashboard colapsable (plantilla/paleta/efecto); sheet recogida "En mi mesa" primero.

### Sistema de chat (web + iOS + Android)
- Sub-chats: navegación in-place entre salas del negocio (query por business_id, gate can_access_room, candado+password verify_room_password).
- Presencia múltiple: main permanente + ancla del QR permanente + subchat visitado rotativo (hook usePresenceChannels en móvil, con AppState re-track al foreground).
- Scroll robusto: web (aspect-ratio en fotos guardando dims en metadata + re-scroll onLoad) y móvil (FlatList inverted, eliminó timers).
- Fixes de envío: foto iOS baja tras picker, web texto/foto baja (doble rAF), teclado/zoom web iOS (input font-size 16px), Android galería legacy:true + try/catch cámara.
- Visor de imágenes: web (lightbox portal, X en esquina de imagen, cierra click-fuera/Esc/X, zoom doble-clic) + móvil (react-native-image-viewing, pinch-zoom, X con safe-area, swipe-to-close).

### Seguridad de tipos (web + móvil)
- `ignoreBuildErrors` + `eslint.ignoreDuringBuilds` **removidos** de `web/next.config.ts`.
- Los 33+ errores de tsc arreglados (lotes 1-3 + cierre). **Web y móvil en 0 errores de tipo**; `next build` con type-check real. `database.types.ts` sano (sin la corrupción del wrapper JSON).

### Seguridad de pagos — los 4 huecos P0 CERRADOS (Tandas 1+2)
- **P0-2 / orders:** solo el webhook (service_role) crea órdenes (migr. 033, drop policy customer insert + revoke insert); orders UPDATE owner-only (035). El PaymentIntent ya recalculaba server-side.
- **Columnas financieras de businesses:** `plan/tax_rate/stripe_account_id/status/owner_id` ya no escribibles por el cliente (migr. 034/036, revoke + grant allow-list de 40 cols) + RPC `admin_set_business_status` para super-admin.
- **P0-3 / Edge Functions:** `stripe-connect` verifica propiedad (verifyCaller + assertOwnerOrAdmin, v9); `subscriptions.create_checkout` autentica+autoriza en el path app (Opción B, webhook intacto). Verificado en vivo: llamadas anónimas → 401.
- **P1 de integridad — TAMBIÉN CERRADOS (Tanda 3, 2026-07-08):** idempotencia de webhooks (039), modificadores recalculados (Fix #6), UNIQUE en orders.stripe_pi_id (037), is_verified protegido (038), JWT en ensure_customer/setup_intent. Ver "Sesión 2026-07-08" arriba y `docs/DISENO_FIX_INTEGRIDAD_PAGOS.md`.

### Docs consolidados (Fase A + B)
- Specs `.docx` → `.md`: `docs/SPEC.md`, `docs/DESIGN_SYSTEM.md`. Patrones técnicos → `docs/ARCHITECTURE.md`. Backlogs unidos → `docs/BACKLOG.md`. Diagnósticos resueltos, DEV_PLAN y `.docx` originales → `docs/archive/`. `CONTINUITY.md` + `CLAUDE.md` actualizados.

---

## What JChat 3.0 is
Location-based social + commerce mobile app. Proximity group chats tied to physical venues, in-venue ordering/gifting via Stripe, map-first UI, three-tier business subscriptions. Launch markets: USA + Dominican Republic.

## Stack
- Mobile: React Native (Expo SDK 56, React 19), React Navigation v7
- Web dashboard + web client: Next.js 16.2.9 (Turbopack)
- Backend: Supabase (Postgres, Edge Functions, Storage, Realtime, RLS) — project klfsgcfoahdtkojyqspd, ~47 tables
- Payments: Stripe Connect
- Maps: iOS = Apple Maps (no key); Android = Google Maps (key required); Web = Google Maps JS
- Builds: EAS — bundle id com.juangarciacruz.jchatapp
- Repo: github.com/jcgarcia007/jchat-3, branch main
- Local path: /Users/jcgarcia/Projects/JchatVer3.0 (NO space — has web/ + mobile/)
- Web prod: jchat-3.vercel.app
- Owner / super_admin: Juan Carlos García — user id 1bc7f2a8-4d71-4ea3-8c8d-cf059eb1b8de

## Key IDs
| Resource | Value |
|---|---|
| Supabase project | klfsgcfoahdtkojyqspd |
| Vercel project | prj_sGiwIjcnfUbrdzuITqY7ikEMI9tI (team team_eD4O1D2IRdcSlfIJxPhdyegy; CLI scope slug: carlos0cruz007-3843s-projects) |
| Google Cloud project | JChat (jchat-497118) |
| Test business | Bar XZX — slug bar-xzx-omd2, id 0478b8d5-5217-4369-9fa2-128dbe5b38f8 (Plantation FL), menu_mode 'web' |

## Workflow
- Planning Claude (web, MCP de solo lectura) escribe specs copy-paste en español.
- Juan las pega a Claude Code CLI, que implementa, verifica y commitea.
- Claude Code pasa SOLO el SHA corto. Planning Claude audita el diff vía GitHub MCP y verifica la
  BD vía Supabase MCP antes de seguir.
- Un comando de terminal a la vez.
- Claude Code AÑADE features no pedidas: auditar cada diff contra el spec. (2026-07-13: inventó un
  TTL de 48h para voice-notes que nadie pidió y lo registró como decisión; se corrigió en `e80c23b`.)

---

## Done / working (verified)

### Menú Web — public ordering page (web/, route /m/[slug]) — COMPLETE
Uber-Eats-style public menu at /m/{slug}, activated by menu_mode='web' (dashboard radio + QR hub button). Components in web/app/m/[slug]/: page.tsx (server, getMenuData + buildGroups) + MenuPageClient.tsx (client; BusinessHeader, CategoryNav, ItemCard with 10 hover effects, CustomizerSheet, CartSheet, PickupSheet, SuccessSheet, CartFAB, Backdrop).
- 10 card hover effects (lift/reveal/tilt/spotlight/duotone/glass/shine/focus/neon/polaroid) — migration 030, menu_card_effect column, owner picks in dashboard.
- Multi-photo per item (menu_item_photos table, migration 029). Category icons via 51 verified Tabler icons in web/lib/categoryIcons.tsx (migration 031, icon_url column).
- Customizer UX (this session): tap card opens customizer (+ button too, with stopPropagation to avoid double-fire); width-capped sheet (maxWidth 460, centered — full-width on phone, modal on desktop); clickable photo thumbnails change hero photo; default selections pre-chosen (single groups open with 1st option / hielo→Normal / picante→Medio) so "Agregar" is active immediately; "Notas para la cocina" textarea (maxLength 200) propagated to CartItem.notes, shown in cart with 📝.

### Modifier groups system (Uber-Eats-style options) — ALL 4 STEPS COMPLETE
Reusable option groups with min/max rules. Migration 032: modifier_groups (id, business_id, key, label, type single|multi, min_select, max_select, choices jsonb, sort) + menu_item_modifier_groups bridge. RLS: public SELECT + owner ALL via owner_id. menu_items.options NOT touched (retrocompat: legacy options→groups normalizer in buildGroups).
- PASO 1 (ce68a9f): tables + RLS + types.
- PASO 2 (88094b3 + 0c55fdc): customizer reads groups, single=radio/chips, multi=checkbox, min/max validation, live price.
- PASO 3 (2ff672a): seed for Bar XZX — 51 groups (4 reusable: tamano_coctel, hielo, tamano_cerveza, temp_cerveza), 60 bridge rows, 17 items.
- PASO 4 (cc04bc0): ModifierGroupsEditor in dashboard item modal (web/app/dashboard/menu/page.tsx) — create/edit/reorder/remove groups, reuse business-wide groups, DELETE+INSERT bridge sync. ALSO fixed database.types.ts JSON-wrapper corruption (+3233 lines, was hidden by ignoreBuildErrors).

### Maps on mobile — RESOLVED on all 3 platforms
- iOS = Apple Maps (no key). Android = Google Maps, REQUIRES JChat Android Maps key in mobile .env + .env.local. Web uses own Google Maps JS key.
- Long Android "blank map" saga root cause: mobile .env had the Web Dashboard key (HTTP-referrer restricted) → Android rejected it. Fix: Android Maps key in BOTH .env and .env.local.
- iOS Google Maps blank-screen (1368497a): react-native-maps plugin must use ARRAY form with iosGoogleMapsApiKey (bare string = Apple Maps only). Kept Google on both to preserve customMapStyle. Platform EAS env vars GOOGLE_MAPS_KEY_IOS / GOOGLE_MAPS_KEY_ANDROID.
- GPS hang fix: getCurrentPositionAsync in Promise.race w/ 8s timeout → Miami FALLBACK_REGION.

### Map control polish
- Zoom +/- (Android camera.zoom; iOS camera.altitude). Recenter-on-user button. Unified top layout via useSafeAreaInsets.

### Web-by-QR customer product (web/, routes /c/[token])
- /c/[token] → welcome → login-with-return → RoomHub (Menú · Llamar servicio · Entrar al chat). join_room_via_qr on mount.
- Web ChatRoom: text + realtime, role badges, incognito, photo, 15 themes, call-waiter.
- QR: dashboard modal, PNG/PDF, qr-code-styling. Migration 027 regenerate_room_qr_token. Token {biz-slug}-{main|sub}-{8hex}.

### Seed demo data (supabase/seeds/)
- seed_demo.sql + seed_cleanup.sql (marker-based, dry-run). 10 businesses, 50 users (userNN@seed.jchat.test / SeedPass123!).
- KEY FINDING: NO auto-profile trigger — auth.users does NOT create public.users. Manual profile needed.

### Chat
- Realtime presence (track gated on SUBSCRIBED; incognito respected). Photo → Storage (base64/ArrayBuffer, Hermes-safe). Smart auto-scroll. Report/Block aligned to schema. sender_name from public.users join + cache.
- Message-send RLS: requires room_members (expires_at>now()) via can_access_room, OR business owner. Real flow grants membership via room QR (join_room_via_qr, 24h).
- Tables blocks/reports/follows/dm_conversations/dm_messages exist with RLS.

---

## Security — status (todos los P0 + P1 de pagos CERRADOS)
- P0-1 (private rooms readable by any authed user) — CLOSED (migrations 019-020).
- P0-4 (users RLS) — CLOSED (migration 018, public_profiles view, username_available RPC).
- P0-2 (order totals not recalculated server-side) — **CLOSED** (recálculo server + orders solo por webhook, migr 033/035; Fix #6 modificadores).
- P0-3 (Edge Functions trust client IDs with service_role) — **CLOSED** (Tanda 2: stripe-connect ownership + subscriptions auth; Tanda 3 #7 JWT en payments).
- P1 integridad de pagos (idempotencia webhooks, UNIQUE stripe_pi_id, is_verified) — **CLOSED** (Tanda 3, migr 037-039). Ver "Sesión 2026-07-08".
- Los pagos reales siguen en Stripe **test mode**. Ver SECURITY_AUDIT.md / DISENO_FIX_INTEGRIDAD_PAGOS.md.

---

## DEBT (technical debt — carried)
- ✅ RESUELTO (julio 2026): ignoreBuildErrors + eslint.ignoreDuringBuilds REMOVIDOS de web/next.config.ts. Los 33+ errores de tsc arreglados en lotes 1/1.1/2/3 + cierre; `npx tsc --noEmit` = 0 y `next build` pasa con type-checking real. El bug de analytics/page.tsx (order_items.name inexistente) fue uno de los corregidos. Varias features super-admin (ban/trial/resolver-logs/announcements status) quedaron STUB porque sus columnas no existen en el schema — con TODO en el código.
- 🟡 Migrations 030/031 NOT registered in schema_migrations (applied via execute_sql) — registry desync.
- 🟡 menu_items has TWO legacy photo columns (image_url + photo_url) — consolidate someday.
- 🟡 Date.now() overflows Postgres int — use bigint/sequence for sort fields (was a runtime bug in migration 029).
- Android Maps key per-app restriction PENDING: package com.juangarciacruz.jchatapp + debug SHA-1 5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25.
- Re-enable "Confirm email" in Supabase.
- expo-updates (OTA) not configured — needed before distributing to testers.
- EAS internal distribution (expo-dev-client + UDID) for physical iPhone.

---

## What's next — prioritized
1. **Pruebas manuales pendientes en dispositivo** (ver sección arriba, 4 bloques): Fase A+B social,
   Fix #6 modificadores, Fase D (gate de DM), Chat Fase 2 (TTL).
2. **GC de fotos huérfanas de `post-media`** — la purga TTL borra las filas de mensajes pero NO los
   binarios (Supabase bloquea el `DELETE` directo sobre `storage.objects`). Implementar limpieza vía
   Storage API (Scheduled Edge Function) cuando el costo de storage lo amerite. Ver D-14.
3. **Fase C pendiente (opcional):** tabla `saved_posts` + tab Saved en el perfil (diferido, no bloqueante).
4. **Chat Fase 3** (badge de "no leídos" por usuario/sala), **checkout web** (menú+carrito+Stripe;
   P0 de pagos ya cerrados → orden SOLO por webhook), **geo-verificación** (presencia física
   server-side PostGIS/Edge — regla de oro del producto, ver `docs/BACKLOG.md`).
5. Conectar dominio jchat.cloud al proyecto Vercel jchat-3 (ya en el team; pendiente www vs apex).

> Nota: los 4 P0 + los P1 de integridad de pagos quedaron CERRADOS el 2026-07-08. **Stage 1 social
> (Fases A+B+C+D) COMPLETO** a nivel código/BD y **Chat Fase 2 (TTL) aplicada** — solo faltan las
> pruebas manuales en dispositivo.

---

## Recent commits (newest first, all on main)
| Commit | Description |
|---|---|
| c63479c | Chat Fase 2 — purga TTL 24h de mensajes de sala vía pg_cron (excluye pinned; fotos diferidas por storage.protect_delete) |
| c06fde7 | Social Fase D — cablea Send DM (UserActionSheet→ChatRoom) vía start_dm + nav anidada a DMChat + Alert en DmGateError |
| 670e82e | Social Fase D — gate de DM (start_dm RPC + whoCanDMMe) + soft-hide en RLS dm_* + bucket dm-media privado |
| 9f70a0b | Menu web: tap-to-open customizer, width-cap, thumbnails, defaults, notes (also added gift toggle — REMOVED next, and dropped min-validation — left simple per owner) |
| cc04bc0 | PASO 4 — dashboard modifier groups editor + database.types.ts un-corrupt |
| 2ff672a | PASO 3 — modifier options seed for Bar XZX |
| 0c55fdc | PASO 2 — customizer reads groups (client) |
| 88094b3 | PASO 2 — buildGroups (server) |
| ce68a9f | PASO 1 — migration 032 modifier_groups tables |
| b1e46be | Bar XZX menu seed (5 cats, 17 items, 28 photos) |
| 1368497a | iOS Google Maps blank-screen fix (plugin array form) |

(NOTE: pending at session end — a commit to (A) remove gift toggle, (B) lower customizer sheet 92vh→85vh, (C) card photo aspectRatio 4/3→16/10. If present in git log, this status predates it.)
