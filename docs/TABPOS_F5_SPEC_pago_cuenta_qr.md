# TAB POS — FASE F5: Pago de la cuenta por QR (cliente) — split ×3 y saldo compartido en vivo

**Versión:** 1.0 · **Fecha:** 2026-09-09 · **Autor:** Planning Claude (Fable)
**Documentos padre:** `TABPOS_PLAN_CUENTAS_CODIGO_v1.md` (0, 2, 7), specs F2/F3/F4 (todo en producción). **Léelos antes.**
**Rama:** `feat/tabpos-f5-qr-pay` desde `origin/main @ b551237`. **Checkpoint:** SÍ — **dinero**. Paso 0 y espera OK.
**Migración:** `164_table_balance_guest_pay.sql`. Planning aplica por MCP.

---

## 1. Objetivo (D-09, D-10, D-23 reinterpretada)

Solo en **modo `stripe`**. Desde el menú por QR, un cliente **con sesión de invitado** (entró el código de mesa, F3):

1. Ve un **botón flotante "Cuenta · $pendiente"** con el saldo vivo de la mesa; al tocarlo, el detalle (ítems, pagado, pendiente).
2. Paga desde su teléfono con Stripe eligiendo: **Todo el pendiente**, **Partes iguales (÷N)**, **Por artículo** o **Monto libre**, con propina opcional.
3. **Un solo saldo**: los pagos del cliente (QR) y los del mesero (M2 / split) descuentan **lo mismo**; el handheld muestra el pendiente real; la mesa se cierra sola al llegar a 0 (trigger F2), revocando las sesiones de invitado.

En modo `external` el botón muestra el saldo pero **no** permite pagar (D-06).

---

## 2. Hechos verificados por Planning (2026-09-09, `main @ b551237` + BD)

### 2.1 El POS ya tiene pagos parciales por mesa: `pos_payments`
Columnas: `id, business_id, table_id, amount_cents, tip_cents, kind (text, default 'full'; valores hoy: full|even|seat|custom), seat, order_item_ids uuid[], stripe_pi_id, status (text, default 'pending'; pending|succeeded), receipt_code (único), card_brand, card_last4, paid_by, created_at, updated_at`. **Sin CHECK en `kind`/`status`, sin trigger.** Índices: `(business_id, table_id, status)`, `(business_id, paid_by, created_at)`.

RPCs reales (cuerpos leídos de la BD):
- **`pos_create_split(p_business_id, p_table_id, p_method 'even'|'items', p_ways, p_checks)`**: borra los `pending` de la mesa y crea el plan; **`raise 'split already in progress'` si existe cualquier `succeeded`** en la mesa; `even` reparte **`pos_tab_total`** (ítems sin pagar) en `p_ways` filas; `items` exige partición completa y que la suma de ítems = `pos_tab_total`.
- **`pos_create_check(p_business_id, p_table_id, p_order_item_ids)`**: una fila por subconjunto de ítems (kind seat|custom).
- **`pos_apply_payment(p_payment_id, p_tip_cents) → boolean tab_closed`** (`security definer`, `search_path public`, sin gate de auth — la llama la EF con service role): marca `succeeded`; si tiene `order_item_ids` → marca esos ítems `paid_at`; si no → **compara `sum(amount_cents)` de TODOS los `succeeded` de la mesa (sin acotar a la sesión actual, e incluyendo pagos por ítem) contra `pos_tab_total`** y, si cubre, marca todo pagado; cierra órdenes con todos sus ítems pagados; devuelve si no quedan ítems sin pagar.
- **`pos_receipts_today`**: lee `pos_payments succeeded` del día; dueño ve todos, empleado solo `paid_by = auth.uid()`.

**Dos bugs latentes en `pos_apply_payment` que F5 corrige** (hoy no se manifiestan porque el M2 solo hace pago completo o un único plan de split por mesa, y `pos_create_split` bloquea si ya hubo `succeeded`):
- **B1 — sin acotar a sesión:** pagos `succeeded` de ocupaciones anteriores de la misma mesa entran en la suma.
- **B2 — doble conteo:** los pagos **por ítem** ya reducen `pos_tab_total` (ítems marcados), y además se suman como monto → puede cerrar la mesa antes de cobrar todo cuando se mezclan pagos por ítem y por monto.

### 2.2 EF `terminal` (M2)
Cargos **directos** en la cuenta conectada: `stripe.paymentIntents.create({...}, { stripeAccount })`, `payment_method_types: ['card_present']`, **sin** `application_fee`/`transfer_data`. `create_tab_payment_intent` cobra **`pos_tab_total`** (base) + propina, inserta `pos_payments kind='full' status='pending' paid_by=auth`, y `mark_tab_paid` **recupera el PI de Stripe** (nunca confía en el cliente), calcula `tip = pi.amount − base`, llama `pos_apply_payment`, y escribe `receipt_code` + `card_brand/last4`. `charge_split_check` cobra una fila `pending` del plan.

### 2.3 F2/F3/F4 en producción (relevante)
`tables.session_opened_at/access_code` (sesión de ocupación); `trg_table_session_autoclose` libera la mesa y **revoca `guest_tab_sessions`** cuando la última orden abierta se paga/cancela; `guest_tab_session_validate(token_hash)`; EF `guest-tab` (`create_session`, `session_status`, `add_order`, `add_order_no_code`, `order_status`); `pos_tab_total`/`pos_table_items` excluyen `awaiting`; `orders.source`; `pos_table_session.open_total_cents`.

### 2.4 Web
`CheckoutStep` + `PaymentForm` (Stripe Elements) para el pago por orden; `guest-pay` crea el PI; **Paso 0 confirma** si ese PI es cargo directo (`stripeAccount`) y cómo inicializa Stripe.js (`loadStripe(pk, { stripeAccount })`) — el flujo de F5 debe usar **el mismo** modelo de cargo y la **misma** inicialización.

---

## 3. PASO 0 (reportar con plantilla 0.2 y ESPERAR OK — checkpoint de dinero)

1. **`guest-pay` y `CheckoutStep`:** ¿el PI del pago por orden se crea con `{ stripeAccount }` (cargo directo) o con `transfer_data/application_fee` (destino)? ¿Devuelve `publishable_key` y `stripe_account_id`? ¿Cómo inicializa `PaymentForm` a Stripe.js (`loadStripe(pk, { stripeAccount })`)? Reporta líneas exactas. F5 **calca** ese modelo (no el de `terminal`, que es `card_present`).
2. **Webhook y cuentas conectadas:** ¿`stripe-webhook` procesa eventos de cuentas conectadas (usa `event.account`, endpoint Connect)? Si sí, F5 puede usarlo como **respaldo**; si no, la confirmación será **solo** por `confirm_payment` (D-34). Reporta.
3. **`PosCheckoutScreen` / `PosSplitScreen` / `terminal.ts` (móvil):** dónde muestran el total a cobrar (¿`pos_tab_total`? ¿`posTabTotal()`?), y dónde llaman `create_tab_payment_intent`, `pos_create_split`, `pos_create_check`, `charge_split_check`, `mark_tab_paid`. Propón el cambio mínimo para que **todo lea `pos_table_balance.due_cents`** (secc. 4) en vez de `pos_tab_total`, y para mostrar "Pagado por clientes".
4. **`PosTableHub`:** dónde encaja el desglose "Consumo / Pagado por clientes / Pendiente" (junto al total actual).
5. **`pos_receipts_today` y la pantalla de recibos:** cómo tratar filas con `paid_by = null` (pagos de cliente) — propón etiqueta "Cliente (QR)" y que el dueño las vea; para el empleado, ver también las de sus mesas (`is_waiter_of_table`) o solo dueño — **propón y Planning decide**.
6. **Extracción de `PaymentForm`:** viabilidad de extraer el formulario Stripe de `CheckoutStep` a un componente compartido `web/components/StripePaymentForm.tsx` (props: `clientSecret, publishableKey, stripeAccount, amountLabel, onSuccess, onError`) **sin cambiar el comportamiento** del pago por orden.
7. **Estado de `pos_payments` en producción:** `select kind, status, count(*)` agrupado, y cuántas filas `pending` viejas quedan por mesa (para saber si el nuevo campo `session_opened_at` puede quedar `null` en históricos sin afectar nada).
8. **Diferencias** con el código/BD real.

---

## 4. Migración `164_table_balance_guest_pay.sql` (archivo completo, `begin/commit`)

```sql
-- 164: Saldo canónico de sesión + pagos de cliente por QR — Tab POS · F5 · D-09/D-10/D-33..D-36.
begin;

-- ── 1. pos_payments: sesión, invitado, reclamo ──────────────────────────────
alter table public.pos_payments
  add column if not exists session_opened_at timestamptz,          -- snapshot de tables.session_opened_at (sesión de ocupación)
  add column if not exists guest_session_id  uuid references public.guest_tab_sessions(id) on delete set null,
  add column if not exists claimed_at        timestamptz,          -- reclamo de una parte 'even' por un invitado (D-35)
  add column if not exists source            text not null default 'pos';  -- 'pos' (mesero) | 'guest' (cliente QR)
alter table public.pos_payments drop constraint if exists pos_payments_source_chk;
alter table public.pos_payments add constraint pos_payments_source_chk check (source in ('pos','guest'));
alter table public.pos_payments drop constraint if exists pos_payments_status_chk;
alter table public.pos_payments add constraint pos_payments_status_chk
  check (status in ('pending','processing','succeeded','failed','cancelled'));
create index if not exists pos_payments_session_idx
  on public.pos_payments (table_id, session_opened_at, status);
comment on column public.pos_payments.session_opened_at is 'Sesión de ocupación a la que pertenece el pago (= tables.session_opened_at al crearlo). Los pagos de sesiones anteriores no cuentan en el saldo. F5.';

-- ── 2. Saldo canónico de la sesión actual (lo usan M2, QR y pos_apply_payment) ─
create or replace function public.pos_table_balance(p_business_id uuid, p_table_id uuid)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare v_open timestamptz; v_items bigint; v_unalloc bigint; v_pending_guest bigint;
begin
  select t.session_opened_at into v_open from public.tables t
   where t.id = p_table_id and t.business_id = p_business_id;
  v_items := public.pos_tab_total(p_business_id, p_table_id);   -- ítems sin pagar (excluye awaiting)
  -- Pagos por MONTO (sin ítems) exitosos de ESTA sesión: reducen el pendiente pero no marcan ítems
  select coalesce(sum(pp.amount_cents),0) into v_unalloc from public.pos_payments pp
   where pp.business_id = p_business_id and pp.table_id = p_table_id
     and pp.status = 'succeeded' and pp.order_item_ids is null
     and v_open is not null and pp.session_opened_at = v_open;
  -- Partes de invitado reservadas (processing) para informar al UI, no afectan el pendiente
  select coalesce(sum(pp.amount_cents),0) into v_pending_guest from public.pos_payments pp
   where pp.business_id = p_business_id and pp.table_id = p_table_id and pp.source = 'guest'
     and pp.status = 'processing' and v_open is not null and pp.session_opened_at = v_open
     and pp.claimed_at > now() - interval '10 minutes';
  return jsonb_build_object(
    'session_opened_at', v_open,
    'items_unpaid_cents', v_items,
    'paid_unallocated_cents', v_unalloc,
    'due_cents', greatest(v_items - v_unalloc, 0),
    'guest_processing_cents', v_pending_guest
  );
end $$;
revoke all on function public.pos_table_balance(uuid, uuid) from public, anon;
grant execute on function public.pos_table_balance(uuid, uuid) to authenticated;  -- la EF usa service role

-- ── 3. pos_apply_payment reescrito: acotado a sesión y sin doble conteo (B1/B2) ─
create or replace function public.pos_apply_payment(p_payment_id uuid, p_tip_cents integer)
returns boolean language plpgsql security definer set search_path to '' as $$
declare v_biz uuid; v_table uuid; v_ids uuid[]; v_status text; v_open timestamptz; v_bal jsonb;
begin
  select business_id, table_id, order_item_ids, status, session_opened_at
    into v_biz, v_table, v_ids, v_status, v_open
  from public.pos_payments where id = p_payment_id for update;
  if v_biz is null then raise exception 'payment not found'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_table::text, 0));
  if v_status <> 'succeeded' then
    update public.pos_payments
       set status = 'succeeded', tip_cents = greatest(0, coalesce(p_tip_cents, 0)), updated_at = now(),
           session_opened_at = coalesce(session_opened_at, (select t.session_opened_at from public.tables t where t.id = v_table))
     where id = p_payment_id;
    if v_ids is not null and array_length(v_ids, 1) is not null then
      update public.order_items set paid_at = now() where id = any(v_ids) and paid_at is null;
    else
      v_bal := public.pos_table_balance(v_biz, v_table);   -- ya incluye este pago (succeeded)
      if (v_bal->>'due_cents')::bigint <= 0 then
        update public.order_items oi set paid_at = now()
          from public.orders o
         where oi.order_id = o.id and o.table_id = v_table and o.canceled_at is null
           and o.paid_at is null and oi.paid_at is null
           and coalesce(o.approval_status,'approved') <> 'awaiting';
      end if;
    end if;
    update public.orders o set paid_at = now()
     where o.table_id = v_table and o.paid_at is null and o.canceled_at is null
       and coalesce(o.approval_status,'approved') <> 'awaiting'
       and not exists (select 1 from public.order_items oi where oi.order_id = o.id and oi.paid_at is null);
  end if;
  return not exists (
    select 1 from public.orders o join public.order_items oi on oi.order_id = o.id
     where o.table_id = v_table and o.canceled_at is null and o.paid_at is null and oi.paid_at is null
       and coalesce(o.approval_status,'approved') <> 'awaiting');
end $$;
revoke all on function public.pos_apply_payment(uuid, integer) from public, anon, authenticated;

-- ── 4. pos_create_split / pos_create_check: sesión + reparto del PENDIENTE (D-33) ─
-- Copia los cuerpos reales de la BD y aplica SOLO estos cambios:
--  pos_create_split:
--   a) eliminar el guard 'split already in progress' (los pagos previos ya se descuentan del pendiente);
--   b) v_tab_total := (public.pos_table_balance(p_business_id, p_table_id)->>'due_cents')::bigint;
--   c) si p_method = 'items' y (pos_table_balance->>'paid_unallocated_cents')::bigint > 0
--        then raise exception 'UNALLOCATED_PAYMENTS' end if;   -- D-33
--   d) en el insert de cada fila añadir session_opened_at = (select session_opened_at from public.tables where id = p_table_id), source = 'pos';
--   e) el delete de pendientes: where ... and status = 'pending' and source = 'pos'  (no borrar partes reservadas por invitados).
--  pos_create_check:
--   a) mismo raise 'UNALLOCATED_PAYMENTS' si hay pagos por monto en la sesión;
--   b) insert con session_opened_at y source = 'pos'.

-- ── 5. Partes iguales para invitados (plan compartido) — D-35 ────────────────
create or replace function public.pos_guest_even_plan(p_business_id uuid, p_table_id uuid, p_ways integer)
returns table(payment_id uuid, amount_cents integer, status text, claimable boolean)
language plpgsql security definer set search_path to '' as $$
declare v_open timestamptz; v_due bigint; v_base bigint; v_rem bigint; v_i int; v_exists int;
begin
  select t.session_opened_at into v_open from public.tables t where t.id = p_table_id and t.business_id = p_business_id;
  if v_open is null then raise exception 'NO_SESSION'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_table_id::text, 0));
  select count(*) into v_exists from public.pos_payments pp
   where pp.table_id = p_table_id and pp.session_opened_at = v_open and pp.source = 'guest' and pp.kind = 'guest_even'
     and pp.status in ('pending','processing','succeeded');
  if v_exists = 0 then
    if p_ways is null or p_ways < 2 or p_ways > 20 then raise exception 'INVALID_WAYS'; end if;
    v_due := (public.pos_table_balance(p_business_id, p_table_id)->>'due_cents')::bigint;
    if v_due <= 0 then raise exception 'NOTHING_DUE'; end if;
    v_base := v_due / p_ways; v_rem := v_due - v_base * p_ways;
    for v_i in 1..p_ways loop
      insert into public.pos_payments (business_id, table_id, amount_cents, kind, status, source, session_opened_at)
      values (p_business_id, p_table_id, (v_base + case when v_i <= v_rem then 1 else 0 end)::int, 'guest_even', 'pending', 'guest', v_open);
    end loop;
  end if;
  return query
  select pp.id, pp.amount_cents, pp.status,
         (pp.status = 'pending' or (pp.status = 'processing' and pp.claimed_at < now() - interval '10 minutes')) as claimable
  from public.pos_payments pp
  where pp.table_id = p_table_id and pp.session_opened_at = v_open and pp.source = 'guest' and pp.kind = 'guest_even'
  order by pp.created_at, pp.id;
end $$;
revoke all on function public.pos_guest_even_plan(uuid, uuid, integer) from public, anon, authenticated;

-- Reclamar una parte (atómico): pending → processing con el invitado
create or replace function public.pos_guest_claim_share(p_payment_id uuid, p_guest_session_id uuid)
returns boolean language plpgsql security definer set search_path to '' as $$
declare v_n int;
begin
  update public.pos_payments
     set status = 'processing', claimed_at = now(), guest_session_id = p_guest_session_id, updated_at = now()
   where id = p_payment_id and source = 'guest' and kind = 'guest_even'
     and (status = 'pending' or (status = 'processing' and claimed_at < now() - interval '10 minutes'));
  get diagnostics v_n = row_count;
  return v_n = 1;
end $$;
revoke all on function public.pos_guest_claim_share(uuid, uuid) from public, anon, authenticated;

-- ── 6. Resumen para el invitado (lo llama la EF; devuelve ítems con estado de pago) ─
create or replace function public.pos_guest_table_summary(p_business_id uuid, p_table_id uuid)
returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object(
    'balance', public.pos_table_balance(p_business_id, p_table_id),
    'items', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'order_item_id', oi.id, 'order_id', o.id, 'name', mi.name, 'qty', oi.qty,
        'line_cents', oi.price_cents * oi.qty, 'paid', (oi.paid_at is not null),
        'reserved', exists (select 1 from public.pos_payments pp where pp.status = 'processing' and pp.claimed_at > now() - interval '10 minutes' and oi.id = any(pp.order_item_ids)),
        'guest_session_id', o.guest_session_id
      ) order by o.created_at, oi.id), '[]'::jsonb)
      from public.orders o join public.order_items oi on oi.order_id = o.id join public.menu_items mi on mi.id = oi.menu_item_id
      where o.business_id = p_business_id and o.table_id = p_table_id
        and o.canceled_at is null and coalesce(o.approval_status,'approved') <> 'awaiting'
        and o.created_at >= coalesce((select t.session_opened_at from public.tables t where t.id = p_table_id), o.created_at)
    ),
    'payments', (
      select coalesce(jsonb_agg(jsonb_build_object('amount_cents', pp.amount_cents, 'tip_cents', pp.tip_cents, 'source', pp.source, 'kind', pp.kind, 'at', pp.updated_at) order by pp.updated_at), '[]'::jsonb)
      from public.pos_payments pp
      where pp.business_id = p_business_id and pp.table_id = p_table_id and pp.status = 'succeeded'
        and pp.session_opened_at = (select t.session_opened_at from public.tables t where t.id = p_table_id)
    )
  );
$$;
revoke all on function public.pos_guest_table_summary(uuid, uuid) from public, anon, authenticated;

-- ── 7. Recibos: el dueño ve pagos de cliente; el empleado ve los suyos y los de sus mesas ─
-- Copiar cuerpo real de pos_receipts_today y cambiar el filtro final a:
--   AND (v_is_owner OR pp.paid_by = auth.uid() OR (pp.source = 'guest' AND public.is_waiter_of_table(pp.table_id)))
-- y añadir al SELECT: pp.source.

commit;
```
> Todo `create or replace` de funciones existentes parte del **cuerpo real de la BD**. Los cambios en `pos_create_split`, `pos_create_check`, `pos_receipts_today` van **escritos completos** en el archivo (no como comentarios).

---

## 5. EF `guest-tab` — acciones nuevas (Stripe: mismo modelo que `guest-pay`, verificado en Paso 0)

| action | input | output | errores |
|---|---|---|---|
| `summary` | `{ session_token }` | `{ pos_payment_mode, can_pay, table_label, balance:{items_unpaid_cents, paid_unallocated_cents, due_cents, guest_processing_cents}, items:[…con paid/reserved/mine], payments:[…], even_plan?:[{payment_id, amount_cents, status, claimable}] }` | `SESSION_INVALID` |
| `create_payment` | `{ session_token, split_kind:'full'\|'even'\|'items'\|'amount', ways?, payment_id? (parte even), order_item_ids?, amount_cents?, tip_cents? }` | `{ pos_payment_id, client_secret, publishable_key, stripe_account_id, base_cents, tip_cents, total_cents }` | `SESSION_INVALID`, `MODE_NOT_ALLOWED`, `NOTHING_DUE`, `INVALID_WAYS`, `SHARE_TAKEN`, `ITEMS_SPLIT_UNAVAILABLE`, `ITEM_ALREADY_PAID`, `ITEM_RESERVED`, `AMOUNT_OUT_OF_RANGE`, `TIP_OUT_OF_RANGE`, `STRIPE_ERROR` |
| `confirm_payment` | `{ session_token, pos_payment_id }` | `{ ok, status, tab_closed, receipt_code, remaining_due_cents }` | `SESSION_INVALID`, `PAYMENT_NOT_FOUND`, `NOT_SUCCEEDED` |
| `cancel_payment` | `{ session_token, pos_payment_id }` | `{ ok }` | — (libera una parte `processing` propia: `status='pending'`, `claimed_at=null`; cancela el PI si existe) |

**`create_payment` — reglas (todas en servidor):**
1. Validar sesión (`guest_tab_session_validate`); `pos_payment_mode='stripe'` o `MODE_NOT_ALLOWED`; `businessChargeGate` (mismo que `guest-pay`).
2. `bal = pos_table_balance`; si `due_cents <= 0` → `NOTHING_DUE`.
3. Por `split_kind`:
   - **`full`**: `base = due_cents`. Inserta `pos_payments (kind 'guest_full', source 'guest', status 'processing', claimed_at now, guest_session_id, session_opened_at)`.
   - **`even`**: si viene `payment_id` → `pos_guest_claim_share` (si `false` → `SHARE_TAKEN`); si no viene → `pos_guest_even_plan(ways)` y reclamar la **primera** `claimable`. `base = amount_cents` de esa fila.
   - **`items`**: si `paid_unallocated_cents > 0` → `ITEMS_SPLIT_UNAVAILABLE` (D-33). Validar que cada ítem pertenece a la mesa/sesión, no está pagado (`ITEM_ALREADY_PAID`) ni reservado (`ITEM_RESERVED`). `base = sum(line_cents)`. Inserta `pos_payments (kind 'guest_items', order_item_ids, …, status 'processing')`.
   - **`amount`**: `0 < amount_cents <= due_cents` o `AMOUNT_OUT_OF_RANGE`; mínimo 50 ¢ (Stripe). Inserta `kind 'guest_amount'`.
4. Propina: `0 <= tip_cents <= base` (`TIP_OUT_OF_RANGE`); `total = base + tip`. **`amount_cents` guarda solo la base** (igual que `terminal`).
5. PI: `stripe.paymentIntents.create({ amount: total, currency:'usd', automatic_payment_methods:{enabled:true} (o `payment_method_types:['card']` según guest-pay), metadata:{ payment_kind:'pos_guest', pos_payment_id, business_id, table_id, base_cents, tip_cents } }, { stripeAccount })`. Guardar `stripe_pi_id`. Devolver `client_secret` + `publishable_key` + `stripe_account_id`.
6. Concurrencia: `pg_advisory_xact_lock` lo dan las RPCs; en la EF, insertar la fila **antes** de crear el PI y, si Stripe falla, marcar `failed`.

**`confirm_payment` (D-34 — calca `mark_tab_paid`):** cargar la fila (debe ser `source='guest'` y de la sesión del token); `stripe.paymentIntents.retrieve(pi, { expand:['charges.data.payment_method_details'] }, { stripeAccount })`; si `succeeded` → `tip = pi.amount − amount_cents` → `pos_apply_payment(id, tip)` → `receipt_code` (22 chars base64url) + `card_brand/last4` (guard `receipt_code is null`) → responder con `tab_closed` y `remaining_due_cents` (nuevo `pos_table_balance`). Idempotente (si ya `succeeded`, devolver lo mismo). Si `requires_payment_method`/`canceled` → `NOT_SUCCEEDED` y **liberar** (`even` → `pending`; otros → `failed`).

**Webhook (respaldo, si el Paso 0 confirma Connect):** `payment_intent.succeeded` con `metadata.payment_kind='pos_guest'` → misma lógica que `confirm_payment` (idempotente por `status`).

---

## 6. Web (menú público)

- **`TabBalanceFab`**: visible si `guestSession` válida; polling `summary` cada 6 s mientras el menú esté visible (mismo patrón que `OrderStatusModal`); texto "Cuenta · $due" (o "Cuenta · $0 · cerrada" y desaparece tras `SESSION_INVALID`). En `external`: texto "Cuenta · $due" y al tocar solo el detalle (sin botón Pagar).
- **`TabBalanceSheet`**: lista de ítems (`qty × name`, importe, chips **Pagado** / **Reservado** / **Tuyo**), Consumo, Pagado, **Pendiente**, "Pagos recibidos" (monto + origen "Mesero"/"Cliente"), botón **Pagar** (solo `can_pay`).
- **`SplitMethodSheet`**: 4 tarjetas — **Todo el pendiente** · **Partes iguales** (stepper 2–20 si no hay plan; si hay plan, lista de partes con "Pagada / Reservada / Elegir") · **Por artículo** (checklist de ítems no pagados/no reservados; **oculta** si `paid_unallocated_cents > 0` con nota "Ya hay pagos por monto; usa Partes iguales o Monto") · **Monto libre** (input, máx. pendiente). Propina: 0 / 15 / 18 / 20 % / otra (máx. 100 %).
- **`StripePaymentForm`** (extraído de `CheckoutStep`, Paso 0 punto 6): `loadStripe(publishable_key, { stripeAccount })` + `PaymentElement`; al confirmar → `guestTab.confirmPayment` → **`TabPaymentReceipt`** (importe, propina, tarjeta •••• last4, `receipt_code`, y "Pendiente de la mesa: $X" o "**Cuenta cerrada** — ¡gracias!").
- Cancelar/atrás en el formulario → `cancel_payment` (libera parte `even`/reserva de ítems).
- `guestTabSession.ts`: `summary`, `createPayment`, `confirmPayment`, `cancelPayment`. i18n `menu`: `tabBalance.*`, `split.*`, `tabReceipt.*` (EN/ES).

---

## 7. Móvil (handheld)

- `mobile/services/pos.ts`: `posTableBalance(businessId, tableId)`; tipo `PosTableBalance`.
- **`PosTableHub`**: bloque "Consumo $X · Pagado por clientes $Y · Pendiente $Z" (si `Y>0` o `guest_processing_cents>0`, mostrar "Un cliente está pagando…" mientras haya reservas).
- **`PosCheckoutScreen` / `PosSplitScreen`**: el total a cobrar = `due_cents`; `PosSplitScreen` por ítems deshabilitado con mensaje si `paid_unallocated_cents > 0` (`UNALLOCATED_PAYMENTS`); "partes iguales" reparte el pendiente.
- **EF `terminal`**: `create_tab_payment_intent` usa `pos_table_balance.due_cents` como `baseCents` (**no** `pos_tab_total`), e inserta `session_opened_at` + `source='pos'`. `charge_split_check` sin cambios. Deploy de `terminal` por Juan.
- Realtime: `PosTableHub` ya escucha `orders`/`order_items`; añadir `pos_payments` UPDATE (filtrado por `business_id`) para refrescar el desglose.
- Recibos: etiqueta "Cliente (QR)" cuando `source='guest'`.

---

## 8. PROHIBIDO en F5
1. Confiar en importes, `table_id`, `order_item_ids` o `tip` del cliente sin validarlos en servidor; calcular totales fuera de `pos_table_balance`/RPCs.
2. Permitir pago QR en modo `external`; marcar ítems pagados sin verificar pertenencia a la mesa y sesión.
3. Cerrar la mesa con `due_cents > 0`; contar pagos de sesiones anteriores; sumar pagos por ítem como monto (B1/B2).
4. Cambiar el modelo de cargos (directo vs destino) respecto a `guest-pay`; tocar `payments`, `stripe-refund`, `tab-pay`.
5. Borrar filas `processing` de invitados desde `pos_create_split`; permitir split por ítems del mesero con pagos por monto vivos (D-33).
6. Depender del webhook para liquidar (D-34: `confirm_payment` es el camino primario).

---

## 9. Criterios de aceptación

**BD (Planning por SQL tras aplicar 164):**
- [ ] `pos_table_balance` devuelve `due = items_unpaid − paid_unallocated` **solo** de la sesión actual; con un pago `succeeded` de una sesión anterior en la misma mesa, **no** lo cuenta.
- [ ] `pos_apply_payment`: pago por ítem marca ítems y **no** entra en la cobertura por monto; pago por monto cierra solo cuando `due <= 0`.
- [ ] `pos_create_split('items')` con pagos por monto vivos → `UNALLOCATED_PAYMENTS`; `even` reparte el pendiente.
- [ ] `pos_guest_even_plan` crea el plan una sola vez por sesión; `pos_guest_claim_share` gana una sola vez por parte.

**Funcional (Juan, modo `stripe`, Stripe test):**
- [ ] Mesa $100 (4 ítems de $25): cliente A "Partes iguales ÷4" → paga $25 → handheld y teléfono de B muestran **Pendiente $75**; B "Monto libre $30" → $45; mesero cobra el resto con M2 → **$45** (no $100) → cuenta cerrada, mesa **Libre**, sesiones revocadas, botón flotante desaparece.
- [ ] Mesa nueva: cliente A paga "Por artículo" 2 ítems ($50) → pendiente $50; B intenta pagar uno de esos ítems → `ITEM_ALREADY_PAID`; mesero split por ítems del resto funciona (no hay pagos por monto).
- [ ] Mesa con pago por monto vivo → en el teléfono y en el handheld **no** se ofrece "por artículo".
- [ ] Dos clientes eligen la misma parte `even` a la vez → uno recibe `SHARE_TAKEN`; cancelar en el formulario libera la parte.
- [ ] Propina 18 % → recibo muestra base + propina; `pos_payments.tip_cents` correcto; `amount_cents` = base.
- [ ] Modo `external`: botón muestra el saldo sin "Pagar"; `create_payment` → `MODE_NOT_ALLOWED`.
- [ ] Regresión: pago Stripe por orden (`CheckoutStep`) intacto; cobro completo y split del M2 intactos en mesas sin pagos de cliente.

**Calidad:** tsc/build web; tsc móvil sin errores nuevos; `deno check` de `guest-tab` y `terminal`; EN/ES paridad; entrega 0.3 con `164` y los comandos `supabase functions deploy guest-tab|terminal --project-ref klfsgcfoahdtkojyqspd`.

---

## 10. Decisiones nuevas para Juan (confirmar en el OK)
- **D-33 — Exclusión ítems/monto:** en una sesión, una vez que existe un pago **por monto** (partes iguales o monto libre, de cliente o mesero), ya **no** se permite dividir **por artículo** (ni cliente ni mesero); el resto se paga por monto (todo / iguales / libre). Los pagos por artículo **nunca** bloquean los pagos por monto. Evita cobrar de más al mezclar.
- **D-34 — Confirmación primaria por `confirm_payment`** (recuperando el PI de Stripe, como el M2), con el webhook solo como respaldo.
- **D-35 — Partes iguales = plan compartido de la mesa:** el primero que elige "÷N" fija las N partes; los demás eligen una parte pendiente; las partes reservadas se liberan a los 10 min si no se pagan. El mesero, si re-divide, no toca las partes reservadas por clientes.
- **D-36 — Recibos:** el dueño ve los pagos de cliente; el empleado ve los suyos y los de las mesas que atiende, etiquetados "Cliente (QR)".

**Fin del spec F5.**
