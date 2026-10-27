-- 166: fix pagos 'even'/'guest_even' con order_item_ids='{}' ignorados por pos_table_balance.
--
-- Causa raíz: pos_create_split insertaba '{}' en lugar de NULL para las partes 'even';
-- pos_table_balance filtra paid_unallocated_cents con "order_item_ids IS NULL",
-- y en Postgres '{}' IS NULL = false → los pagos even no reducen el saldo.
--
-- Tres acciones:
--   1. Corregir el origen: pos_create_split y pos_guest_even_plan insertan NULL.
--   2. Hacer pos_table_balance y pos_session_split_method robustos al array vacío.
--   3. Backfill: normalizar pagos históricos '{}' a NULL.
--
-- Planning aplica por MCP. NO ejecutar directamente.

begin;

-- ── 0. Backfill: normalizar pagos existentes con '{}' a NULL ─────────────────
update public.pos_payments
   set order_item_ids = null
 where kind in ('even', 'guest_even')
   and order_item_ids = '{}';

-- ── 1. pos_table_balance: robusto a '{}' además de NULL ──────────────────────
-- Único cambio vs. migration 164:
--   "and pp.order_item_ids is null"
--   → "and (pp.order_item_ids is null or cardinality(pp.order_item_ids) = 0)"
create or replace function public.pos_table_balance(p_business_id uuid, p_table_id uuid)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare
  v_open          timestamptz;
  v_items         bigint;
  v_unalloc       bigint;
  v_pending_guest bigint;
begin
  select t.session_opened_at into v_open
  from public.tables t
  where t.id = p_table_id and t.business_id = p_business_id;

  v_items := public.pos_tab_total(p_business_id, p_table_id);  -- ítems sin pagar (excluye awaiting)

  -- Pagos por MONTO (sin ítems) exitosos de ESTA sesión: reducen el pendiente pero no marcan ítems.
  -- Robusto a '{}' (array vacío) además de NULL — ambos indican "pago de monto libre".
  select coalesce(sum(pp.amount_cents), 0) into v_unalloc
  from public.pos_payments pp
  where pp.business_id = p_business_id and pp.table_id = p_table_id
    and pp.status = 'succeeded'
    and (pp.order_item_ids is null or cardinality(pp.order_item_ids) = 0)
    and v_open is not null and pp.session_opened_at = v_open;

  -- Partes de invitado reservadas (processing) — informativo, no afectan due_cents
  select coalesce(sum(pp.amount_cents), 0) into v_pending_guest
  from public.pos_payments pp
  where pp.business_id = p_business_id and pp.table_id = p_table_id
    and pp.source = 'guest' and pp.status = 'processing'
    and v_open is not null and pp.session_opened_at = v_open
    and pp.claimed_at > now() - interval '10 minutes';

  return jsonb_build_object(
    'session_opened_at',      v_open,
    'items_unpaid_cents',     v_items,
    'paid_unallocated_cents', v_unalloc,
    'due_cents',              greatest(v_items - v_unalloc, 0),
    'guest_processing_cents', v_pending_guest
  );
end $$;

revoke all on function public.pos_table_balance(uuid, uuid) from public, anon;
grant execute on function public.pos_table_balance(uuid, uuid) to authenticated;

-- ── 2. pos_session_split_method: detección de 'amount' robusta a '{}' ────────
-- Único cambio vs. migration 164:
--   "and pp.order_item_ids is null"  (rama 'amount')
--   → "and (pp.order_item_ids is null or cardinality(pp.order_item_ids) = 0)"
create or replace function public.pos_session_split_method(p_business_id uuid, p_table_id uuid)
returns text
language sql
stable
security definer
set search_path to ''
as $$
  with s as (
    select t.session_opened_at as o
      from public.tables t
     where t.id          = p_table_id
       and t.business_id = p_business_id
  )
  select case
    when exists (
      select 1 from public.pos_payments pp, s
       where pp.table_id          = p_table_id
         and pp.status            = 'succeeded'
         and pp.session_opened_at = s.o
         and pp.order_item_ids    is not null
         and cardinality(pp.order_item_ids) > 0
    ) then 'items'
    when exists (
      select 1 from public.pos_payments pp, s
       where pp.table_id          = p_table_id
         and pp.status            = 'succeeded'
         and pp.session_opened_at = s.o
         and (pp.order_item_ids is null or cardinality(pp.order_item_ids) = 0)
         and pp.kind in ('even','guest_even','guest_amount','custom')
    ) then 'amount'
    else null
  end;
$$;
revoke all on function public.pos_session_split_method(uuid, uuid) from public, anon, authenticated;

-- ── 3. pos_create_split: insertar NULL en lugar de '{}' para partes 'even' ───
-- Cambios vs. migration 164 (solo en la rama even):
--   INSERT  VALUES: '{}' → null
--   RETURN QUERY:   '{}'::uuid[] → null::uuid[]
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
  v_method            text;       -- D-33: método ya fijado para la sesión
begin
  if not public.pos_can_access(p_business_id) then
    raise exception 'no pos access';
  end if;

  v_bal       := public.pos_table_balance(p_business_id, p_table_id);
  v_tab_total := (v_bal->>'due_cents')::bigint;

  if v_tab_total <= 0 then
    raise exception 'nothing to split';
  end if;

  -- D-33 bidireccional: el primer pago exitoso fija el método para la sesión completa
  v_method := public.pos_session_split_method(p_business_id, p_table_id);
  if v_method = 'amount' and p_method = 'items' then
    raise exception 'METHOD_LOCKED_AMOUNT';
  end if;
  if v_method = 'items' and p_method = 'even' then
    raise exception 'METHOD_LOCKED_ITEMS';
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
      -- FIX: order_item_ids = NULL (no '{}') para que pos_table_balance
      -- los cuente en paid_unallocated_cents tras el pago.
      insert into public.pos_payments
        (business_id, table_id, amount_cents, kind, seat, order_item_ids, status, paid_by, session_opened_at, source)
      values
        (p_business_id, p_table_id,
         (v_base + case when v_i <= v_rem then 1 else 0 end)::integer,
         'even', null, null, 'pending', auth.uid(), v_session_opened_at, 'pos')
      returning id into v_pid;

      return query select
        v_pid,
        'even'::text,
        null::integer,
        (v_base + case when v_i <= v_rem then 1 else 0 end)::integer,
        null::uuid[];
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

-- ── 4. pos_guest_even_plan: order_item_ids explícito NULL para guest_even ─────
-- Cambio vs. migration 164: añadir order_item_ids = null explícitamente en el
-- INSERT para que no herede el default de columna si este fuera '{}' en alguna
-- versión del schema.
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
      -- FIX: order_item_ids explícito NULL — los pagos guest_even son por monto.
      insert into public.pos_payments
        (business_id, table_id, amount_cents, kind, order_item_ids, status, source, session_opened_at)
      values (
        p_business_id, p_table_id,
        (v_base + case when v_i <= v_rem then 1 else 0 end)::int,
        'guest_even', null, 'pending', 'guest', v_open
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

commit;
