-- 164: Saldo canónico de sesión + pagos de cliente por QR — Tab POS · F5 · D-09/D-10/D-33..D-36.
-- Planning aplica por MCP. NO ejecutar directamente.
begin;

-- ── 1. pos_payments: sesión, invitado, reclamo ──────────────────────────────
alter table public.pos_payments
  add column if not exists session_opened_at timestamptz,
  add column if not exists guest_session_id  uuid references public.guest_tab_sessions(id) on delete set null,
  add column if not exists claimed_at        timestamptz,
  add column if not exists source            text not null default 'pos';

alter table public.pos_payments drop constraint if exists pos_payments_source_chk;
alter table public.pos_payments add constraint pos_payments_source_chk
  check (source in ('pos','guest'));

alter table public.pos_payments drop constraint if exists pos_payments_status_chk;
alter table public.pos_payments add constraint pos_payments_status_chk
  check (status in ('pending','processing','succeeded','failed','cancelled'));

create index if not exists pos_payments_session_idx
  on public.pos_payments (table_id, session_opened_at, status);

comment on column public.pos_payments.session_opened_at is
  'Sesión de ocupación a la que pertenece el pago (= tables.session_opened_at al crearlo). '
  'Los pagos de sesiones anteriores no cuentan en el saldo. F5.';

-- ── 2. Saldo canónico de la sesión actual (lo usan M2, QR y pos_apply_payment) ─
create or replace function public.pos_table_balance(p_business_id uuid, p_table_id uuid)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare
  v_open         timestamptz;
  v_items        bigint;
  v_unalloc      bigint;
  v_pending_guest bigint;
begin
  select t.session_opened_at into v_open
  from public.tables t
  where t.id = p_table_id and t.business_id = p_business_id;

  v_items := public.pos_tab_total(p_business_id, p_table_id);  -- ítems sin pagar (excluye awaiting)

  -- Pagos por MONTO (sin ítems) exitosos de ESTA sesión: reducen el pendiente pero no marcan ítems
  select coalesce(sum(pp.amount_cents), 0) into v_unalloc
  from public.pos_payments pp
  where pp.business_id = p_business_id and pp.table_id = p_table_id
    and pp.status = 'succeeded' and pp.order_item_ids is null
    and v_open is not null and pp.session_opened_at = v_open;

  -- Partes de invitado reservadas (processing) — informativo, no afectan due_cents
  select coalesce(sum(pp.amount_cents), 0) into v_pending_guest
  from public.pos_payments pp
  where pp.business_id = p_business_id and pp.table_id = p_table_id
    and pp.source = 'guest' and pp.status = 'processing'
    and v_open is not null and pp.session_opened_at = v_open
    and pp.claimed_at > now() - interval '10 minutes';

  return jsonb_build_object(
    'session_opened_at',     v_open,
    'items_unpaid_cents',    v_items,
    'paid_unallocated_cents', v_unalloc,
    'due_cents',             greatest(v_items - v_unalloc, 0),
    'guest_processing_cents', v_pending_guest
  );
end $$;

revoke all on function public.pos_table_balance(uuid, uuid) from public, anon;
grant execute on function public.pos_table_balance(uuid, uuid) to authenticated;

-- ── 3. pos_apply_payment reescrito: acotado a sesión y sin doble conteo (B1/B2) ─
create or replace function public.pos_apply_payment(p_payment_id uuid, p_tip_cents integer)
returns boolean language plpgsql security definer set search_path to '' as $$
declare
  v_biz    uuid;
  v_table  uuid;
  v_ids    uuid[];
  v_status text;
  v_open   timestamptz;
  v_bal    jsonb;
begin
  select business_id, table_id, order_item_ids, status, session_opened_at
    into v_biz, v_table, v_ids, v_status, v_open
  from public.pos_payments where id = p_payment_id for update;

  if v_biz is null then raise exception 'payment not found'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_table::text, 0));

  if v_status <> 'succeeded' then
    update public.pos_payments
       set status = 'succeeded',
           tip_cents = greatest(0, coalesce(p_tip_cents, 0)),
           updated_at = now(),
           session_opened_at = coalesce(
             session_opened_at,
             (select t.session_opened_at from public.tables t where t.id = v_table)
           )
     where id = p_payment_id;

    if v_ids is not null and array_length(v_ids, 1) is not null then
      -- Pago por ítems: marcar solo esos ítems (no afecta el cálculo de monto)
      update public.order_items
         set paid_at = now()
       where id = any(v_ids) and paid_at is null;
    else
      -- Pago por monto: verificar si el pendiente (esta sesión) quedó en 0
      v_bal := public.pos_table_balance(v_biz, v_table);  -- ya incluye este pago (succeeded)
      if (v_bal->>'due_cents')::bigint <= 0 then
        update public.order_items oi
           set paid_at = now()
          from public.orders o
         where oi.order_id = o.id and o.table_id = v_table
           and o.canceled_at is null and o.paid_at is null and oi.paid_at is null
           and coalesce(o.approval_status, 'approved') <> 'awaiting';
      end if;
    end if;

    -- Cerrar órdenes con todos sus ítems pagados
    update public.orders o
       set paid_at = now()
     where o.table_id = v_table and o.paid_at is null and o.canceled_at is null
       and coalesce(o.approval_status, 'approved') <> 'awaiting'
       and not exists (
         select 1 from public.order_items oi
          where oi.order_id = o.id and oi.paid_at is null
       );
  end if;

  -- ¿Quedan ítems sin pagar?
  return not exists (
    select 1 from public.orders o
    join public.order_items oi on oi.order_id = o.id
    where o.table_id = v_table and o.canceled_at is null and o.paid_at is null
      and oi.paid_at is null
      and coalesce(o.approval_status, 'approved') <> 'awaiting'
  );
end $$;

revoke all on function public.pos_apply_payment(uuid, integer) from public, anon, authenticated;
-- La EF la llama con service role; NO se expone a clientes autenticados.

-- ── 4. pos_create_split reescrito: sesión + reparto del PENDIENTE (D-33) ────
-- Cambios vs. cuerpo real:
--   a) Sin guard 'split already in progress'
--   b) usa pos_table_balance.due_cents en vez de pos_tab_total
--   c) D-33: 'items' bloqueado si hay pagos por monto en la sesión
--   d) INSERT añade session_opened_at + source='pos'
--   e) DELETE sólo borra 'pending' de source='pos' (no toca partes reservadas por invitados)

create or replace function public.pos_create_split(
  p_business_id uuid,
  p_table_id    uuid,
  p_method      text,     -- 'even' | 'items'
  p_ways        integer,  -- para 'even': número de partes; ignorado en 'items'
  p_checks      jsonb     -- para 'items': [{seat, order_item_ids:[uuid,...]}]
)
returns table(payment_id uuid, kind text, seat integer, amount_cents integer, order_item_ids uuid[])
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_session_opened_at timestamptz;
  v_bal               jsonb;
  v_tab_total         bigint;
  v_base              bigint;
  v_rem               bigint;
  v_i                 int;
  v_check             jsonb;
  v_items             uuid[];
  v_amount            bigint;
  v_vseat             integer;
  v_pid               uuid;
begin
  if not public.pos_can_access(p_business_id) then
    raise exception 'no pos access';
  end if;

  v_bal       := public.pos_table_balance(p_business_id, p_table_id);
  v_tab_total := (v_bal->>'due_cents')::bigint;

  if v_tab_total <= 0 then
    raise exception 'nothing to split';
  end if;

  -- D-33: split por ítems bloqueado si hay pagos por monto en la sesión
  if p_method = 'items' and (v_bal->>'paid_unallocated_cents')::bigint > 0 then
    raise exception 'UNALLOCATED_PAYMENTS';
  end if;

  select t.session_opened_at into v_session_opened_at
  from public.tables t where t.id = p_table_id;

  -- Solo borrar las filas pending del mesero (no las partes reservadas por invitados)
  delete from public.pos_payments
   where table_id = p_table_id
     and status   = 'pending'
     and source   = 'pos';

  if p_method = 'even' then
    if p_ways is null or p_ways < 2 then
      raise exception 'invalid ways';
    end if;
    v_base := v_tab_total / p_ways;
    v_rem  := v_tab_total - v_base * p_ways;

    for v_i in 1..p_ways loop
      insert into public.pos_payments
        (business_id, table_id, amount_cents, kind, seat, order_item_ids, status, paid_by, session_opened_at, source)
      values
        (p_business_id, p_table_id,
         (v_base + case when v_i <= v_rem then 1 else 0 end)::integer,
         'even', null, '{}', 'pending', auth.uid(), v_session_opened_at, 'pos')
      returning id into v_pid;

      return query select
        v_pid,
        'even'::text,
        null::integer,
        (v_base + case when v_i <= v_rem then 1 else 0 end)::integer,
        '{}'::uuid[];
    end loop;

  elsif p_method = 'items' then
    if p_checks is null or jsonb_array_length(p_checks) = 0 then
      raise exception 'checks required for items split';
    end if;

    for v_check in select * from jsonb_array_elements(p_checks) loop
      v_items := array(
        select (elem.value #>> '{}')::uuid
        from jsonb_array_elements(v_check->'order_item_ids') as elem
      );
      v_vseat := (v_check->>'seat')::integer;

      if v_items is null or array_length(v_items, 1) is null then
        continue;
      end if;

      -- Validar que los ítems pertenecen a la mesa y no están pagados
      if exists (
        select 1 from unnest(v_items) x
        where not exists (
          select 1 from public.orders o
          join public.order_items oi on oi.order_id = o.id
          where oi.id = x
            and o.business_id = p_business_id
            and o.table_id    = p_table_id
            and o.canceled_at is null
            and o.paid_at     is null
            and oi.paid_at    is null
        )
      ) then
        raise exception 'invalid or already-paid item';
      end if;

      select coalesce(sum(oi.price_cents * oi.qty), 0) into v_amount
      from public.order_items oi where oi.id = any(v_items);

      insert into public.pos_payments
        (business_id, table_id, amount_cents, kind, seat, order_item_ids, status, paid_by, session_opened_at, source)
      values
        (p_business_id, p_table_id, v_amount::integer, 'seat', v_vseat, v_items, 'pending', auth.uid(), v_session_opened_at, 'pos')
      returning id into v_pid;

      return query select v_pid, 'seat'::text, v_vseat, v_amount::integer, v_items;
    end loop;

  else
    raise exception 'unknown method: %', p_method;
  end if;
end $$;

-- ── 5. pos_create_check reescrito: sesión + D-33 ─────────────────────────────
-- Cambios vs. migration 155:
--   a) Verificación UNALLOCATED_PAYMENTS (D-33): si hay pagos por monto en esta sesión,
--      el split por ítems del mesero también queda bloqueado.
--   b) INSERT añade session_opened_at + source='pos'.

create or replace function public.pos_create_check(
  p_business_id    uuid,
  p_table_id       uuid,
  p_order_item_ids uuid[]
)
returns table(payment_id uuid, amount_cents integer)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_amount bigint;
  v_seat   integer;
  v_kind   text;
  v_pid    uuid;
  v_bal    jsonb;
begin
  if not public.pos_can_access(p_business_id) then
    raise exception 'no pos access';
  end if;
  if p_order_item_ids is null or array_length(p_order_item_ids, 1) is null then
    raise exception 'no items';
  end if;

  -- D-33: items split bloqueado si hay pagos por monto vivos en esta sesión
  v_bal := public.pos_table_balance(p_business_id, p_table_id);
  if (v_bal->>'paid_unallocated_cents')::bigint > 0 then
    raise exception 'UNALLOCATED_PAYMENTS';
  end if;

  -- Todos los items deben ser del tab: de esta mesa, orden no cancelada/no cerrada, y NO pagados.
  if exists (
    select 1 from unnest(p_order_item_ids) x
    where not exists (
      select 1 from public.orders o
      join public.order_items oi on oi.order_id = o.id
      where oi.id = x
        and o.business_id = p_business_id
        and o.table_id    = p_table_id
        and o.canceled_at is null
        and o.paid_at     is null
        and oi.paid_at    is null
    )
  ) then
    raise exception 'invalid or already-paid item';
  end if;

  select coalesce(sum(oi.price_cents * oi.qty), 0) into v_amount
  from public.order_items oi where oi.id = any(p_order_item_ids);

  if v_amount <= 0 then raise exception 'zero amount'; end if;

  select case
    when count(distinct oi.seat) = 1 and count(*) = count(oi.seat) then min(oi.seat)
    else null
  end into v_seat
  from public.order_items oi where oi.id = any(p_order_item_ids);

  v_kind := case when v_seat is not null then 'seat' else 'custom' end;

  insert into public.pos_payments
    (business_id, table_id, amount_cents, kind, seat, order_item_ids, status, paid_by, session_opened_at, source)
  values (
    p_business_id, p_table_id, v_amount::integer, v_kind, v_seat, p_order_item_ids, 'pending', auth.uid(),
    (select t.session_opened_at from public.tables t where t.id = p_table_id),
    'pos'
  )
  returning id into v_pid;

  return query select v_pid, v_amount::integer;
end $$;

-- ── 6. Partes iguales para invitados (plan compartido) — D-35 ────────────────
create or replace function public.pos_guest_even_plan(p_business_id uuid, p_table_id uuid, p_ways integer)
returns table(payment_id uuid, amount_cents integer, status text, claimable boolean)
language plpgsql security definer set search_path to '' as $$
declare
  v_open   timestamptz;
  v_due    bigint;
  v_base   bigint;
  v_rem    bigint;
  v_i      int;
  v_exists int;
begin
  select t.session_opened_at into v_open
  from public.tables t where t.id = p_table_id and t.business_id = p_business_id;

  if v_open is null then raise exception 'NO_SESSION'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_table_id::text, 0));

  select count(*) into v_exists
  from public.pos_payments pp
  where pp.table_id = p_table_id and pp.session_opened_at = v_open
    and pp.source = 'guest' and pp.kind = 'guest_even'
    and pp.status in ('pending', 'processing', 'succeeded');

  if v_exists = 0 then
    if p_ways is null or p_ways < 2 or p_ways > 20 then
      raise exception 'INVALID_WAYS';
    end if;
    v_due  := (public.pos_table_balance(p_business_id, p_table_id)->>'due_cents')::bigint;
    if v_due <= 0 then raise exception 'NOTHING_DUE'; end if;
    v_base := v_due / p_ways;
    v_rem  := v_due - v_base * p_ways;

    for v_i in 1..p_ways loop
      insert into public.pos_payments
        (business_id, table_id, amount_cents, kind, status, source, session_opened_at)
      values (
        p_business_id, p_table_id,
        (v_base + case when v_i <= v_rem then 1 else 0 end)::int,
        'guest_even', 'pending', 'guest', v_open
      );
    end loop;
  end if;

  return query
  select
    pp.id,
    pp.amount_cents,
    pp.status,
    (pp.status = 'pending' or
     (pp.status = 'processing' and pp.claimed_at < now() - interval '10 minutes')
    ) as claimable
  from public.pos_payments pp
  where pp.table_id = p_table_id and pp.session_opened_at = v_open
    and pp.source = 'guest' and pp.kind = 'guest_even'
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
     and (status = 'pending'
          or (status = 'processing' and claimed_at < now() - interval '10 minutes'));
  get diagnostics v_n = row_count;
  return v_n = 1;
end $$;

revoke all on function public.pos_guest_claim_share(uuid, uuid) from public, anon, authenticated;

-- ── 7. Resumen para el invitado ───────────────────────────────────────────────
create or replace function public.pos_guest_table_summary(p_business_id uuid, p_table_id uuid)
returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object(
    'balance', public.pos_table_balance(p_business_id, p_table_id),
    'items', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'order_item_id',  oi.id,
        'order_id',       o.id,
        'name',           mi.name,
        'qty',            oi.qty,
        'line_cents',     oi.price_cents * oi.qty,
        'paid',           (oi.paid_at is not null),
        'reserved',       exists (
          select 1 from public.pos_payments pp
           where pp.status = 'processing'
             and pp.claimed_at > now() - interval '10 minutes'
             and oi.id = any(pp.order_item_ids)
        ),
        'guest_session_id', o.guest_session_id
      ) order by o.created_at, oi.id), '[]'::jsonb)
      from public.orders o
      join public.order_items oi on oi.order_id = o.id
      join public.menu_items mi  on mi.id = oi.menu_item_id
      where o.business_id = p_business_id
        and o.table_id    = p_table_id
        and o.canceled_at is null
        and coalesce(o.approval_status, 'approved') <> 'awaiting'
        and o.created_at >= coalesce(
          (select t.session_opened_at from public.tables t where t.id = p_table_id),
          o.created_at
        )
    ),
    'payments', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'amount_cents', pp.amount_cents,
        'tip_cents',    pp.tip_cents,
        'source',       pp.source,
        'kind',         pp.kind,
        'at',           pp.updated_at
      ) order by pp.updated_at), '[]'::jsonb)
      from public.pos_payments pp
      where pp.business_id = p_business_id
        and pp.table_id    = p_table_id
        and pp.status      = 'succeeded'
        and pp.session_opened_at = (
          select t.session_opened_at from public.tables t where t.id = p_table_id
        )
    )
  );
$$;

revoke all on function public.pos_guest_table_summary(uuid, uuid) from public, anon, authenticated;

-- ── 8. pos_receipts_today reescrito: dueño ve clientes; empleado ve sus mesas ─
-- Cambios vs. migration 156:
--   a) RETURNS TABLE añade 'source text'
--   b) Filtro: owner OR paid_by=auth.uid() OR (source='guest' AND is_waiter_of_table)
--   c) SELECT añade pp.source

create or replace function public.pos_receipts_today(p_business_id uuid)
returns table(
  id           uuid,
  receipt_code text,
  table_label  text,
  amount_cents  integer,
  tip_cents     integer,
  status        text,
  paid_by       uuid,
  source        text,
  created_at    timestamptz
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_is_owner    boolean;
  v_is_employee boolean;
begin
  v_is_owner := exists (
    select 1 from public.businesses b
    where b.id = p_business_id and b.owner_id = auth.uid()
  );
  v_is_employee := public.is_employee_of_business(p_business_id);

  if not v_is_owner and not v_is_employee then
    raise exception 'no access';
  end if;

  return query
    select
      pp.id,
      pp.receipt_code,
      t.label                     as table_label,
      pp.amount_cents,
      coalesce(pp.tip_cents, 0)   as tip_cents,
      pp.status,
      pp.paid_by,
      pp.source,
      pp.created_at
    from   public.pos_payments pp
    left join public.tables t on t.id = pp.table_id
    where  pp.business_id = p_business_id
      and  pp.status = 'succeeded'
      and  pp.created_at >= (
             date_trunc('day', now() at time zone 'America/New_York')
             at time zone 'America/New_York'
           )
      and  (
        v_is_owner
        or pp.paid_by = auth.uid()
        or (pp.source = 'guest' and public.is_waiter_of_table(pp.table_id))
      )
    order by pp.created_at desc;
end $$;

commit;
