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

### P0-2 · Recálculo server-side de montos de orden — ✅ CERRADO (julio 2026)
**Estado:** el `create_payment_intent` de `payments` ya recalculaba todo el monto
desde la BD (`menu_items.price_cents`, tax por negocio, tip validado+capado,
discount=0), ignorando los montos del cliente. El hueco real era **paralelo**: el
cliente podía **insertar órdenes `confirmed` directo por RLS** saltándose Stripe.
**Cierre:** migración **033** — `drop policy "orders: customer insert"` + `revoke
insert on orders, order_items from authenticated, anon`. Ahora **solo el webhook
(service_role) crea órdenes**. + migración **035**: `orders` UPDATE owner-only (el
customer no puede mutar `total_cents`/`status`).
**Pendiente P1 (no bloqueante):** recalcular el precio de **modificadores**
(`modifier_options`) en `payments` — hoy el subtotal server omite su costo (subcobro).
**Ref:** `docs/DIAGNOSTICO_PAGOS.md`, `docs/DISENO_FIX_RLS_PAGOS.md`.

### P0-3 · Edge Functions no confían en IDs del cliente — ✅ CERRADO (julio 2026)
**Estado previo:** `stripe-connect` (verify_jwt=true pero sin check de propiedad →
IDOR, login link al Stripe de otro negocio) y `subscriptions.create_checkout`
(verify_jwt=false, sin auth → downgrade anónimo del plan de cualquier negocio).
**Cierre (Tanda 2):**
- `stripe-connect` (v9): `verifyCaller` (verifica JWT) + `assertOwnerOrAdmin`
  (auth.uid() = businesses.owner_id o platform admin) **antes de las 3 acciones**
  + idempotency key en `accounts.create`. `verify_jwt` sigue `true`.
- `subscriptions.create_checkout` (Opción B): en el path app (sin `stripe-signature`)
  verifica JWT + ownership **antes** de crear checkout o hacer el downgrade. El path
  webhook (verificación de firma) queda intacto; `verify_jwt` sigue `false`.
**Verificado en vivo (test mode):** `create_login_link` y `create_checkout` anónimos
→ **401**; el plan de un negocio ajeno NO se degrada.
**Ref:** `docs/DISENO_FIX_EDGE_AUTH.md`, `docs/SECURITY_BEST_PRACTICES.md`.

### P0-2b · Columnas financieras de `businesses` escribibles por el cliente — ✅ CERRADO (julio 2026)
**Problema:** el dueño podía auto-cambiar `plan`/`tax_rate`/`stripe_account_id`/
`status`/`owner_id` por UPDATE directo (auto-upgrade, redirigir payouts, etc.).
**Cierre:** migración **034** (RPC `admin_set_business_status`, SECURITY DEFINER,
guard `is_platform_admin()`) + **036** (`revoke update on businesses` a nivel de
tabla + `grant update` de la **allow-list de 40 columnas** no financieras — el
revoke por columna solo no basta por el grant de tabla de Supabase). Las páginas
super-admin usan la RPC. Los cambios legítimos van por service_role (subscriptions →
plan, stripe-connect → stripe_account_id, /api/verify + RPC → status).
**Pendiente P1:** proteger también `businesses.is_verified` (badge de verificado).
**Ref:** `docs/DISENO_FIX_RLS_PAGOS.md`.

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

## Follow-ups P1 de pagos (integridad — no bloqueantes, tras cerrar los P0)

Los 4 huecos P0 de pagos quedaron cerrados (Tandas 1+2, julio 2026). Estos son de
integridad/robustez, no de explotación directa:

- **Idempotencia de webhooks:** crear `processed_stripe_events(event_id text UNIQUE)`
  y chequearla al inicio de ambos webhooks; volver `grace_day` **derivable** (no
  `+1` ciego) para que la reentrega de `invoice.payment_failed` no suspenda de más.
- **Recalcular modificadores en `payments`:** sumar el precio de `modifier_options`
  al subtotal server (hoy se omite → subcobro si un ítem tiene modificadores con costo).
- **`payments` `ensure_customer` / `create_setup_intent`:** aún usan `body.user_id`
  sin verificar el JWT → aplicar el mismo `verifyCaller` (IDOR menor sobre el customer de Stripe).
- **`UNIQUE` en `orders.stripe_pi_id`:** endurece el guard de idempotencia del webhook
  de órdenes (hoy es un SELECT-guard con ventana de carrera).
- **Proteger `businesses.is_verified`:** columna de autoridad aún escribible por el
  cliente; sumarla al patrón de las columnas financieras (revoke + allow-list) tras
  verificar quién la escribe para no romper el flujo de verificación.

**Ref:** `docs/DIAGNOSTICO_PAGOS.md` (§ lista priorizada), `docs/SECURITY_BEST_PRACTICES.md`.

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
1. ✅ P0-1 (salas privadas, migr. 019-020) y P0-4 (users push_token, migr. 018) — CERRADOS.
2. ✅ P0-2 + P0-3 (pagos / Edge Functions) — el bloque de dinero — **CERRADOS (Tandas 1+2, julio 2026)**.
   Quedan los follow-ups P1 de integridad (ver sección arriba).
3. P1-1, P1-3, P1-4 (RLS/storage restantes).
4. P1-2, P1-5, P1-6 (stubs, admin gating, env + rotar Maps key).
5. P2 según roadmap.

## Cómo verificar cada fix
Para cada P0/P1 de RLS, correr en Supabase:
`SELECT tablename, polname, cmd, qual, with_check FROM pg_policies WHERE tablename IN ('users','messages','rooms','service_calls');`
y probar con un token de usuario sin privilegios que el acceso esté denegado.
