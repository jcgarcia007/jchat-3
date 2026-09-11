# TAB POS — FASE F6: Cierre en modo external (efectivo / tarjeta externa) + residual móvil F5 + ventas con asterisco

**Versión:** 1.0 · **Fecha:** 2026-09-09 · **Autor:** Planning Claude (Fable)
**Documentos padre:** `TABPOS_PLAN_CUENTAS_CODIGO_v1.md` (0, 2, 7) y specs F2–F5. **Léelos antes.**
**Prerrequisito:** F5 mergeada a `main` (rama `feat/tabpos-f5-qr-pay`, migración 164 y las 3 EFs ya desplegadas). **Rama:** `feat/tabpos-f6-external-close` desde `origin/main` **después** del merge de F5. **Checkpoint:** NO (reporta el Paso 0 y continúa). **Migración:** `165_external_payments.sql`. Planning aplica por MCP.

---

## 1. Objetivo (D-06, D-11, D-14, D-15, D-36)

1. **Residual móvil de F5 (obligatorio, primero):** el handheld debe **mostrar y cobrar el pendiente real** (`pos_table_balance.due_cents`), no el total de ítems — hoy la EF `terminal` ya cobra `due_cents` en servidor, pero las pantallas siguen mostrando `sentTotal`/`open_total_cents`. Además: desglose "Consumo / Pagado por clientes / Pendiente" en `PosTableHub`, split por ítems deshabilitado bajo candado D-33, y etiqueta "Cliente (QR)" en recibos.
2. **Cierre en modo `external`:** el mesero cobra desde el handheld con **Efectivo** o **Tarjeta (terminal externa)** — sin Stripe ni M2 — registrando el pago en el sistema (`pos_payments`), liquidando por `pos_apply_payment` (mismo saldo, mismo candado), imprimiendo el recibo por la impresora del mesero (selector F2) y liberando la mesa al llegar a 0.
3. **Ventas con asterisco:** en `/dashboard/sales`, los pedidos que el cliente hizo desde su teléfono (`orders.source in ('customer_tab','customer_stripe')`) aparecen **bajo el mesero de la mesa** con **`*`**, cuentan solo cuando están pagados (`paid_at`), y el CSV lleva una columna "Origen". Los pedidos Stripe del webhook pasan a atribuirse al mesero de la mesa (D-14 completo).

---

## 2. Hechos verificados por Planning (2026-09-09)

### 2.1 Estado tras F5 (rama `feat/tabpos-f5-qr-pay`, migración 164 en prod)
- `pos_payments`: `session_opened_at, guest_session_id, claimed_at, source ('pos'|'guest')`, `status in (pending, processing, succeeded, failed, cancelled)`. **No tiene columna de método de pago** (efectivo/tarjeta/stripe): hoy se infiere por `stripe_pi_id`/`source`.
- `pos_table_balance(business, table) → {items_unpaid_cents, paid_unallocated_cents, due_cents, guest_processing_cents, session_opened_at}`; `pos_session_split_method → 'items'|'amount'|null`; `pos_apply_payment(payment_id, tip)` liquida cualquier `pos_payments` (ítems o monto) acotado a sesión; `pos_create_split`/`pos_create_check` con candado D-33; `pos_receipts_today` devuelve `source`.
- EF `terminal.create_tab_payment_intent` cobra `due_cents`; `mark_tab_paid` recupera el PI y aplica. EF `guest-tab` (`summary`, `create_payment`, `confirm_payment`, `cancel_payment`).
- **Pendiente que Codex dejó fuera del PR de F5 (móvil):** `PosTableHub` sin desglose; `PosCheckoutScreen`/`PosSplitScreen` muestran `sentTotal`/`open_total_cents` (no `due_cents`); recibos sin etiqueta de origen; `PosSplitScreen` por ítems no refleja el candado.

### 2.2 Modo de cobro
`businesses.pos_payment_mode ('stripe'|'external')` (F1); el handheld lo lee con `posBusinessSettings(businessId)` (`pos_business_settings`), sin consumidores aún.

### 2.3 Página de ventas (`web/app/dashboard/sales/page.tsx`, solo dueño)
Consulta directa a `orders` (`id, taken_by, tip_cents, subtotal_cents, tax_cents, discount_cents, total_cents, order_type, status, table_label, paid_at`) con `paid_at` en rango, `employees` (+`users`) y `table_waiters`; agrega en cliente por `taken_by` → `SellerStats`; `taken_by` nulo o no-empleado → "Sin asignar"; `OrderDetailRow` por pedido; CSV con 11 columnas. **No lee `orders.source`.**

### 2.4 Atribución hoy
- `pos_create_order` → `taken_by = auth.uid()` (mesero).
- `guest-tab.add_order` (con código) → `taken_by = resolve_table_waiter_for_attribution(table_id)` (D-14). `pos_approve_order` (sin código) → ídem.
- `stripe-webhook` (pago Stripe por orden) → **`taken_by = null`** → hoy cae en "Sin asignar". F6 lo corrige (+2 líneas, única modificación permitida al webhook).

### 2.5 Impresión de recibos del mesero
`buildReceiptEscPos(receipt, code, width_mm)` en `escpos.ts`; `PrinterPickerSheet` + `fetchStaffPrinters` (F2) — nunca `kitchen`/`bar` (D-16). Bluetooth llega en F7; en F6 el recibo sale por impresora de red `receipt`/`waiter`.

---

## 3. PASO 0 (reportar con plantilla 0.2; sin checkpoint — continúa tras reportar)

1. **Pantallas de cobro del handheld:** `PosCheckoutScreen`, `PosSplitScreen`, `PosTableHub` (footer), `PosReceiptsScreen`: dónde leen el total (`sentTotal`, `open_total_cents`, `posTabTotal`) y dónde llaman `createTabPaymentIntent`/`markTabPaid`/`chargeSplitCheck`/`posCreateSplit`/`posCreateCheck`. Propón el cambio mínimo para que **todo el flujo de cobro use `posTableBalance(...).due_cents`** y para insertar el selector de método en modo `external`.
2. **`posBusinessSettings`:** cómo cachearlo una vez por sesión POS (contexto o hook `usePosBusinessSettings`) para que Checkout/Split sepan el modo sin llamar la RPC en cada render.
3. **Recibo del mesero:** firma de `buildReceiptEscPos` y qué campos espera (`receipt`), para pasarle método (Efectivo/Tarjeta ext./Tarjeta M2/Cliente QR), propina y `receipt_code`. Dónde se imprime hoy el recibo tras `markTabPaid` (`fetchAnyPrinter` — **no** cambiar en F6; solo reutilizar el flujo y, si es trivial, redirigirlo a `fetchStaffPrinters`).
4. **`pos_receipts_today`** vuelve a cambiar el `RETURNS TABLE` (añade `payment_method`) → `drop function` + `create function` con cuerpo real (ya con `source`).
5. **Ventas web:** líneas exactas del `select` de `orders`, de `OrderRow`, de `OrderDetailRow`, de `SellerRow` y del CSV (`headers`/`rows`) para añadir `source` y el asterisco. ¿Existe `/dashboard/summary` u otra vista que agregue por `taken_by`? Si sí, listarla (misma marca).
6. **Webhook:** líneas del `insert` de `orders` en `handlePaymentSucceeded` para añadir `taken_by` cuando hay `table_id` (vía `db.rpc('resolve_table_waiter_for_attribution', { p_table_id })`).
7. **Diferencias** con el código/BD real.

---

## 4. Migración `165_external_payments.sql` (archivo completo, `begin/commit`)

```sql
-- 165: Método de pago + cierre en modo external — Tab POS · F6 · D-06/D-11/D-36.
begin;

-- ── 1. Método de pago explícito ──────────────────────────────────────────────
alter table public.pos_payments add column if not exists payment_method text;
alter table public.pos_payments drop constraint if exists pos_payments_method_chk;
alter table public.pos_payments add constraint pos_payments_method_chk
  check (payment_method is null or payment_method in ('stripe_terminal','stripe_web','cash','card_external'));
comment on column public.pos_payments.payment_method is
  'stripe_terminal = M2 (cargo directo); stripe_web = cliente por QR (destino); cash / card_external = cobrado por fuera en modo external. F6.';
-- Backfill de históricos (idempotente)
update public.pos_payments set payment_method = 'stripe_web'      where payment_method is null and source = 'guest';
update public.pos_payments set payment_method = 'stripe_terminal' where payment_method is null and source = 'pos' and stripe_pi_id is not null;

-- ── 2. Cobro externo (efectivo / tarjeta externa) — solo modo external ───────
-- p_payment_id: fila 'pending' del plan (split/check) a cobrar; null = "todo el pendiente".
create or replace function public.pos_apply_external_payment(
  p_business_id uuid, p_table_id uuid, p_method text, p_tip_cents integer default 0, p_payment_id uuid default null)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_uid uuid := auth.uid(); v_mode text; v_open timestamptz; v_bal jsonb; v_due bigint;
        v_pid uuid; v_amount integer; v_row record; v_closed boolean; v_code text;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public.pos_can_access(p_business_id) then raise exception 'NOT_ALLOWED'; end if;
  if p_method not in ('cash','card_external') then raise exception 'BAD_METHOD'; end if;
  select b.pos_payment_mode into v_mode from public.businesses b where b.id = p_business_id;
  if v_mode is distinct from 'external' then raise exception 'MODE_NOT_ALLOWED'; end if;
  if not (public.is_waiter_of_table(p_table_id) or public.owns_business_of_table(p_table_id)
          or not exists (select 1 from public.table_waiters tw where tw.table_id = p_table_id)) then
    raise exception 'NOT_ASSIGNED';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_table_id::text, 0));
  select t.session_opened_at into v_open from public.tables t where t.id = p_table_id and t.business_id = p_business_id;
  v_bal := public.pos_table_balance(p_business_id, p_table_id);
  v_due := (v_bal->>'due_cents')::bigint;

  if p_payment_id is not null then
    -- Cobrar una parte ya planificada por el mesero (split even / check por ítems)
    select * into v_row from public.pos_payments pp
     where pp.id = p_payment_id and pp.business_id = p_business_id and pp.table_id = p_table_id
       and pp.source = 'pos' and pp.status = 'pending' for update;
    if v_row.id is null then raise exception 'PAYMENT_NOT_PENDING'; end if;
    v_pid := v_row.id;
    update public.pos_payments set payment_method = p_method, paid_by = v_uid,
      session_opened_at = coalesce(session_opened_at, v_open), updated_at = now() where id = v_pid;
  else
    -- Todo el pendiente (siempre permitido, D-33)
    if v_due <= 0 then raise exception 'NOTHING_DUE'; end if;
    v_amount := v_due::integer;
    insert into public.pos_payments (business_id, table_id, amount_cents, kind, status, paid_by, session_opened_at, source, payment_method)
    values (p_business_id, p_table_id, v_amount, 'full', 'pending', v_uid, v_open, 'pos', p_method)
    returning id into v_pid;
  end if;

  v_closed := public.pos_apply_payment(v_pid, greatest(0, coalesce(p_tip_cents, 0)));

  -- receipt_code (mismo formato que terminal: 22 chars base64url), solo si no existe
  v_code := translate(encode(extensions.gen_random_bytes(16), 'base64'), '+/=', '-_');
  update public.pos_payments set receipt_code = coalesce(receipt_code, left(v_code, 22)) where id = v_pid;
  select receipt_code into v_code from public.pos_payments where id = v_pid;

  return jsonb_build_object('payment_id', v_pid, 'receipt_code', v_code, 'tab_closed', v_closed,
    'remaining_due_cents', (public.pos_table_balance(p_business_id, p_table_id)->>'due_cents')::bigint);
end $$;
revoke all on function public.pos_apply_external_payment(uuid, uuid, text, integer, uuid) from public, anon;
grant execute on function public.pos_apply_external_payment(uuid, uuid, text, integer, uuid) to authenticated;

-- ── 3. Recibos: método de pago en el listado ─────────────────────────────────
drop function if exists public.pos_receipts_today(uuid);
create function public.pos_receipts_today(p_business_id uuid)
returns table(id uuid, receipt_code text, table_label text, amount_cents integer, tip_cents integer, status text,
              paid_by uuid, source text, payment_method text, created_at timestamptz)
language plpgsql security definer set search_path to 'public' as $$
declare v_is_owner boolean; v_is_employee boolean;
begin
  -- (cuerpo real de 164 + payment_method en el select)
  v_is_owner := exists (select 1 from public.businesses b where b.id = p_business_id and b.owner_id = auth.uid());
  v_is_employee := public.is_employee_of_business(p_business_id);
  if not v_is_owner and not v_is_employee then raise exception 'no access'; end if;
  return query
    select pp.id, pp.receipt_code, t.label, pp.amount_cents, coalesce(pp.tip_cents,0), pp.status, pp.paid_by, pp.source, pp.payment_method, pp.created_at
    from public.pos_payments pp left join public.tables t on t.id = pp.table_id
    where pp.business_id = p_business_id and pp.status = 'succeeded'
      and pp.created_at >= (date_trunc('day', now() at time zone 'America/New_York') at time zone 'America/New_York')
      and (v_is_owner or pp.paid_by = auth.uid() or (pp.source = 'guest' and public.is_waiter_of_table(pp.table_id)))
    order by pp.created_at desc;
end $$;

commit;
```
**También:** en la EF `guest-tab.create_payment` y `terminal.create_tab_payment_intent`/`charge_split_check`, al crear `pos_payments`, **rellenar `payment_method`** (`'stripe_web'` / `'stripe_terminal'`). Y en `terminal.create_tab_payment_intent` y `charge_split_check`: si `businesses.pos_payment_mode = 'external'` → responder `409 MODE_NOT_ALLOWED` (el M2 no se usa en modo external).

---

## 5. Móvil (handheld)

### 5.0 Residual F5 (primero)
- `PosTableHub` footer: "Consumo $items · Pagado por clientes $unalloc · **Pendiente $due**" (mostrar las dos primeras solo si `unalloc>0` o `guest_processing_cents>0`; chip "Un cliente está pagando…" mientras haya `processing`). Realtime `pos_payments` UPDATE por `business_id` → refrescar balance.
- `PosCheckoutScreen`: el importe a cobrar = `due_cents`; si `due <= 0` → "Nada que cobrar" (la mesa se cerrará sola / ya cerró).
- `PosSplitScreen`: "partes iguales" reparte `due_cents`; "por ítems" muestra los ítems no pagados y queda **deshabilitado con mensaje** cuando `pos_session_split_method = 'amount'` (`METHOD_LOCKED_AMOUNT`), y "partes iguales" deshabilitado cuando `= 'items'`. Consumir los errores ya mapeados en `pos.ts` (`method_locked_*`).
- `PosReceiptsScreen`: etiqueta por `source`/`payment_method`: "Cliente (QR)", "Tarjeta (M2)", "Efectivo", "Tarjeta externa".

### 5.1 Modo external
- Hook `usePosBusinessSettings(businessId)` (cache por sesión POS; refresco al enfocar `PosHome`).
- `PosCheckoutScreen` en `external`: en vez del botón del M2, dos botones **Efectivo** / **Tarjeta (terminal externa)** + propina (mismos % que hoy). Confirmación → `pos_apply_external_payment(business, table, method, tip, null)` → recibo → si `tab_closed` volver a la grilla (mesa Libre).
- `PosSplitScreen` en `external`: cada parte pendiente se cobra con **Efectivo / Tarjeta ext.** → `pos_apply_external_payment(..., p_payment_id)`; al completar todas, la mesa se cierra sola.
- **Recibo:** tras cobrar, imprimir con `buildReceiptEscPos` vía `PrinterPickerSheet` (impresoras `receipt`/`waiter`; nunca cocina/bar), incluyendo método, propina, `receipt_code`. Si no hay impresora, mostrar el recibo en pantalla (código y totales) sin bloquear.
- Errores: `MODE_NOT_ALLOWED` ("Este negocio cobra con Stripe"), `NOTHING_DUE`, `PAYMENT_NOT_PENDING`, `NOT_ASSIGNED`.
- `pos.ts`: `posApplyExternalPayment(...)`, tipos; `PosReceiptRow.payment_method`.
- i18n móvil (`settings.json → pos.externalPay.*`, `pos.receipts.method.*`), EN/ES.

---

## 6. Web

### 6.1 Ventas con asterisco (`/dashboard/sales`)
- Añadir `source` al `select` de `orders` y a `OrderRow`/`OrderDetail`.
- `OrderDetailRow`: sufijo **`*`** junto al importe cuando `source in ('customer_tab','customer_stripe')`, con `title` "Pedido realizado por el cliente desde su teléfono".
- `SellerStats`: `customerOrderCount`; en `SellerRow` mostrar "N*" pequeño junto a pedidos cuando `> 0`.
- Leyenda al pie de la lista: "\* Pedido realizado por el cliente desde su teléfono (atribuido al mesero de la mesa)".
- CSV: columna **Origen** (`Mesero` / `Cliente`).
- Si existe `/dashboard/summary` (u otra vista por vendedor), misma marca (Paso 0 punto 5).
- i18n `dashboardCommon`: `salesCustomerOrderMark`, `salesCustomerOrderLegend`, `csvColOrigin`, `csvOriginWaiter`, `csvOriginCustomer`.

### 6.2 Webhook (única modificación permitida)
En `handlePaymentSucceeded`, antes del `insert` de `orders`: si hay `tableId`, `taken_by = (await db.rpc('resolve_table_waiter_for_attribution', { p_table_id: tableId })).data ?? null`; añadir `taken_by` al `insert`. Deploy de `stripe-webhook` por Juan.

---

## 7. PROHIBIDO en F6
1. Usar M2/Stripe en modo `external` (cliente o servidor); permitir `pos_apply_external_payment` en modo `stripe`.
2. Marcar pagado sin pasar por `pos_apply_payment`; saltarse el candado D-33 (una parte `pending` ya validada por `pos_create_split`/`check` es la única vía de cobro parcial externo).
3. Imprimir recibos en impresoras `kitchen`/`bar`.
4. Reponer inventario, tocar `settle_tab_payment`/`tab_payments`, cambiar el modelo de cargos de F5.
5. Cambiar el criterio "pagado = `paid_at`" del reporte de ventas; re-atribuir órdenes históricas (solo nuevas vía webhook).
6. Más de +2 líneas en `stripe-webhook`.

---

## 8. Criterios de aceptación

**BD (Planning por SQL tras 165):**
- [ ] `pos_payments.payment_method` con CHECK y backfill (`guest→stripe_web`, `pos+pi→stripe_terminal`).
- [ ] `pos_apply_external_payment` en modo `stripe` → `MODE_NOT_ALLOWED`; en `external` con `p_payment_id=null` cobra `due_cents`, liquida y cierra si `due=0`; con una parte `pending` la cobra; método inválido → `BAD_METHOD`.
- [ ] `pos_receipts_today` devuelve `payment_method`.

**Funcional (Juan):**
- [ ] **Residual F5 (modo stripe):** mesa $100, cliente paga $25 por QR → handheld muestra Pendiente $75 y el M2 cobra **$75**; split por ítems deshabilitado con mensaje.
- [ ] **External:** Bar XZX en `external`; mesa con consumo; handheld ofrece Efectivo/Tarjeta ext. (sin M2) → cobrar todo con Efectivo → recibo impreso en la impresora del mesero (no cocina) → mesa Libre; en recibos aparece "Efectivo".
- [ ] External + split iguales ÷2 → dos cobros externos → cierra al segundo.
- [ ] Ventas: pedido con código (`customer_tab`) pagado → bajo el mesero de la mesa con `*`; pedido Stripe nuevo → también atribuido con `*` (ya no "Sin asignar"); CSV con columna Origen; antes de pagar, no aparece.
- [ ] Regresión: modo `stripe` intacto (M2, split, QR); F4 aprobación intacta.

**Calidad:** tsc/build web, tsc móvil (sin errores nuevos), `deno check` terminal/guest-tab/stripe-webhook, EN/ES paridad; entrega 0.3 con `165` y los comandos de deploy: `terminal`, `guest-tab`, `stripe-webhook` (`--project-ref klfsgcfoahdtkojyqspd`).

---

## 9. Decisiones nuevas para Juan (confirmar)
- **D-38 — Cobro externo parcial solo por partes planificadas:** en modo external el mesero cobra "todo el pendiente" o una parte creada por split/check (iguales o ítems, bajo el candado D-33). No se admite "monto libre" tecleado a mano en el handheld (evita descuadres de caja). Si lo quieres, se añade como `p_amount_cents` con validación `≤ due` en una fase posterior.
- **D-39 — Backfill de `payment_method`** en históricos (`stripe_web`/`stripe_terminal`) para que los reportes no muestren vacíos.
- **D-40 — Pedidos Stripe del webhook se atribuyen al mesero de la mesa** desde F6 (solo nuevos; los históricos siguen en "Sin asignar").

**Fin del spec F6.**
