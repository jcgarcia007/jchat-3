# JChat 3.0 — Security Audit & Remediation Plan

> Estado: **BLOQUEANTE para producción.** Verificado contra el esquema real en
> `main` (commit 919b03f) vía MCP el 2026-06-23. No poner pagos reales ni salas
> privadas en producción hasta cerrar P0.
>
> Leyenda: P0 = bloqueante / explotable hoy · P1 = alto · P2 = deuda técnica.
> Cada ítem marca [CONFIRMADO] (visto en el código) o [POR VERIFICAR].

---

## P0 — Bloqueantes (cerrar antes de cualquier release)

### P0-1 · Salas privadas no son privadas [CONFIRMADO]
**Dónde:** `001_initial_schema.sql` — policies `messages: authenticated read` y
`rooms: authenticated read`, ambas `using (true)`.
**Problema:** cualquier usuario autenticado puede leer los mensajes y la
metadata de CUALQUIER sala, incluidas las `is_password_protected`. El
`password_hash` solo protege la UI, no los datos. La promesa central del
producto (salas privadas) está rota a nivel BD.
**Fix:** reemplazar `using (true)` por una policy que exija pertenencia a la
sala. Necesita una tabla/concepto de "membresía de sala" (ej. `room_members`,
o derivar acceso de `check_ins` / verificación de password vía RPC). Para salas
públicas de un negocio, permitir lectura; para protegidas, exigir membresía
verificada.
**Verificación:** con el anon key de un usuario que NO entró a la sala, un
SELECT a `messages` de esa sala debe devolver 0 filas.

### P0-2 · Precios de orden no se recalculan en el servidor [POR VERIFICAR en código, CONFIRMADO en esquema]
**Dónde:** `mobile/services/stripe.ts:92`, `supabase/functions/payments/index.ts:74`,
tabla `orders` (acepta `total_cents` del insert del cliente).
**Problema:** el cliente envía subtotal/tax/tip/discount/total y precios de ítem;
el server crea el PaymentIntent con esos valores. Un atacante paga $0.01 por una
cuenta de $100.
**Fix:** la Edge Function debe (1) verificar el JWT y derivar `user_id` del token,
(2) leer `menu_items.price_cents` desde la BD por cada ítem, (3) validar
disponibilidad/oferta, (4) calcular tax/fees/total server-side, (5) recién
entonces crear el PaymentIntent. Nunca confiar en montos del cliente.
**Verificación:** manipular el total en la request y confirmar que el server
cobra el precio correcto de la BD, no el enviado.

### P0-3 · Edge Functions confían en identificadores del cliente con service_role [POR VERIFICAR]
**Dónde:** `payments/index.ts:71` (`order.user_id`, `business_id`),
`stripe-connect/index.ts:73` (`business_id`), `subscriptions/index.ts:132`
(`business_id`, downgrades directos).
**Problema:** corren con `service_role` (saltan RLS) pero confían en IDs del
cliente. Permite actuar en nombre de otro usuario/negocio.
**Fix:** verificar el JWT de Supabase en cada función, derivar `user_id` del
token, confirmar ownership del negocio server-side antes de cualquier acción.
**Verificación:** llamar la función con un `business_id` ajeno y confirmar
rechazo.

### P0-4 · RLS `users` expone push_token a todos [CONFIRMADO]
**Dónde:** `001_initial_schema.sql` — `users: select own or public` con
`using (auth.uid() = id or true)`.
**Problema:** el `or true` anula el control. Cualquier autenticado lee todas las
filas de `users`, incluido `push_token` (habilita push spam dirigido).
**Nota:** este esquema NO tiene `stripe_customer_id`/`role` en `users` (el audit
citó columnas que viven en otras tablas); el riesgo real aquí es `push_token` y
metadata de perfil. Aun así hay que cerrarlo.
**Fix:** separar lectura pública (columnas de perfil) de privada. Opción simple:
una vista pública con solo columnas no sensibles, y restringir el SELECT directo
a la tabla a `auth.uid() = id`. O quitar `or true` y exponer perfiles vía RPC
controlado.
**Verificación:** un SELECT de `push_token` de otro usuario debe fallar/0 filas.

---

## P1 — Alto (cerrar antes de abrir a usuarios reales / testers externos)

### P1-1 · service_calls INSERT con check(true) [CONFIRMADO]
**Dónde:** `001` define `with check (true)`; `010_harden_service_calls.sql`
intenta corregirlo a `user_id = auth.uid()`. Confirmar cuál está activa en la BD
real (la última migración aplicada debería ganar). Si `010` no se aplicó, queda
el `true`.
**Verificación:** `SELECT polname, polqual FROM pg_policies WHERE tablename='service_calls'`.

### P1-2 · Stubs de verificación peligrosos en producción [POR VERIFICAR]
**Dónde:** `web/app/api/verify/route.ts:108,199` (devuelve códigos y `__dev_code`),
`web/app/business/verify/page.tsx:406` ("Skip for now (Testing)").
**Fix:** gate detrás de `NODE_ENV !== 'production'` o eliminar. Hard-disable fuera
de local. (Ya estaba en housekeeping.)

### P1-3 · pinned_messages mutado desde el cliente [CONFIRMADO]
**Dónde:** `mobile/components/chat/PinnedBanner.tsx:446,474`; RLS permite al owner
`for all` desde cliente.
**Fix:** mover delete/unpin a un Edge Function/RPC con checks de ownership.
Cumplir la regla de `CLAUDE.md` (cliente nunca muta `pinned_messages`).

### P1-4 · Storage menu-photos: cualquier autenticado gestiona todas las fotos [CONFIRMADO en audit]
**Dónde:** `011_storage_buckets.sql:37`.
**Fix:** restringir por path = `business_id` y ownership, como ya se hizo bien con
`post-media`.

### P1-5 · Super-admin gating solo en cliente [POR VERIFICAR]
**Dónde:** `web/components/SuperAdminGate.tsx:14`.
**Fix:** acciones admin que cambian estado deben ir por server routes/Edge
Functions que validen rol de plataforma server-side + audit log. La `013` ya
añadió `is_platform_admin()` para reads; reutilizarla para writes.

### P1-6 · web/.env.local con SUPABASE_SERVICE_ROLE_KEY duplicada [CONFIRMADO en audit]
**Fix:** limpiar duplicado. Confirmar que `.env*` están en `.gitignore` (lo
están). **Relacionado:** rotar la Google Maps web key expuesta (pendiente de
sesiones previas).

---

## P2 — Deuda técnica (no bloquea; planificar)

- Archivos gigantes (menu/page, chat/page, business/register, ChatRoomScreen):
  separar en hooks de datos + componentes presentacionales.
- Colores hardcoded vs tokens (CheckoutScreen, LoginScreen, analytics, register).
- Features stub: `verify_room_password` RPC faltante, map reaction overlay sin
  cablear, loyalty ledger, push senders, i18n TODO global.
- Performance: MapScreen carga todos los negocios sin bounding-box/paginación;
  añadir queries geoespaciales + índices.
- Realtime: auditar subscripciones duplicadas en chat/dashboard.
- Manejo de errores: estandarizar result types en services; muchos mutations
  ignoran el error devuelto.
- Quitar logs `[DIAG]` de storage upload (pendiente de esta sesión).

---

## Orden de ejecución recomendado
1. P0-1 (salas privadas) y P0-4 (users push_token) — son RLS, cambio acotado.
2. P0-2 + P0-3 (pagos / Edge Functions) — el bloque de dinero, el más delicado.
3. P1-1, P1-3, P1-4 (RLS/storage restantes).
4. P1-2, P1-5, P1-6 (stubs, admin gating, env + rotar Maps key).
5. P2 según roadmap.

## Cómo verificar cada fix
Para cada P0/P1 de RLS, correr en Supabase:
`SELECT tablename, polname, cmd, qual, with_check FROM pg_policies WHERE tablename IN ('users','messages','rooms','service_calls');`
y probar con un token de usuario sin privilegios que el acceso esté denegado.
