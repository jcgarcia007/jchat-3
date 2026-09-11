# TAB POS — FASE F4: Modo external — pedidos sin código, aprobación del mesero, alertas, strikes y bloqueo

**Versión:** 1.0 · **Fecha:** 2026-09-09 · **Autor:** Planning Claude (Fable)
**Documentos padre:** `TABPOS_PLAN_CUENTAS_CODIGO_v1.md` (0, 2, 7), `TABPOS_F2_SPEC_codigo_de_mesa.md`, `TABPOS_F3_SPEC_sesion_invitado_agregar_cuenta.md`. **Léelos antes.**
**Rama:** `feat/tabpos-f4-approval` desde `origin/main @ c17d16e` (F3 mergeada). **Checkpoint:** SÍ — Paso 0 y **espera OK** (seguridad).
**Migración:** `163_approval_strikes.sql`. Planning aplica por MCP; tú solo versionas.

---

## 1. Objetivo de F4

Con el negocio en **modo `external`** (D-05, D-07, D-08, D-12, D-22):

1. El cliente **sin código** puede enviar su pedido desde el menú por QR → la orden nace con **`approval_status='awaiting'`**: **no** va a cocina, **no** imprime comanda, **no** sale en KDS/tablero/métricas.
2. Al mesero le llega la **alerta** en el handheld (D-07): **ícono/contador en la tarjeta de la mesa**, **campanita global** con contador, y **vibración/sonido** según la configuración de alertas del negocio (nuevo tipo `approval` en `kds_settings.alerts`, mismo mecanismo que `ready`/`service_call`).
3. En la pantalla **"Por aprobar"** el mesero tiene **Aprobar**, **Editar** y **Rechazar**.
   - **Aprobar** → `approved`, se adjunta a la mesa (ya lo está por `table_id`), `taken_by` por D-14, y **el mismo handheld imprime la comanda** (reclamo atómico del puente F3) → entra a KDS.
   - **Editar** → D-29: la orden pendiente se marca **rechazada-por-edición** (sin strike) y sus ítems se cargan en el **borrador del mesero** para esa mesa; el mesero ajusta y envía por su flujo normal (`pos_create_order` → imprime, descuenta stock).
   - **Rechazar** → `rejected`, `canceled_at`, motivo opcional, **strike** al dispositivo; al **2.º strike en 30 días** → **bloqueo del dispositivo en todo el negocio por 30 días** (D-08).
4. El **dueño** ve y **desbloquea** dispositivos desde Configuración.
5. El **cliente** ve el estado de **sus** pedidos: *Esperando aprobación* / *Enviado a cocina* (+ recibido/preparando/listo) / *Ajustado por el mesero* / *No pudo procesarse*. Gateado por `customer_status_enabled` (D-12).

F4 **no** implementa: pago por QR (F5), cierre external (F6), rotación de código, topes.

---

## 2. Hechos verificados por Planning (2026-09-09, `main @ c17d16e` + BD)

### 2.1 Ya en producción (F3)
`orders.approval_status/approved_by/approved_at/rejected_reason/guest_device_id/guest_session_id/source/comanda_*`; tablas `guest_device_strikes`, `guest_device_blocks` (con policy de lectura para staff), `guest_code_attempts`, `guest_tab_sessions`, `guest_order_idempotency`; RPCs del puente (`pos_claim_comanda_print`, `pos_mark_comanda_printed`, `pos_release_comanda_print`, `pos_pending_comandas`) — **todas ya excluyen `approval_status='awaiting'`**, así que un pedido pendiente **no se imprime** aunque el puente lo vea. `orders` en `replica identity full`. EF `guest-tab` (`create_session`, `session_status`, `add_order`) desplegada. Hook `useComandaPrintBridge` montado en `PosNavigator` y funcionando (probado con impresora real).

### 2.2 `pos_void_order` NO sirve para rechazar pedidos del cliente
Cuerpo real: exige `status not in ('preparing','ready')` y **repone inventario** (`stock_by_location` y `menu_items.stock_count`, con `stock_movements 'void'`). Las órdenes del cliente **no descontaron stock** (D-27) → reponerlo crearía inventario fantasma. **F4 crea `pos_reject_order` propio, sin reposición.** Lo mismo aplica a "Editar" (D-29): no pasar por `pos_void_order`.

### 2.3 Consumidores que hoy NO filtran `awaiting` (hay que filtrar)
- `pos_pickup_board(p_business_id)`: `where o.paid_at is null and o.canceled_at is null and oi.item_status <> 'done'` — **sin** filtro de aprobación → añadir `and coalesce(o.approval_status,'approved') <> 'awaiting'`.
- KDS web `StationDisplay.tsx` (según Paso 0 F3): filtra `paid_at/canceled_at` y `item_status <> done` — **sin** filtro → añadir.
- `pos_kds_metrics` / `pos_kds_metrics_v2`, `get_table_order_status`, `pos_tables_overview.open_total_cents/open_since/state`: **verificar en Paso 0** y filtrar donde corresponda (un pedido `awaiting` **no** debe contar como consumo abierto ni marcar la mesa ocupada por sí solo; sí debe contar en el badge de "por aprobar").

### 2.4 Alertas del handheld (`mobile/hooks/usePosAlerts.ts`)
Config `PosAlertsConfig` desde `posKdsSettings(businessId)` → `businesses.kds_settings.alerts.{ready,service_call}.{vibration,sound,tone}`; fallback ambos `true`. `Vibration.vibrate(pattern)` + `useAudioPlayer(BEEP)` de `expo-audio`. Canales `pos-alerts-ready-*` (UPDATE `order_items`) y `pos-alerts-sc-*` (INSERT `service_calls` filtrado por negocio). **F4 añade el tipo `approval` a este hook** (nuevo canal `pos-alerts-approval-*`: INSERT en `orders` filtrado por `business_id`, disparar si `approval_status='awaiting'`), con patrón de vibración propio (p. ej. `[0,150,80,150,80,150,80,150]`) y **la misma** configuración de sonido/vibración editable por el dueño en el dashboard (sección de alertas KDS, 5d).

### 2.5 `PosTableHub.handleVoidOrder(orderId,'edit')` ya reconstruye el borrador
Toma los `order_items` de la orden y los carga en `PosDraftContext` por asiento (`setSeatDraft`). **F4 reutiliza exactamente ese bloque** (extraerlo a helper `rebuildDraftFromItems`) para "Editar", pero **sin** llamar a `pos_void_order`.

### 2.6 Trigger `sync_order_status_from_items`
Existe y recalcula `orders.status` desde los ítems (por eso `pos_void_order` funciona aunque `pos_create_order` inserte `'preparing'`). **Paso 0 confirma** qué `status` queda para una orden `awaiting` con ítems `pending` y que **no** interfiere con `approval_status`.

---

## 3. PASO 0 (reportar con plantilla 0.2 y ESPERAR OK)

1. **`sync_order_status_from_items` y `orders_status_changed`**: cuerpos reales (BD). ¿Qué `status` queda tras insertar una orden con ítems `pending`? ¿Algún trigger dispara notificaciones/impresión en INSERT de `orders` u `order_items`? Confirma que ninguno reacciona a `approval_status`.
2. **Lista completa de lectores de órdenes abiertas** y el filtro exacto a añadir en cada uno: `pos_pickup_board`, `pos_tables_overview` (¿un `awaiting` marca la mesa `ocupada`? ¿suma en `open_total_cents`? Propón: **no** ocupa ni suma; sí cuenta en un campo nuevo `awaiting_count`), `pos_table_items`, `pos_tab_total`, `pos_kds_metrics(_v2)`, `get_table_order_status`, KDS web (`StationDisplay.tsx` y cualquier `/dashboard/kitchen|bar`), `web/app/dashboard/orders` (si lista órdenes), `pos_receipts_today`, `usePosAlerts` (el canal `ready` no debe sonar por ítems de una orden `awaiting` — no puede pasar porque cocina no los ve, pero confírmalo).
3. **`pos_tables_overview` vuelve a cambiar de tipo de retorno** (`awaiting_count integer` al final) → `drop function` + `create function` con **cuerpo completo copiado de la BD** (ya con `has_access_code`), como se hizo en 160.
4. **`OrderStatusModal` (web)**: hoy lista **todos** los ítems de la mesa vía `get_table_order_status(p_token)`. Para mostrar estados de aprobación **solo de los pedidos del cliente**, propón usar la acción `order_status` de `guest-tab` (por `session_token` **o** por `table_qr_token + device_id` para los pedidos sin código) y mantener `get_table_order_status` para la vista general de la mesa (excluyendo `awaiting`/`rejected`).
5. **`CheckoutChoiceSheet`**: ubicación exacta del botón deshabilitado "Pedidos sin código: disponible en breve" (F3) para convertirlo en el flujo real; y cómo obtiene hoy `device_id`/`fingerprint`/captcha para reutilizarlos en `add_order_no_code`.
6. **Dashboard alertas (5d)** en `/dashboard/configuration`: forma exacta de `kds_settings.alerts` que guarda hoy y cómo añadir `approval` sin romper `usePosAlerts` (tipo `PosAlertsConfig` en `mobile/services/pos.ts`).
7. **Navegación móvil:** dónde montar la pantalla `PosApproval` (en `PosNavigator`), cómo abrirla desde la campanita de `PosHomeScreen` y desde el badge de la mesa, y cómo pasar `businessId`.
8. **Diferencias** con el código/BD real.

---

## 4. Migración `163_approval_strikes.sql` (archivo completo, `begin/commit`)

```sql
-- 163: Aprobación de pedidos sin código, strikes y bloqueo — Tab POS · F4 · D-05/D-07/D-08/D-22/D-29.
begin;

-- ── 1. Pedidos pendientes de aprobación (handheld) ───────────────────────────
create or replace function public.pos_awaiting_orders(p_business_id uuid)
returns table(
  order_id uuid, table_id uuid, table_label text, created_at timestamptz,
  contact_name text, notes text, subtotal_cents integer,
  guest_device_id text, device_strikes integer,
  items jsonb
)
language sql stable security definer set search_path to '' as $$
  select o.id, o.table_id, o.table_label, o.created_at, o.contact_name, o.notes, o.subtotal_cents,
         o.guest_device_id,
         (select count(*)::int from public.guest_device_strikes s
           where s.business_id = o.business_id and s.device_id = o.guest_device_id
             and s.created_at > now() - interval '30 days') as device_strikes,
         (select coalesce(jsonb_agg(jsonb_build_object(
             'order_item_id', oi.id, 'menu_item_id', oi.menu_item_id, 'name', mi.name,
             'qty', oi.qty, 'price_cents', oi.price_cents, 'options', oi.options,
             'special_instructions', oi.special_instructions, 'seat', oi.seat, 'station', mi.station
           ) order by oi.id), '[]'::jsonb)
          from public.order_items oi join public.menu_items mi on mi.id = oi.menu_item_id
          where oi.order_id = o.id) as items
  from public.orders o
  where o.business_id = p_business_id
    and (public.pos_can_access(p_business_id)
         or exists (select 1 from public.businesses b where b.id = p_business_id and b.owner_id = auth.uid()))
    and o.approval_status = 'awaiting' and o.canceled_at is null
  order by o.created_at asc;
$$;
revoke all on function public.pos_awaiting_orders(uuid) from public, anon;
grant execute on function public.pos_awaiting_orders(uuid) to authenticated;

-- ── 2. Aprobar ───────────────────────────────────────────────────────────────
create or replace function public.pos_approve_order(p_business_id uuid, p_order_id uuid)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_uid uuid := auth.uid(); v_table uuid; v_status text; v_label text;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not (public.pos_can_access(p_business_id)
          or exists (select 1 from public.businesses b where b.id = p_business_id and b.owner_id = v_uid)) then
    raise exception 'NOT_ALLOWED';
  end if;
  select o.table_id, o.approval_status, o.table_label into v_table, v_status, v_label
    from public.orders o where o.id = p_order_id and o.business_id = p_business_id for update;
  if v_table is null and v_status is null then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_status <> 'awaiting' then raise exception 'NOT_AWAITING'; end if;
  if v_table is not null and not (public.is_waiter_of_table(v_table) or public.owns_business_of_table(v_table)
       or not exists (select 1 from public.table_waiters tw where tw.table_id = v_table)) then
    raise exception 'NOT_ASSIGNED';
  end if;

  -- Asegurar sesión de mesa (D-02: la primera orden abre la mesa)
  if v_table is not null then
    perform pg_advisory_xact_lock(hashtextextended(v_table::text, 0));
    update public.tables t set
      access_code       = coalesce(t.access_code, public.generate_table_access_code(p_business_id)),
      session_opened_at = coalesce(t.session_opened_at, now()),
      session_opened_by = coalesce(t.session_opened_by, v_uid)
    where t.id = v_table;
  end if;

  update public.orders set
    approval_status = 'approved', approved_by = v_uid, approved_at = now(),
    taken_by = coalesce(public.resolve_table_waiter_for_attribution(v_table), v_uid),
    status_updated_at = now()
  where id = p_order_id;

  return jsonb_build_object('approved', true, 'order_id', p_order_id, 'table_id', v_table, 'table_label', v_label);
end $$;
revoke all on function public.pos_approve_order(uuid, uuid) from public, anon;
grant execute on function public.pos_approve_order(uuid, uuid) to authenticated;

-- ── 3. Rechazar (sin reposición de inventario) + strike + bloqueo ───────────
-- p_mode: 'reject' (cliente rechazado → strike) | 'edit' (el mesero lo rehace → SIN strike)
create or replace function public.pos_reject_order(p_business_id uuid, p_order_id uuid, p_reason text default null, p_mode text default 'reject')
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_uid uuid := auth.uid(); v_status text; v_device text; v_session uuid; v_strikes int := 0; v_blocked boolean := false; v_until timestamptz;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_mode not in ('reject','edit') then raise exception 'BAD_MODE'; end if;
  if not (public.pos_can_access(p_business_id)
          or exists (select 1 from public.businesses b where b.id = p_business_id and b.owner_id = v_uid)) then
    raise exception 'NOT_ALLOWED';
  end if;
  select o.approval_status, o.guest_device_id, o.guest_session_id into v_status, v_device, v_session
    from public.orders o where o.id = p_order_id and o.business_id = p_business_id for update;
  if v_status is null then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_status <> 'awaiting' then raise exception 'NOT_AWAITING'; end if;

  update public.orders set
    approval_status = 'rejected', rejected_reason = left(coalesce(p_reason, case when p_mode='edit' then 'edited_by_waiter' else null end), 200),
    approved_by = v_uid, approved_at = now(),
    canceled_at = now(), status = 'cancelled', status_updated_at = now()
  where id = p_order_id;
  -- NO se repone inventario: estas órdenes nunca lo descontaron (D-27).

  -- Strike solo en rechazo real de un pedido SIN código (sin sesión de invitado) y con dispositivo identificado
  if p_mode = 'reject' and v_device is not null and v_session is null then
    insert into public.guest_device_strikes (business_id, device_id, order_id, created_by)
    values (p_business_id, v_device, p_order_id, v_uid);
    select count(*) into v_strikes from public.guest_device_strikes s
     where s.business_id = p_business_id and s.device_id = v_device and s.created_at > now() - interval '30 days';
    if v_strikes >= 2 and not exists (
      select 1 from public.guest_device_blocks gb
       where gb.business_id = p_business_id and gb.device_id = v_device and gb.unblocked_at is null and gb.blocked_until > now()) then
      v_until := now() + interval '30 days';
      insert into public.guest_device_blocks (business_id, device_id, reason, blocked_until, created_by)
      values (p_business_id, v_device, 'rejected_orders', v_until, v_uid)
      on conflict do nothing;
      v_blocked := true;
      -- Revocar sesiones vivas de ese dispositivo en el negocio
      update public.guest_tab_sessions set revoked_at = now()
       where business_id = p_business_id and device_id = v_device and revoked_at is null;
    end if;
  end if;

  return jsonb_build_object('rejected', true, 'mode', p_mode, 'strikes', v_strikes, 'blocked', v_blocked, 'blocked_until', v_until);
end $$;
revoke all on function public.pos_reject_order(uuid, uuid, text, text) from public, anon;
grant execute on function public.pos_reject_order(uuid, uuid, text, text) to authenticated;

-- ── 4. Bloqueos: listar y desbloquear (dueño / staff con acceso POS) ─────────
create or replace function public.pos_list_blocked_devices(p_business_id uuid)
returns table(block_id uuid, device_id text, reason text, blocked_until timestamptz, created_at timestamptz, strikes integer, unblocked_at timestamptz)
language sql stable security definer set search_path to '' as $$
  select gb.id, gb.device_id, gb.reason, gb.blocked_until, gb.created_at,
         (select count(*)::int from public.guest_device_strikes s where s.business_id = gb.business_id and s.device_id = gb.device_id),
         gb.unblocked_at
  from public.guest_device_blocks gb
  where gb.business_id = p_business_id
    and (public.pos_can_access(p_business_id)
         or exists (select 1 from public.businesses b where b.id = p_business_id and b.owner_id = auth.uid()))
  order by (gb.unblocked_at is null and gb.blocked_until > now()) desc, gb.created_at desc;
$$;
revoke all on function public.pos_list_blocked_devices(uuid) from public, anon;
grant execute on function public.pos_list_blocked_devices(uuid) to authenticated;

create or replace function public.pos_unblock_device(p_business_id uuid, p_block_id uuid)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_uid uuid := auth.uid(); v_n int;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not (public.pos_can_access(p_business_id)
          or exists (select 1 from public.businesses b where b.id = p_business_id and b.owner_id = v_uid)) then
    raise exception 'NOT_ALLOWED';
  end if;
  update public.guest_device_blocks set unblocked_at = now(), unblocked_by = v_uid
   where id = p_block_id and business_id = p_business_id and unblocked_at is null;
  get diagnostics v_n = row_count;
  return jsonb_build_object('unblocked', v_n = 1);
end $$;
revoke all on function public.pos_unblock_device(uuid, uuid) from public, anon;
grant execute on function public.pos_unblock_device(uuid, uuid) to authenticated;

-- ── 5. Filtros: los pendientes no son consumo abierto ni cocina ──────────────
-- pos_pickup_board: copiar cuerpo real (BD) y añadir en el where:
--   and coalesce(o.approval_status,'approved') <> 'awaiting'
-- get_table_order_status: copiar cuerpo real (BD) y añadir en el where del jsonb_agg:
--   and coalesce(o.approval_status,'approved') = 'approved'   -- excluye awaiting y rejected
-- pos_tables_overview: DROP + CREATE con cuerpo real (BD) + (a) en las 4 subconsultas de órdenes
--   abiertas (state, open_total_cents, open_since, combinable) añadir
--   and coalesce(o.approval_status,'approved') <> 'awaiting'; (b) nuevo campo final
--   awaiting_count integer = (select count(*)::int from public.orders o where o.table_id = t.id
--   and o.business_id = p_business_id and o.approval_status = 'awaiting' and o.canceled_at is null).
-- pos_table_items / pos_tab_total / pos_kds_metrics(_v2): según Paso 0 punto 2, mismo filtro donde lean órdenes abiertas.
-- (Los cuerpos completos van aquí en el archivo; NO en comentarios. Este bloque es la instrucción.)

commit;
```

> Recuerda: **cuerpos completos reales** copiados de la BD para cada `create or replace` de funciones existentes; solo se añaden los filtros/campos indicados.

---

## 5. Edge Function `guest-tab` — acciones nuevas

| action | input | output | errores |
|---|---|---|---|
| `add_order_no_code` | `{ table_qr_token, device_id, fingerprint, captcha_token, idempotency_key, items[], contact_name?, notes? }` | `{ order_id, approval_status:'awaiting', subtotal_cents, items:[{name,qty}] }` | `VALIDATION`, `CAPTCHA_FAILED`(403), `TABLE_NOT_FOUND`(404), `MODE_NOT_ALLOWED`(403, si `pos_payment_mode <> 'external'`), `DEVICE_BLOCKED`(403), `RATE_LIMITED`(429: máx. **3 pedidos sin código por dispositivo por mesa cada 10 min**, usando una consulta a `orders` por `guest_device_id`+`table_id`+`created_at`), `MENU_ITEM_UNAVAILABLE`(409), `EMPTY_CART` |
| `order_status` | `{ session_token }` **o** `{ table_qr_token, device_id }` | `{ enabled: boolean, orders:[{ order_id, created_at, approval_status:null|'awaiting'|'approved'|'rejected', rejected_reason_kind:'edited'|'rejected'|null, items:[{ name, qty, item_status }] }] }` | `VALIDATION`, `TABLE_NOT_FOUND` |

**`add_order_no_code`:** calca `add_order` (precios `priceLinesFromDb`, `table_label` de la BD, idempotencia) con estas diferencias: hCaptcha **obligatorio**; **sin** sesión (`guest_session_id=null`); `approval_status='awaiting'`; `taken_by=null` (lo fija `pos_approve_order`); `source='customer_tab'`; **no** abre sesión de mesa (la abre la aprobación). Respeta bloqueo activo y rate limit. **No** crea `guest_tab_sessions`.

**`order_status`:** `enabled` = `kds_settings.customer_status_enabled` del negocio; si `false`, devolver `{enabled:false, orders:[]}`. Filtra órdenes por `guest_session_id` (si hay sesión) **o** por `guest_device_id` + `table_id` (últimas 12 h). `rejected_reason_kind` = `'edited'` si `rejected_reason='edited_by_waiter'`, `'rejected'` si `approval_status='rejected'` con otro motivo. **Nunca** devolver el motivo literal ni datos de otros clientes.

---

## 6. Móvil (handheld)

### 6.1 Alertas — `usePosAlerts` (extender, no duplicar)
- Tipo nuevo `'approval'` en `PosAlertsConfig` (`mobile/services/pos.ts`) con `{vibration, sound, tone}` y fallback `true/true`.
- Canal `pos-alerts-approval-${businessId}`: `postgres_changes` INSERT en `orders` filtrado por `business_id`; disparar `triggerAlert('approval')` si `payload.new.approval_status === 'awaiting'`. Patrón de vibración distinto (4 pulsos cortos). Sonido: mismo beep (tonos por tipo siguen siendo futuro).
- Contador global: hook `useAwaitingCount(businessId)` (Realtime INSERT/UPDATE en `orders` + `pos_awaiting_orders` al montar) expuesto por contexto ligero para la campanita.

### 6.2 `PosHomeScreen`
- Tarjeta de mesa: badge **"N por aprobar"** (naranja) cuando `awaiting_count > 0` (campo nuevo de `pos_tables_overview`), sin cambiar el layout base. Tocar la mesa con pendientes → abre `PosApproval` filtrada por esa mesa.
- Header: **campanita** con contador total → `PosApproval` (todas las mesas).

### 6.3 Pantalla `PosApproval` (nueva, en `PosNavigator`)
- Lista de `pos_awaiting_orders` (realtime + pull-to-refresh). Tarjeta: mesa, hora, `contact_name`, ítems (qty × nombre, modificadores, notas), total, y aviso **"Este dispositivo tiene N strikes"** si `device_strikes ≥ 1`.
- **Aprobar** → `pos_approve_order` → **inmediatamente** `printCustomerComanda(businessId, orderId, tableLabel)` (extraer de `useComandaPrintBridge` la función `tryPrint` a `mobile/services/comandaBridge.ts` y reutilizarla: reclamo → `printKitchenTickets` → marcar). Toast "Enviado a cocina". El puente sigue como respaldo (añadir al hook un listener **UPDATE** en `orders`: si `old.approval_status='awaiting'` y `new.approval_status='approved'` → `tryPrint`; el reclamo evita duplicados).
- **Editar** → confirmación → `pos_reject_order(..., p_mode:'edit')` → `rebuildDraftFromItems(tableId, items)` (helper extraído de `PosTableHub.handleVoidOrder('edit')`) → navegar a `PosTableHub` de esa mesa con el borrador cargado. Texto: "El pedido del cliente se cargó en tu borrador. Ajústalo y envíalo a cocina."
- **Rechazar** → hoja con motivo opcional (chips: "Sin existencia", "Pedido dudoso", "Otro") → si `device_strikes = 1` mostrar en la confirmación "**Al rechazar, este dispositivo quedará bloqueado 30 días**" → `pos_reject_order(..., 'reject')` → si `blocked` → Alert "Dispositivo bloqueado hasta {fecha}".
- Errores: `NOT_AWAITING` → "Este pedido ya fue procesado por otro mesero" y refrescar.

### 6.4 `PosTableHub`
- Encabezado: chip "N por aprobar" que abre `PosApproval` de la mesa.
- Nada más (los pendientes **no** aparecen en la lista de órdenes enviadas hasta aprobarse).

### 6.5 i18n móvil (`settings.json` → `pos.approval.*`, EN/ES)
`title, empty, badge, approve, edit, reject, editConfirm, editDone, rejectTitle, rejectReasonPlaceholder, reasonNoStock, reasonSuspicious, reasonOther, strikeWarning, blockedUntil, alreadyProcessed, sentToKitchen, deviceStrikes`.

---

## 7. Web

### 7.1 Cliente (`/m/[slug]`)
- `CheckoutChoiceSheet` (modo `external`, sin sesión): "No tengo código" → **envía** vía `add_order_no_code` (captcha invisible, `device_id`, `fingerprint`, `idempotency_key`) → `TabOrderConfirmation` variante **"Tu pedido está esperando la aprobación del mesero"** con botón "Ver estado".
- `OrderStatusModal`: usar `guest-tab.order_status` para **mis pedidos** (por sesión o por `device_id`) mostrando: *Esperando aprobación* · *Enviado a cocina* (con recibido/preparando/listo por ítem) · *El mesero ajustó tu pedido* (`edited`) · *No pudo procesarse, consulta a tu mesero* (`rejected`). Mantener la vista general de mesa con `get_table_order_status` (ya excluye pendientes/rechazados). Si `enabled=false`, no mostrar el botón (D-12).
- Manejo de `DEVICE_BLOCKED` en cualquier acción → pantalla "No puedes pedir desde este dispositivo. Pide ayuda a tu mesero."

### 7.2 Dashboard
- KDS (`StationDisplay.tsx` y páginas kitchen/bar): filtro `approval_status <> 'awaiting'` en la consulta y en el handler de Realtime.
- Configuración → **"Dispositivos bloqueados"**: tabla (`device_id` últimos 6 chars, motivo, strikes, desde, hasta, estado) con **Desbloquear** (`pos_unblock_device`) y confirmación. Solo dueño/staff con acceso.
- Configuración → alertas KDS (5d): fila **"Pedidos por aprobar"** con vibración/sonido (misma UI que `ready`/`service_call`), guardando `kds_settings.alerts.approval`.
- i18n `dashboardCommon`: claves para lo anterior (EN/ES).

---

## 8. PROHIBIDO en F4 (además del global)
1. Usar `pos_void_order` (o cualquier reposición de inventario) para rechazar/editar pedidos del cliente.
2. Imprimir comanda o mostrar en KDS/tablero/métricas un pedido `awaiting`.
3. Permitir `add_order_no_code` cuando `pos_payment_mode <> 'external'`.
4. Dar strike por **Editar**, por pedidos **con** código (`guest_session_id` no nulo), o sin `guest_device_id`.
5. Bloquear sin `guest_device_id`; devolver al cliente el motivo literal del rechazo o datos de otros clientes.
6. Cambiar `orders.status` a valores nuevos; tocar Stripe, `settle_tab_payment`, `pos_apply_payment`.
7. Guardar la config de alertas de aprobación en el dispositivo (va en `kds_settings.alerts` como las demás).

---

## 9. Criterios de aceptación

**BD (Planning por SQL tras aplicar 163):**
- [ ] RPCs nuevas existen con grants correctos; `pos_pickup_board`/`get_table_order_status`/`pos_tables_overview` excluyen `awaiting`; `pos_tables_overview` devuelve `awaiting_count`.
- [ ] `pos_reject_order` con `reject` sobre un pedido sin código: crea strike; 2.º strike en 30 días → `guest_device_blocks` activo 30 días y sesiones del dispositivo revocadas; con `edit` **no** crea strike; **no** toca `stock_*`.
- [ ] `pos_approve_order` sobre un `awaiting`: `approved`, `taken_by` por D-14, abre sesión de mesa si no existía; sobre uno ya procesado → `NOT_AWAITING`.

**Funcional (Juan):**
- [ ] Modo `external`, cliente sin código → pedido enviado → **no** imprime, **no** aparece en KDS ni tablero; el handheld vibra/suena (según config), la mesa muestra "1 por aprobar" y la campanita cuenta 1.
- [ ] **Aprobar** → comanda impresa **una sola vez** (aunque haya 2 handhelds), aparece en KDS, el cliente pasa a "Enviado a cocina" → "Preparando" → "Listo".
- [ ] **Editar** → borrador cargado en la mesa; enviar → comanda del mesero; el cliente ve "El mesero ajustó tu pedido"; **sin** strike.
- [ ] **Rechazar** ×2 al mismo teléfono → bloqueado; 3.er intento (con o sin código) → `DEVICE_BLOCKED`; desbloquear desde el dashboard → vuelve a pedir.
- [ ] Modo `stripe`: "No tengo código" no existe / `add_order_no_code` → `MODE_NOT_ALLOWED`.
- [ ] Con `customer_status_enabled=false` el cliente no ve estados.
- [ ] Regresión: pedidos del mesero y pedidos con código siguen imprimiendo y cobrándose igual.

**Calidad:** tsc/build web; tsc móvil sin errores nuevos; EN/ES paridad (web y móvil); entrega 0.3 con SHA, `163` incluida, y el comando `supabase functions deploy guest-tab --project-ref klfsgcfoahdtkojyqspd`.

---

## 10. Decisiones nuevas para Juan (confirmar en el OK)
- **D-29 — "Editar" = rechazo-por-edición + borrador del mesero.** La orden original queda `rejected` (`edited_by_waiter`, **sin** strike) y el mesero la reenvía por su flujo normal. Consecuencias: la nueva orden es del mesero (`source='pos'`, descuenta inventario, **sin** asterisco en ventas) y el cliente ve "El mesero ajustó tu pedido". Ventaja: reutiliza la edición de borradores existente y evita duplicar la lógica de precios en una RPC nueva.
- **D-30 — Config de alertas de aprobación en `kds_settings.alerts.approval`** (dueño, dashboard), igual que `ready`/`service_call`; no es un ajuste por dispositivo.
- **D-31 — Rate limit de pedidos sin código:** 3 por dispositivo por mesa cada 10 min (evita spam antes del primer strike).
- **D-32 — Ventana de strikes:** se cuentan los **últimos 30 días** (no de por vida).

**Fin del spec F4.**
