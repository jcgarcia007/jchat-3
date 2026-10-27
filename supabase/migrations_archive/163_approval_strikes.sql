-- 163_approval_strikes.sql
-- Aprobación de pedidos sin código, strikes y bloqueo — Tab POS · F4
-- D-05 / D-07 / D-08 / D-22 / D-29 / D-30 / D-31 / D-32
--
-- Cambios a funciones existentes (cuerpos completos copiados de BD + filtros añadidos):
--   1. pos_tables_overview    → excluye awaiting de métricas; añade awaiting_count
--   2. pos_pickup_board       → excluye awaiting
--   3. pos_table_items        → excluye awaiting
--   4. pos_tab_total          → excluye awaiting
--   5. get_table_order_status → excluye awaiting y rejected (solo approved)
--   6. pos_kds_metrics        → excluye awaiting
--   7. pos_kds_metrics_v2     → excluye awaiting
--
-- Funciones nuevas:
--   pos_awaiting_orders       → lista pedidos sin aprobar del negocio
--   pos_approve_order         → aprueba + abre sesión de mesa (D-14)
--   pos_reject_order          → rechaza/edita + strikes + bloqueo (D-08, D-29)
--   pos_list_blocked_devices  → lista bloqueos activos e históricos
--   pos_unblock_device        → desbloquea un dispositivo (dueño/staff)

begin;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. pos_tables_overview — DROP + CREATE (cambia tipo de retorno: añade awaiting_count)
-- ═══════════════════════════════════════════════════════════════════════════════

drop function if exists public.pos_tables_overview(uuid);

create or replace function public.pos_tables_overview(p_business_id uuid)
returns table(
  table_id          uuid,
  label             text,
  floor             text,
  seats             integer,
  party_size        integer,
  state             text,
  assignment        text,
  open_total_cents  bigint,
  open_since        timestamptz,
  combined_into     uuid,
  combined_seats    integer,
  combinable        boolean,
  has_access_code   boolean,
  awaiting_count    integer
)
language plpgsql
security definer
set search_path to ''
as $$
declare v_emp_id uuid;
begin
  if not public.pos_can_access(p_business_id) then raise exception 'no pos access'; end if;
  select e.id into v_emp_id
    from public.employees e
    where e.user_id = auth.uid() and e.business_id = p_business_id and e.status = 'accepted'
    limit 1;
  return query
  select
    t.id, t.label, t.floor, t.seats, t.party_size,
    -- state: awaiting solo no marca la mesa ocupada (necesita al menos una orden aprobada)
    case when exists (
        select 1 from public.orders o
        where o.table_id = t.id and o.business_id = p_business_id
          and o.paid_at is null and o.canceled_at is null
          and coalesce(o.approval_status, 'approved') <> 'awaiting'
      ) or t.combined_into is not null or t.session_opened_at is not null
    then 'ocupada' else 'libre' end as state,
    case
      when exists (select 1 from public.table_waiters tw
          where tw.table_id = t.id and tw.business_id = p_business_id
            and tw.employee_id = v_emp_id) then 'mine'
      when exists (select 1 from public.table_waiters tw
          where tw.table_id = t.id and tw.business_id = p_business_id) then 'other'
      else 'unassigned'
    end as assignment,
    -- open_total_cents: no suma pedidos awaiting
    coalesce((
      select sum(o.total_cents) from public.orders o
      where o.table_id = t.id and o.business_id = p_business_id
        and o.paid_at is null and o.canceled_at is null
        and coalesce(o.approval_status, 'approved') <> 'awaiting'
    ), 0) as open_total_cents,
    -- open_since: no incluye pedidos awaiting
    (select min(o.created_at) from public.orders o
      where o.table_id = t.id and o.business_id = p_business_id
        and o.paid_at is null and o.canceled_at is null
        and coalesce(o.approval_status, 'approved') <> 'awaiting') as open_since,
    t.combined_into,
    (t.seats + coalesce((
      select sum(a.seats) from public.tables a
      where a.combined_into = t.id and a.is_active
    ), 0))::integer as combined_seats,
    -- combinable: no bloqueado por awaiting solo
    (not exists (
        select 1 from public.orders o
        where o.table_id = t.id and o.business_id = p_business_id
          and o.paid_at is null and o.canceled_at is null
          and coalesce(o.approval_status, 'approved') <> 'awaiting'
      ) and coalesce(t.party_size, 0) = 0 and t.combined_into is null) as combinable,
    (t.access_code is not null) as has_access_code,
    -- awaiting_count: badge "N por aprobar" en el handheld
    (select count(*)::int from public.orders o
      where o.table_id = t.id and o.business_id = p_business_id
        and o.approval_status = 'awaiting' and o.canceled_at is null) as awaiting_count
  from public.tables t
  where t.business_id = p_business_id and t.is_active = true
  order by t.sort;
end;
$$;
revoke all on function public.pos_tables_overview(uuid) from public, anon;
grant execute on function public.pos_tables_overview(uuid) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. pos_pickup_board — excluye awaiting
-- ═══════════════════════════════════════════════════════════════════════════════

create or replace function public.pos_pickup_board(p_business_id uuid)
returns table(
  order_item_id  uuid,
  order_id       uuid,
  table_id       uuid,
  table_label    text,
  seat           integer,
  item_name      text,
  qty            integer,
  item_status    text,
  station        text,
  created_at     timestamptz,
  preparing_at   timestamptz,
  ready_at       timestamptz
)
language plpgsql
security definer
set search_path to ''
as $$
begin
  if not public.pos_can_access(p_business_id) then raise exception 'no pos access'; end if;
  return query
  select oi.id, oi.order_id, o.table_id, o.table_label, oi.seat,
         mi.name, oi.qty, oi.item_status, mi.station,
         oi.created_at, oi.preparing_at, oi.ready_at
  from public.orders o
  join public.order_items oi on oi.order_id = o.id
  join public.menu_items mi on mi.id = oi.menu_item_id
  where o.business_id = p_business_id
    and o.paid_at is null and o.canceled_at is null
    and coalesce(o.approval_status, 'approved') <> 'awaiting'
    and oi.item_status <> 'done'
  order by o.table_label, o.created_at, oi.seat nulls first, oi.id;
end;
$$;
revoke all on function public.pos_pickup_board(uuid) from public, anon;
grant execute on function public.pos_pickup_board(uuid) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. pos_table_items — excluye awaiting (mesero no ve pedidos sin aprobar mezclados)
-- ═══════════════════════════════════════════════════════════════════════════════

create or replace function public.pos_table_items(p_business_id uuid, p_table_id uuid)
returns table(
  order_item_id        uuid,
  order_id             uuid,
  order_status         text,
  seat                 integer,
  menu_item_id         uuid,
  item_name            text,
  qty                  integer,
  price_cents          integer,
  options              jsonb,
  special_instructions text,
  item_status          text
)
language plpgsql
security definer
set search_path to ''
as $$
begin
  if not public.pos_can_access(p_business_id) then raise exception 'no pos access'; end if;
  return query
  select oi.id, oi.order_id, o.status, oi.seat, oi.menu_item_id,
         mi.name, oi.qty, oi.price_cents, oi.options, oi.special_instructions, oi.item_status
  from public.orders o
  join public.order_items oi on oi.order_id = o.id
  join public.menu_items mi on mi.id = oi.menu_item_id
  where o.business_id = p_business_id and o.table_id = p_table_id
    and o.paid_at is null and o.canceled_at is null
    and coalesce(o.approval_status, 'approved') <> 'awaiting'
    and oi.paid_at is null
  order by o.created_at, oi.seat nulls first, oi.id;
end;
$$;
revoke all on function public.pos_table_items(uuid, uuid) from public, anon;
grant execute on function public.pos_table_items(uuid, uuid) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. pos_tab_total — excluye awaiting (no inflar el total a cobrar)
-- ═══════════════════════════════════════════════════════════════════════════════

create or replace function public.pos_tab_total(p_business_id uuid, p_table_id uuid)
returns bigint
language sql
stable
security definer
set search_path to ''
as $$
  select coalesce(sum(oi.price_cents * oi.qty), 0)::bigint
  from public.orders o
  join public.order_items oi on oi.order_id = o.id
  where o.business_id = p_business_id and o.table_id = p_table_id
    and o.paid_at is null and o.canceled_at is null
    and coalesce(o.approval_status, 'approved') <> 'awaiting'
    and oi.paid_at is null;
$$;
revoke all on function public.pos_tab_total(uuid, uuid) from public, anon;
grant execute on function public.pos_tab_total(uuid, uuid) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. get_table_order_status — solo órdenes approved (excluye awaiting y rejected)
-- ═══════════════════════════════════════════════════════════════════════════════

create or replace function public.get_table_order_status(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare v_table_id uuid; v_biz uuid; v_enabled boolean; v_items jsonb;
begin
  select t.id, t.business_id into v_table_id, v_biz
  from public.tables t where t.qr_token = p_token and t.is_active = true;
  if v_table_id is null then
    return jsonb_build_object('enabled', false, 'items', '[]'::jsonb);
  end if;

  select coalesce((b.kds_settings->>'customer_status_enabled')::boolean, false) into v_enabled
  from public.businesses b where b.id = v_biz;
  if not coalesce(v_enabled, false) then
    return jsonb_build_object('enabled', false, 'items', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'name', mi.name, 'qty', oi.qty, 'status', oi.item_status, 'station', mi.station
         ) order by o.created_at, oi.id), '[]'::jsonb) into v_items
  from public.orders o
  join public.order_items oi on oi.order_id = o.id
  join public.menu_items mi on mi.id = oi.menu_item_id
  where o.table_id = v_table_id
    and o.paid_at is null and o.canceled_at is null
    and coalesce(o.approval_status, 'approved') = 'approved';

  return jsonb_build_object('enabled', true, 'items', v_items);
end;
$$;
revoke all on function public.get_table_order_status(text) from public, anon;
grant execute on function public.get_table_order_status(text) to anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 6. pos_kds_metrics — excluye awaiting
-- ═══════════════════════════════════════════════════════════════════════════════

create or replace function public.pos_kds_metrics(
  p_business_id uuid,
  p_from        timestamptz default now() - interval '7 days',
  p_to          timestamptz default now()
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare v_result jsonb;
begin
  if not public.pos_can_access(p_business_id) then raise exception 'no pos access'; end if;

  with m as (
    select mi.station, mi.name,
           extract(epoch from (oi.preparing_at - oi.created_at)) as queue_s,
           extract(epoch from (oi.ready_at - oi.preparing_at))   as prep_s,
           extract(epoch from (oi.done_at - oi.ready_at))         as pickup_s
    from public.orders o
    join public.order_items oi on oi.order_id = o.id
    join public.menu_items mi on mi.id = oi.menu_item_id
    where o.business_id = p_business_id
      and o.canceled_at is null
      and coalesce(o.approval_status, 'approved') <> 'awaiting'
      and oi.created_at >= p_from and oi.created_at < p_to
  )
  select jsonb_build_object(
    'overall', (
      select jsonb_build_object(
        'count', count(*),
        'queue_secs',  round(avg(queue_s)  filter (where queue_s  is not null)),
        'prep_secs',   round(avg(prep_s)   filter (where prep_s   is not null)),
        'pickup_secs', round(avg(pickup_s) filter (where pickup_s is not null))
      ) from m
    ),
    'by_station', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'station', station, 'count', cnt,
        'queue_secs', queue_secs, 'prep_secs', prep_secs, 'pickup_secs', pickup_secs
      ) order by station), '[]'::jsonb)
      from (
        select station, count(*) cnt,
          round(avg(queue_s)  filter (where queue_s  is not null)) queue_secs,
          round(avg(prep_s)   filter (where prep_s   is not null)) prep_secs,
          round(avg(pickup_s) filter (where pickup_s is not null)) pickup_secs
        from m group by station
      ) s
    ),
    'slowest_prep', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'name', name, 'count', cnt, 'prep_secs', prep_secs
      ) order by prep_secs desc nulls last), '[]'::jsonb)
      from (
        select name, count(*) cnt,
          round(avg(prep_s) filter (where prep_s is not null)) prep_secs
        from m group by name
        having count(*) filter (where prep_s is not null) > 0
        order by prep_secs desc nulls last limit 5
      ) t
    )
  ) into v_result;

  return v_result;
end;
$$;
revoke all on function public.pos_kds_metrics(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.pos_kds_metrics(uuid, timestamptz, timestamptz) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 7. pos_kds_metrics_v2 — excluye awaiting
-- ═══════════════════════════════════════════════════════════════════════════════

create or replace function public.pos_kds_metrics_v2(
  p_business_id uuid,
  p_from        timestamptz,
  p_to          timestamptz,
  p_station     text    default null,
  p_taken_by    uuid    default null,
  p_tz          text    default 'UTC'
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_result jsonb;
  v_len interval := p_to - p_from;
begin
  if not (
    exists (select 1 from public.businesses bz where bz.id = p_business_id and bz.owner_id = auth.uid())
    or public.pos_can_access(p_business_id)
  ) then
    raise exception 'no pos access';
  end if;

  with base as (
    select mi.station, mi.name, o.taken_by, oi.created_at,
           extract(epoch from (oi.preparing_at - oi.created_at)) as queue_s,
           extract(epoch from (oi.ready_at - oi.preparing_at))   as prep_s,
           extract(epoch from (oi.done_at - oi.ready_at))        as pickup_s,
           extract(epoch from (oi.done_at - oi.created_at))      as wait_s,
           extract(hour from (oi.created_at at time zone p_tz))::int as hr,
           coalesce((mi.sla->>'pending_mins')::numeric,   (b.kds_settings->'sla'->>'pending_mins')::numeric)   * 60 as thr_queue_s,
           coalesce((mi.sla->>'preparing_mins')::numeric, (b.kds_settings->'sla'->>'preparing_mins')::numeric) * 60 as thr_prep_s,
           coalesce((mi.sla->>'ready_mins')::numeric,     (b.kds_settings->'sla'->>'ready_mins')::numeric)     * 60 as thr_pickup_s
    from public.orders o
    join public.order_items oi on oi.order_id = o.id
    join public.menu_items mi on mi.id = oi.menu_item_id
    join public.businesses b on b.id = o.business_id
    where o.business_id = p_business_id
      and o.canceled_at is null
      and coalesce(o.approval_status, 'approved') <> 'awaiting'
      and oi.created_at >= (p_from - v_len) and oi.created_at < p_to
      and (p_station is null or mi.station = p_station)
      and (p_taken_by is null or o.taken_by = p_taken_by)
  ), scored as (
    select base.*,
      (created_at >= p_from) as in_cur,
      case
        when (thr_queue_s is not null and queue_s is not null)
          or (thr_prep_s is not null and prep_s is not null)
          or (thr_pickup_s is not null and pickup_s is not null)
        then case
          when (thr_queue_s  is not null and queue_s  is not null and queue_s  > thr_queue_s)
            or (thr_prep_s   is not null and prep_s   is not null and prep_s   > thr_prep_s)
            or (thr_pickup_s is not null and pickup_s is not null and pickup_s > thr_pickup_s)
          then 0 else 1 end
        else null
      end as sla_ok
    from base
  ), cur as (select * from scored where in_cur)
  select jsonb_build_object(
    'overall', (select jsonb_build_object(
        'count', count(*),
        'queue_secs',  round(avg(queue_s)  filter (where queue_s  is not null)),
        'prep_secs',   round(avg(prep_s)   filter (where prep_s   is not null)),
        'pickup_secs', round(avg(pickup_s) filter (where pickup_s is not null)),
        'sla_pct',     round(avg(sla_ok)   filter (where sla_ok   is not null) * 100)
      ) from cur),
    'prev', (select jsonb_build_object(
        'count', count(*),
        'queue_secs',  round(avg(queue_s)  filter (where queue_s  is not null)),
        'prep_secs',   round(avg(prep_s)   filter (where prep_s   is not null)),
        'pickup_secs', round(avg(pickup_s) filter (where pickup_s is not null)),
        'sla_pct',     round(avg(sla_ok)   filter (where sla_ok   is not null) * 100)
      ) from scored where not in_cur),
    'by_station', (select coalesce(jsonb_agg(jsonb_build_object(
        'station', station, 'count', cnt,
        'queue_secs', q, 'prep_secs', p, 'pickup_secs', pk, 'sla_pct', sp
      ) order by station), '[]'::jsonb)
      from (
        select station, count(*) cnt,
          round(avg(queue_s)  filter (where queue_s  is not null)) q,
          round(avg(prep_s)   filter (where prep_s   is not null)) p,
          round(avg(pickup_s) filter (where pickup_s is not null)) pk,
          round(avg(sla_ok)   filter (where sla_ok   is not null) * 100) sp
        from cur group by station
      ) s),
    'by_waiter', (select coalesce(jsonb_agg(jsonb_build_object(
        'taken_by', taken_by, 'count', cnt,
        'wait_secs', w, 'pickup_secs', pk, 'sla_pct', sp
      ) order by cnt desc), '[]'::jsonb)
      from (
        select taken_by, count(*) cnt,
          round(avg(wait_s)   filter (where wait_s   is not null)) w,
          round(avg(pickup_s) filter (where pickup_s is not null)) pk,
          round(avg(sla_ok)   filter (where sla_ok   is not null) * 100) sp
        from cur group by taken_by
      ) w),
    'by_hour', (select coalesce(jsonb_agg(jsonb_build_object('hour', hr, 'count', cnt) order by hr), '[]'::jsonb)
      from (select hr, count(*) cnt from cur group by hr) h),
    'slowest', (select coalesce(jsonb_agg(jsonb_build_object(
        'name', name, 'count', cnt, 'prep_secs', p, 'sla_secs', ss, 'over_pct', op
      ) order by op desc nulls last, p desc nulls last), '[]'::jsonb)
      from (
        select name, count(*) cnt,
          round(avg(prep_s) filter (where prep_s is not null)) p,
          round(avg(thr_prep_s)) ss,
          case when avg(thr_prep_s) > 0 and avg(prep_s) filter (where prep_s is not null) is not null
               then round((avg(prep_s) filter (where prep_s is not null) - avg(thr_prep_s)) / avg(thr_prep_s) * 100)
               else null end op
        from cur group by name
        having count(*) filter (where prep_s is not null) > 0
        order by op desc nulls last, p desc nulls last
        limit 5
      ) t)
  ) into v_result;

  return v_result;
end;
$$;
revoke all on function public.pos_kds_metrics_v2(uuid, timestamptz, timestamptz, text, uuid, text) from public, anon;
grant execute on function public.pos_kds_metrics_v2(uuid, timestamptz, timestamptz, text, uuid, text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 8. pos_awaiting_orders — lista pedidos sin aprobar (handheld)
-- ═══════════════════════════════════════════════════════════════════════════════

create or replace function public.pos_awaiting_orders(p_business_id uuid)
returns table(
  order_id       uuid,
  table_id       uuid,
  table_label    text,
  created_at     timestamptz,
  contact_name   text,
  notes          text,
  subtotal_cents integer,
  guest_device_id text,
  device_strikes integer,
  items          jsonb
)
language sql
stable
security definer
set search_path to ''
as $$
  select o.id, o.table_id, o.table_label, o.created_at, o.contact_name, o.notes, o.subtotal_cents,
         o.guest_device_id,
         (select count(*)::int
            from public.guest_device_strikes s
           where s.business_id = o.business_id
             and s.device_id = o.guest_device_id
             and s.created_at > now() - interval '30 days') as device_strikes,
         (select coalesce(jsonb_agg(jsonb_build_object(
              'order_item_id', oi.id,
              'menu_item_id',  oi.menu_item_id,
              'name',          mi.name,
              'qty',           oi.qty,
              'price_cents',   oi.price_cents,
              'options',       oi.options,
              'special_instructions', oi.special_instructions,
              'seat',          oi.seat,
              'station',       mi.station
            ) order by oi.id), '[]'::jsonb)
           from public.order_items oi
           join public.menu_items mi on mi.id = oi.menu_item_id
          where oi.order_id = o.id) as items
  from public.orders o
  where o.business_id = p_business_id
    and (public.pos_can_access(p_business_id)
         or exists (select 1 from public.businesses b where b.id = p_business_id and b.owner_id = auth.uid()))
    and o.approval_status = 'awaiting'
    and o.canceled_at is null
  order by o.created_at asc;
$$;
revoke all on function public.pos_awaiting_orders(uuid) from public, anon;
grant execute on function public.pos_awaiting_orders(uuid) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 9. pos_approve_order — aprueba + abre sesión de mesa (D-14)
-- ═══════════════════════════════════════════════════════════════════════════════

create or replace function public.pos_approve_order(p_business_id uuid, p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_table  uuid;
  v_status text;
  v_label  text;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not (public.pos_can_access(p_business_id)
          or exists (select 1 from public.businesses b where b.id = p_business_id and b.owner_id = v_uid)) then
    raise exception 'NOT_ALLOWED';
  end if;

  select o.table_id, o.approval_status, o.table_label
    into v_table, v_status, v_label
  from public.orders o
  where o.id = p_order_id and o.business_id = p_business_id
  for update;

  if v_status is null then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_status <> 'awaiting' then raise exception 'NOT_AWAITING'; end if;

  -- Verificar asignación de mesa (si hay waiters asignados, solo el asignado puede aprobar)
  if v_table is not null
     and exists (select 1 from public.table_waiters tw where tw.table_id = v_table)
     and not (public.is_waiter_of_table(v_table) or public.owns_business_of_table(v_table)) then
    raise exception 'NOT_ASSIGNED';
  end if;

  -- Abrir sesión de mesa en la primera orden aprobada (D-02: la primera orden abre la mesa)
  if v_table is not null then
    perform pg_advisory_xact_lock(hashtextextended(v_table::text, 0));
    update public.tables t set
      access_code       = coalesce(t.access_code, public.generate_table_access_code(p_business_id)),
      session_opened_at = coalesce(t.session_opened_at, now()),
      session_opened_by = coalesce(t.session_opened_by, v_uid)
    where t.id = v_table;
  end if;

  update public.orders set
    approval_status   = 'approved',
    approved_by       = v_uid,
    approved_at       = now(),
    taken_by          = coalesce(public.resolve_table_waiter_for_attribution(v_table), v_uid),
    status_updated_at = now()
  where id = p_order_id;

  return jsonb_build_object(
    'approved',    true,
    'order_id',    p_order_id,
    'table_id',    v_table,
    'table_label', v_label
  );
end;
$$;
revoke all on function public.pos_approve_order(uuid, uuid) from public, anon;
grant execute on function public.pos_approve_order(uuid, uuid) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 10. pos_reject_order — rechaza (con strike) o edita (sin strike, D-29)
-- ═══════════════════════════════════════════════════════════════════════════════
-- p_mode: 'reject' → strike al dispositivo; 'edit' → sin strike (el mesero reenvía)
-- NO repone inventario (D-27: estas órdenes nunca lo descontaron).
-- Strike solo si: p_mode='reject' AND guest_device_id IS NOT NULL AND guest_session_id IS NULL
-- Al 2.º strike en 30 días → bloqueo 30 días y revocación de sesiones del dispositivo (D-08).

create or replace function public.pos_reject_order(
  p_business_id uuid,
  p_order_id    uuid,
  p_reason      text    default null,
  p_mode        text    default 'reject'
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_status   text;
  v_device   text;
  v_session  uuid;
  v_strikes  int  := 0;
  v_blocked  boolean := false;
  v_until    timestamptz;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_mode not in ('reject', 'edit') then raise exception 'BAD_MODE'; end if;
  if not (public.pos_can_access(p_business_id)
          or exists (select 1 from public.businesses b where b.id = p_business_id and b.owner_id = v_uid)) then
    raise exception 'NOT_ALLOWED';
  end if;

  select o.approval_status, o.guest_device_id, o.guest_session_id
    into v_status, v_device, v_session
  from public.orders o
  where o.id = p_order_id and o.business_id = p_business_id
  for update;

  if v_status is null then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_status <> 'awaiting' then raise exception 'NOT_AWAITING'; end if;

  update public.orders set
    approval_status   = 'rejected',
    -- Modo edición: reason='edited_by_waiter' (el cliente verá "El mesero ajustó tu pedido")
    rejected_reason   = left(coalesce(p_reason,
                          case when p_mode = 'edit' then 'edited_by_waiter' else null end), 200),
    approved_by       = v_uid,
    approved_at       = now(),
    canceled_at       = now(),
    status            = 'cancelled',
    status_updated_at = now()
  where id = p_order_id;

  -- NO se repone inventario: estas órdenes nunca lo descontaron (D-27).

  -- Strike: solo rechazo real, pedido SIN código (sin sesión), con device_id identificado
  if p_mode = 'reject' and v_device is not null and v_session is null then
    insert into public.guest_device_strikes (business_id, device_id, order_id, created_by)
    values (p_business_id, v_device, p_order_id, v_uid);

    select count(*)::int into v_strikes
    from public.guest_device_strikes s
    where s.business_id = p_business_id
      and s.device_id   = v_device
      and s.created_at  > now() - interval '30 days';  -- D-32: ventana 30 días

    -- Bloqueo al 2.º strike (D-08: STRIKES_TO_BLOCK = 2)
    if v_strikes >= 2 and not exists (
        select 1 from public.guest_device_blocks gb
        where gb.business_id  = p_business_id
          and gb.device_id    = v_device
          and gb.unblocked_at is null
          and gb.blocked_until > now()
      ) then
      v_until := now() + interval '30 days';
      insert into public.guest_device_blocks (business_id, device_id, reason, blocked_until, created_by)
      values (p_business_id, v_device, 'rejected_orders', v_until, v_uid)
      on conflict do nothing;
      v_blocked := true;
      -- Revocar sesiones vivas del dispositivo en este negocio
      update public.guest_tab_sessions set revoked_at = now()
      where business_id = p_business_id
        and device_id   = v_device
        and revoked_at  is null;
    end if;
  end if;

  return jsonb_build_object(
    'rejected',      true,
    'mode',          p_mode,
    'strikes',       v_strikes,
    'blocked',       v_blocked,
    'blocked_until', v_until
  );
end;
$$;
revoke all on function public.pos_reject_order(uuid, uuid, text, text) from public, anon;
grant execute on function public.pos_reject_order(uuid, uuid, text, text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 11. pos_list_blocked_devices — lista bloqueos activos e históricos
-- ═══════════════════════════════════════════════════════════════════════════════

create or replace function public.pos_list_blocked_devices(p_business_id uuid)
returns table(
  block_id      uuid,
  device_id     text,
  reason        text,
  blocked_until timestamptz,
  created_at    timestamptz,
  strikes       integer,
  unblocked_at  timestamptz
)
language sql
stable
security definer
set search_path to ''
as $$
  select gb.id, gb.device_id, gb.reason, gb.blocked_until, gb.created_at,
         (select count(*)::int
            from public.guest_device_strikes s
           where s.business_id = gb.business_id
             and s.device_id   = gb.device_id) as strikes,
         gb.unblocked_at
  from public.guest_device_blocks gb
  where gb.business_id = p_business_id
    and (public.pos_can_access(p_business_id)
         or exists (select 1 from public.businesses b where b.id = p_business_id and b.owner_id = auth.uid()))
  order by (gb.unblocked_at is null and gb.blocked_until > now()) desc, gb.created_at desc;
$$;
revoke all on function public.pos_list_blocked_devices(uuid) from public, anon;
grant execute on function public.pos_list_blocked_devices(uuid) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 12. pos_unblock_device — desbloquea un dispositivo (dueño/staff con acceso POS)
-- ═══════════════════════════════════════════════════════════════════════════════

create or replace function public.pos_unblock_device(p_business_id uuid, p_block_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_uid uuid := auth.uid();
  v_n   int;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not (public.pos_can_access(p_business_id)
          or exists (select 1 from public.businesses b where b.id = p_business_id and b.owner_id = v_uid)) then
    raise exception 'NOT_ALLOWED';
  end if;

  update public.guest_device_blocks set
    unblocked_at = now(),
    unblocked_by = v_uid
  where id = p_block_id
    and business_id   = p_business_id
    and unblocked_at  is null;

  get diagnostics v_n = row_count;
  return jsonb_build_object('unblocked', v_n = 1);
end;
$$;
revoke all on function public.pos_unblock_device(uuid, uuid) from public, anon;
grant execute on function public.pos_unblock_device(uuid, uuid) to authenticated;

commit;
