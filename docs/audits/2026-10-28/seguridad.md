# Auditoría de seguridad — JChat 3.0 (2026-10-28)

Método: revisión estática de RLS, funciones `security definer`, grants y Edge Functions; después **28 ataques reales** ejecutados contra Supabase **local** (`loadtest/local-up.sh`) como roles `anon` / `authenticated` con `request.jwt.claims`. Nada se tocó en producción. Los ataques están en `supabase/tests/10_security_attacks.sql` y corren dos veces: **ANTES** y **DESPUÉS** de aplicar el borrador `supabase/migrations/248_security_hardening.sql` (dentro de una transacción que se deshace).

Rama: `fix/security-audit`. Migración 248 = **BORRADOR, sin aplicar**. Rollback: `supabase/rollbacks/248_security_hardening_rollback.sql`. Comprobación posterior: `supabase/scripts/248_check.sql`.

Suite SQL completa: 112 pruebas, 0 fallos.

## Hallazgos por severidad

Ninguno crítico (no hay escalada de rol, ni acceso a dinero, ni lectura de DMs ajenos).

### ALTA
| # | Hallazgo | Ataque | Arreglo en 248 |
|---|----------|--------|----------------|
| H1 | `venue_presence_ok(user, business)` es ejecutable por `authenticated`: cualquiera pregunta si un usuario concreto está ahora en un local (oráculo de presencia). Choca con la regla de privacidad "nunca revelar ubicación". | A21 | `revoke execute … from public, anon, authenticated` (las funciones que la usan son definer y siguen funcionando: OK6) |
| H2 | Policy `stories_read` = `true`: se leen las stories de cuentas **privadas** sin seguirlas y de quien te **bloqueó**. | A22, A23 | `alter policy`: propias, o (no bloqueado y (no privada o seguida)) |
| H3 | Policy `map_reactions_read` = `true`: historial de visitas (en qué local reaccionó cada usuario). | A25 | solo propias, dueño del local, o presente ahora en el local |

### MEDIA
| # | Hallazgo | Ataque | Arreglo |
|---|----------|--------|---------|
| M1 | `story_views_read_own_story` = `true`: ves quién vio la story de otro. | A24 | solo el espectador o el autor de la story |
| M2 | `anon`/`authenticated` tienen `TRUNCATE`, `REFERENCES`, `TRIGGER` sobre las tablas de `public` (RLS no cubre TRUNCATE; con TRIGGER se crean triggers en tablas ajenas). | A27, A28 | `revoke … on all tables` + `alter default privileges` para tablas futuras |
| M3 | Posibles oráculos de existencia (bloqueo, match, staff) por mensajes de error o diferencias de respuesta en RPC. | — | pendiente: unificar respuestas (no incluido en 248) |

### BAJA
- B1 `reviews: author update` permite al autor reescribir `owner_reply` (A26). Arreglado en 248 (`using (false)`; el dueño responde por su camino propio, OK7).
- B2 `pos_tab_total` / `balance` sin comprobación de autorización explícita dentro de la función (solo exponen cifras de cuentas cuyo id hay que conocer).
- B3 `x-push-secret` se compara con `===` (no constante) en `send-push`, `moderate-match-photo`, `moderate-dm-photo`, `safety-alert`, `gift-worker`. Usar comparación en tiempo constante.
- B4 Un único secreto compartido para todas las funciones internas: rotarlo implica tocar todos los triggers/cron.
- B5 `businesses.stripe_account_id` legible por público: es un id `acct_…` no secreto, pero no hace falta exponerlo.

### INFO
- `public_profiles` legible por `anon` (username, nombre, bio, ciudad): por diseño (web pública); confirmar que es lo deseado.
- Recomendación de fondo: mover las funciones auxiliares que usan las policies a un esquema no expuesto (`private`), para que revocar ejecución no choque con el chequeo de privilegios del invocador.

## Los 28 ataques (ANTES → DESPUÉS de la 248)

"resiste" = el ataque ya falla hoy.

| ID | Ataque | Antes | Después |
|----|--------|-------|---------|
| A01 | Leer DMs de otra pareja | resiste | resiste |
| A02 | Cambiar el precio de un item de un pedido propio | resiste | resiste |
| A03 | Cambiar el total de tu pedido | resiste | resiste |
| A04 | Marcar tu pedido como pagado | resiste | resiste |
| A05 | Aceptar un regalo ajeno | resiste | resiste |
| A06 | Cancelar un regalo ajeno | resiste | resiste |
| A07 | Listar ofertas de regalo ajenas | resiste | resiste |
| A08 | Marcar comanda impresa sin haberla reclamado | resiste | resiste |
| A09 | `anon` crea un regalo | resiste | resiste |
| A10 | Hacerte super_admin | resiste | resiste |
| A11 | Dueño cambia su plan / verificación / cuenta Stripe | resiste | resiste |
| A12 | Leer campos privados ajenos (push token, año de nacimiento, customer Stripe) | resiste | resiste |
| A13 | Leer notificaciones ajenas | resiste | resiste |
| A14 | Enviar notificación a otro | resiste | resiste |
| A15 | Seguir como otra persona | resiste | resiste |
| A16 | Reescribir un DM ajeno | resiste | resiste |
| A17 | Publicar en una sala donde no estás presente | resiste | resiste |
| A18 | Leer el código diario de verificación de un local ajeno | resiste | resiste |
| A19 | Leer códigos de mesa / tokens QR de un local | resiste | resiste |
| A20 | Leer una foto de DM ajena en Storage | resiste | resiste |
| A21 | Oráculo de presencia en un local | **VULNERABLE** | cerrado |
| A22 | Stories de cuenta privada sin seguir | **VULNERABLE** | cerrado |
| A23 | Stories de quien te bloqueó | **VULNERABLE** | cerrado |
| A24 | Ver quién vio la story de otro | **VULNERABLE** | cerrado |
| A25 | Historial de locales por reacciones de mapa | **VULNERABLE** | cerrado |
| A26 | Falsificar la respuesta del local en tu reseña | **VULNERABLE** | cerrado |
| A27 | TRUNCATE de una tabla pública | **VULNERABLE** | cerrado |
| A28 | CREATE TRIGGER en tabla pública | **VULNERABLE** | cerrado |

Controles de no regresión (OK1–OK7: ves tus stories, el autor ve sus vistas, presentes ven reacciones, el dueño ve y responde, `gift_available` sigue respondiendo): todos pasan antes y después.

## Edge Functions

| Función | verify_jwt | Autenticación efectiva | Comentario |
|---------|-----------|------------------------|-----------|
| payments, stripe-connect | true | JWT + `getUser` | OK |
| terminal | false | `getUser` manual | OK (patrón documentado en config.toml) |
| subscriptions | false | firma Stripe + `getUser` | OK |
| stripe-webhook | false | `constructEvent` (firma) | OK |
| delete-account, stripe-refund, menu-assistant | sin entrada en config.toml (por defecto true) | `getUser` | OK |
| send-push, gift-worker, moderate-dm-photo, moderate-match-photo, safety-alert | false | `x-push-secret` | B3/B4 |
| tab-pay | false | `pay_token` no adivinable; solo un `tab_payment` pendiente; el importe lo calcula el servidor | OK por diseño (pagador sin cuenta); revisar expiración del token |
| guest-pay, guest-tab | false | hCaptcha de un solo uso + tokens de mesa/sesión | OK por diseño; revisar límites de frecuencia por IP/dispositivo |

No se miraron logs de producción (prohibido esta noche); queda para una revisión autorizada.

## Qué aplicar y en qué orden (decide Juan Carlos)

1. Revisar `248_security_hardening.sql`; tras aplicarla por MCP (no `supabase db push`), ejecutar `248_check.sql`.
2. Si algo falla en la app: `248_security_hardening_rollback.sql`.
3. Probar a mano en el móvil: stories de una cuenta privada seguida / no seguida, reacciones de mapa, responder reseña como dueño.
4. Después: B3 (comparación constante) en las 5 funciones; y mover las funciones auxiliares a un esquema privado.
