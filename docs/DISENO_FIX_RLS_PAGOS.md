# Diseño — cerrar los 2 huecos P0 de RLS de pagos (2026-07-07)

> Diseño, **sin migraciones aplicadas**. Objetivo: cerrar (FIX #1) la inserción directa
> de órdenes por el cliente y (FIX #2) la escritura de columnas financieras de `businesses`
> por el dueño, **sin romper** (a) el flujo de pago correcto, (b) la edición legítima del
> negocio, (c) las pruebas en Stripe test mode.
> Base: `docs/DIAGNOSTICO_PAGOS.md`.

---

## FIX #1 — `orders`: cerrar la inserción directa del cliente

### 1. Verificación: ¿cómo se crean las órdenes HOY?

**Webhook (server-side, service_role) — el path correcto:**
- `supabase/functions/stripe-webhook/index.ts` → en `payment_intent.succeeded` inserta
  `orders` (+`order_items`) con **service_role** y montos tomados de `paymentIntent.metadata`
  (que `payments` calculó server-side). Cubre el caso completo. ✅

**Flujo real del cliente (móvil):**
- `mobile/screens/checkout/CheckoutScreen.tsx:handlePay` →
  - **Con Supabase configurado (producción):** `initAndPresentPaymentSheet(orderPayload)`
    (línea 538) → llama al Edge Function `payments` → Stripe PaymentSheet → *"Order is created
    server-side by the Stripe webhook"* (comentario línea 544). **El cliente NO inserta la
    orden.** ✅
  - **Modo demo (`!isSupabaseConfigured`, línea 450):** llama `createOrderRecord(...)`
    (`mobile/services/orders.ts:78`), que hace `supabase.from('orders').insert({ status:
    'confirmed', ... })` desde el cliente. **Solo demo** — y en demo no hay backend real, así
    que el insert es un no-op envuelto en try/catch que traga el error (líneas 477-479).

**Único `.insert('orders')` del cliente en todo el repo:** `mobile/services/orders.ts:81`
(`createOrderRecord`), llamado solo desde el bloque demo de `CheckoutScreen`. No hay inserts de
órdenes en `web/`. (El checkout web / Fase 3 aún no existe.)

**¿Órdenes que NO pasan por Stripe (comandas internas, $0, cash)?**
- **No hay ninguna hoy.** `order_type` ∈ {table, counter, gift}; los tres pasan por el
  PaymentSheet. `gift` = el remitente paga. No existe flujo de orden gratis ni "cobrar en caja
  por staff". → El fix puede asumir que **toda orden legítima nace del webhook**.

**Updates de estado de orden (NO son inserts — no los toca este fix):**
- `web/app/dashboard/kds/page.tsx:175` y `orders/page.tsx` → staff cambia `status`
  (cooking→ready→served) vía la política `orders: business owner or customer update`. Legítimo,
  **se conserva**. `mobile/services/orders.ts:updateOrderStatus` (cliente) — el fix #1 solo
  toca INSERT, no UPDATE.

### 2. Opciones de política (con trade-offs)

| Opción | Qué hace | Trade-off |
|---|---|---|
| **A (recomendada) — INSERT solo service_role** | Elimina la política `orders: customer insert`; `REVOKE INSERT ON orders FROM authenticated, anon`. Solo el webhook (service_role) crea órdenes. | Cierra el hueco por completo y **coincide con la arquitectura real** (webhook crea la orden). Si en el futuro hay un flujo cliente-inicia-orden (ej. cash/pay-at-counter), debe ir por un Edge Function/RPC server-side. **No rompe nada hoy** (el único insert cliente es demo, no-op sin backend). |
| **B — cliente inserta solo `status='pending'`** | Mantener una política cliente con `WITH CHECK (status='pending' AND stripe_pi_id IS NULL AND user_id=auth.uid())`; el webhook confirma. | Más superficie. El cliente **sigue controlando `total_cents`** en la fila pending (no hay validación server de montos en pending) → un pending puede ser fulfilled por staff con total falso. Solo tiene sentido si existe un flujo legítimo cliente-inicia-orden — **no existe**. |
| **C — exigir `stripe_pi_id` + trigger que lo valide contra Stripe** | Trigger BEFORE INSERT verifica que el `stripe_pi_id` exista y esté `succeeded` en Stripe. | Overkill: el webhook ya es el dueño de la creación y ya valida el pago. Latencia + llamada a Stripe en cada insert. |

### 3. Qué se rompería y cómo evitarlo
- **Opción A:** rompería el `createOrderRecord` de **modo demo** — pero en demo `isSupabaseConfigured`
  es false, así que no hay insert real (es no-op con try/catch). **Mitigación:** dejar
  `createOrderRecord` como está (solo demo) o marcarlo claramente como demo-only; no se llama en
  producción. El flujo real (Edge Function + webhook) **no se toca**. Los updates de estado del
  KDS **no se tocan** (política de UPDATE aparte).
- **Recomendación:** **Opción A**. Migración: `drop policy "orders: customer insert" on orders;`
  \+ `revoke insert on orders, order_items from authenticated, anon;` (order_items también, para
  que no se puedan inyectar líneas sueltas). El webhook (service_role) no se ve afectado.

---

## FIX #2 — `businesses`: proteger columnas financieras

### 1. Verificación: ¿qué columnas edita legítimamente el DUEÑO hoy?

`.update` del **dueño** sobre `businesses` (cliente, política `businesses: owner update`):
- `web/app/dashboard/configuration/page.tsx:453` (`patch(Partial<BusinessRow>)`): name,
  description, category, address, phone, website, hours, cover_url, icon_emoji, gallery_urls,
  menu_enabled, tips_enabled, tip_percentages, payout_frequency, dashboard_theme_id.
- `web/components/dashboard/LocationEditor.tsx:390`: latitude/longitude, geofence_radius_m,
  geofence_polygon, lat/lng, radius_m.
- `web/app/dashboard/menu/page.tsx` (varias): menu_enabled, menu_mode, menu_card_effect,
  menu_palette_id, dashboard_theme_id, category_icon_url.

**Ninguno de estos toca las 5 columnas protegidas.** En particular:
- `tax_rate` → **read-only en el cliente hoy** (solo se lee: `mobile/services/tax.ts:47`,
  `CheckoutScreen`). No hay `.update({tax_rate})` en ningún lado. ✅
- `plan` → NO se escribe por el cliente en ningún flujo (el dashboard de billing cambia el plan
  vía el Edge Function `subscriptions`, no por update directo). ✅
- `stripe_account_id` → solo lo escribe el Edge Function `stripe-connect`. ✅
- `owner_id` → solo se setea en el **INSERT** de registro (`business/register`). ✅
- `status` → ⚠️ **SÍ lo escriben páginas super-admin desde el cliente** (ver abajo).

**Escrituras legítimas de `status`:**
- `web/app/super-admin/businesses/page.tsx:176` → `.update({ status: newStatus })` (suspender/activar).
- `web/app/super-admin/verification/page.tsx:182` → `.update({ status: bizStatus })` (verified/rejected).
  - Ambas son **cliente**, con el rol `authenticated`, vía la política `businesses admin update`
    (`is_platform_admin()`).
- `web/app/api/verify/route.ts:95,260` → `.update({ status })` pero es un **Route Handler
  server-side con `supabaseAdmin` (service_role)**. ✅ Este path sobrevive cualquier REVOKE.

### 2. Propuesta

**REVOKE por columna al rol cliente:**
```sql
revoke update (plan, tax_rate, stripe_account_id, status, owner_id)
  on public.businesses from authenticated, anon;
```
- Los privilegios por columna se evalúan **antes** de RLS: el dueño sigue pudiendo `UPDATE` su
  fila (política `owner update`) pero **solo las columnas no revocadas** (name, hours, etc.).
- **NO rompe la edición normal del negocio** — ninguna de las columnas que edita el dashboard
  está en la lista revocada (verificado arriba). ✅
- `service_role` **no se ve afectado** (no está sujeto a estos GRANT/REVOKE) → los Edge Functions
  (`subscriptions`→plan, `stripe-connect`→stripe_account_id) y el route `/api/verify`→status
  **siguen funcionando**. ✅

**Lo único que rompe:** las 2 páginas super-admin **cliente** que escriben `status`
(`super-admin/businesses`, `super-admin/verification`). Opciones para preservarlas:
- **(pref.) RPC `SECURITY DEFINER`** `admin_set_business_status(p_business_id uuid, p_status text)`
  con guard `if not is_platform_admin() then raise exception`. Las páginas llaman
  `supabase.rpc('admin_set_business_status', ...)` en vez del `.update` directo. Mantiene al
  super-admin sin meter service_role en el cliente.
- **(alt.)** mover esas escrituras al patrón Route Handler service_role (como `/api/verify`).

### 3. REVOKE por columna vs trigger vs WITH CHECK

| Mecanismo | Pros | Contras |
|---|---|---|
| **REVOKE por columna** (recomendado) | Declarativo, lo hace la BD sin importar qué cliente/política; imposible de saltar desde `authenticated`. | Bloquea también al platform-admin `authenticated` (por eso `status` necesita RPC/route). |
| **Trigger BEFORE UPDATE** | Puede permitir excepciones finas (ej. dejar cambiar `status` si `is_platform_admin()`), evitando la RPC para super-admin. | Más código; detectar rol/origen en el trigger es más frágil (`current_setting('request.jwt.claims')`); mantener la lista de columnas a mano. |
| **WITH CHECK en la política** | — | **No sirve**: RLS compara valores de fila, no el *delta* (no ve OLD vs NEW), así que no puede impedir el cambio de una columna específica. Solo un trigger puede comparar OLD/NEW. |

**Recomendación:** REVOKE por columna para `plan`/`tax_rate`/`stripe_account_id`/`owner_id`
(nunca escribibles por el cliente). Para `status`, dos variantes válidas — elegir una:
- **Variante 1 (más limpia):** REVOKE también `status` + RPC `admin_set_business_status` para super-admin.
- **Variante 2:** trigger `BEFORE UPDATE` que bloquee cambios a las 5 columnas **salvo** cuando
  `is_platform_admin()` (para `status`) — así no hay que tocar las páginas super-admin. Trade-off:
  el trigger es la única fuente de verdad; hay que mantener la lista de columnas ahí.

### 4. Cómo cambian las columnas protegidas legítimamente (post-fix)

| Columna | Quién la cambia legítimamente | Path (service_role, no cliente) |
|---|---|---|
| `plan` | Webhook de suscripciones / downgrade | Edge Function `subscriptions` ✅ ya |
| `stripe_account_id` | Onboarding Connect | Edge Function `stripe-connect` ✅ ya |
| `status` | Verificación 3 pasos / super-admin suspend | `/api/verify` (service_role) ✅ ya + **nueva RPC/route para super-admin** |
| `tax_rate` | **Nadie hoy** (read-only) | Si el dashboard agrega edición de impuesto → RPC/Edge Function server-side (NO update directo) |
| `owner_id` | Solo INSERT (registro) | Transferencia de dueño (futuro) → service_role |

---

## Nota de hardening relacionada (fuera del scope de los 2 P0, pero conviene)
- **INSERT-time en `businesses`:** la política `owner insert` (WITH CHECK `owner_id=auth.uid()`)
  no restringe `status`/`plan` **en el INSERT** → al registrar, el cliente podría setear
  `status='verified'`/`plan='pro'`. Cerrar con: `WITH CHECK` que fije
  `status='pending_verification' AND plan IS NULL/'regular'`, o `REVOKE INSERT (status, plan,
  stripe_account_id)` (dejando que el default de la columna aplique). Recomendado hacerlo en la
  misma migración de FIX #2.
- **`orders` UPDATE:** la política de UPDATE (dueño o cliente) no tiene `WITH CHECK` → el cliente
  podría cambiar `total_cents`/`status` de su propia orden. Menor que el INSERT, pero al cerrar
  FIX #1 conviene añadir `WITH CHECK` que impida al cliente-customer mover montos/estado (dejar
  esos cambios al staff/owner). Se puede incluir como P1 en la misma tanda.

---

## Resumen de la migración propuesta (para la sesión de aplicación — NO aplicada aún)
1. **FIX #1:** `drop policy "orders: customer insert"` + `revoke insert on orders, order_items from authenticated, anon`. (Webhook service_role intacto; UPDATE de estado del KDS intacto.)
2. **FIX #2:** `revoke update (plan, tax_rate, stripe_account_id, status, owner_id) on businesses from authenticated, anon` + RPC `admin_set_business_status` (SECURITY DEFINER, guard is_platform_admin) **o** trigger que exceptúe `is_platform_admin()` para `status`.
3. **Hardening (opcional, misma tanda):** restringir `status`/`plan` en el INSERT de `businesses`; `WITH CHECK` en el UPDATE de `orders`.
4. **Verificación en Stripe test:** pagar una orden → confirmar que el webhook la crea (sin tocar el cliente); intentar `insert` de orden desde el cliente → debe fallar; intentar `update businesses set plan='pro'` como dueño → debe fallar; editar name/hours como dueño → debe seguir funcionando; suspender un negocio como super-admin → debe seguir funcionando (vía RPC/route).
