-- 160: Código de mesa (6 dígitos) — Tab POS · Fase F2 · Variante T · D-02/D-03.
--
-- Variante T: el código vive en `tables` y su ciclo es la *ocupación* de la mesa.
-- Nace al abrir sesión (primera orden o botón), muere al cerrarse/pagarse.
--
-- Cambios:
-- 1. Extender pos_printers.role CHECK para incluir 'waiter' (necesario para
--    fetchStaffPrinters en F2 — la UI de gestión llega en F7).
-- 2. Columnas en `tables`: access_code, session_opened_at, session_opened_by.
-- 3. CHECK de 6 dígitos + índice único parcial (código no repetido entre sesiones
--    abiertas del mismo negocio).
-- 4. generate_table_access_code(_business_id): generador criptográfico idempotente.
-- 5. pos_open_table_session(p_business_id, p_table_id): abre sesión (idempotente).
-- 6. pos_close_table_session(p_business_id, p_table_id): cierre manual sin órdenes.
-- 7. pos_table_session(p_business_id, p_table_id): detalle para handheld y web.
-- 8. trg_fn_table_session_autoclose: limpia sesión al cerrar/anular la última orden.
-- 9. pos_combine_tables: extendido — limpia sesión de la mesa secundaria al combinar.
-- 10. pos_create_order: extendido — abre sesión de mesa en la primera orden
--    (body COMPLETO copiado de la BD el 2026-09-09; solo se añade el bloque de sesión).
--
-- Aplicada por Planning vía MCP. Codex solo versiona el archivo.

begin;

-- ── 1. Extender CHECK de pos_printers.role ────────────────────────────────────
-- Permite 'waiter' para fetchStaffPrinters (impresoras de staff, F2).
-- La UI de gestión de impresoras 'waiter' llega en F7.
alter table public.pos_printers
  drop constraint if exists pos_printers_role_check;
alter table public.pos_printers
  add constraint pos_printers_role_check
  check (role = any (array['kitchen'::text, 'bar'::text, 'receipt'::text, 'waiter'::text]));

-- ── 2. Columnas en `tables` ───────────────────────────────────────────────────
alter table public.tables
  add column if not exists access_code        text,
  add column if not exists session_opened_at  timestamptz,
  add column if not exists session_opened_by  uuid;

alter table public.tables
  drop constraint if exists tables_access_code_chk;
alter table public.tables
  add constraint tables_access_code_chk
  check (access_code is null or access_code ~ '^[0-9]{6}$');

comment on column public.tables.access_code is
  'Código de mesa (6 dígitos) de la sesión de ocupación actual. NULL cuando la mesa está libre. Nace al abrir la sesión (primera orden o botón), muere al cerrarse/pagarse. D-02.';
comment on column public.tables.session_opened_at is
  'Instante en que se abrió la sesión de ocupación actual. NULL = libre.';
comment on column public.tables.session_opened_by is
  'user_id del mesero que abrió la sesión (primera orden o botón). NULL = libre.';

-- Código único entre sesiones abiertas del mismo negocio
create unique index if not exists tables_open_access_code_uidx
  on public.tables (business_id, access_code)
  where access_code is not null;

-- ── 3. generate_table_access_code ────────────────────────────────────────────
-- 6 dígitos criptográficamente aleatorios, único entre sesiones abiertas del negocio.
-- Privada (no accesible directamente): revoke de public, anon, authenticated.
create or replace function public.generate_table_access_code(_business_id uuid)
returns text
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_code  text;
  v_tries int := 0;
begin
  loop
    v_code := lpad(
      ((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint) % 1000000)::text,
      6, '0'
    );
    exit when not exists (
      select 1 from public.tables t
      where t.business_id = _business_id and t.access_code = v_code
    );
    v_tries := v_tries + 1;
    if v_tries > 50 then
      raise exception 'ACCESS_CODE_EXHAUSTED';
    end if;
  end loop;
  return v_code;
end;
$$;
revoke all on function public.generate_table_access_code(uuid) from public, anon, authenticated;

-- ── 4. pos_open_table_session ─────────────────────────────────────────────────
-- Abre la sesión de ocupación de una mesa (idempotente: si ya está abierta,
-- devuelve el código existente). Para el botón "Código de mesa" en el handheld.
create or replace function public.pos_open_table_session(
  p_business_id uuid,
  p_table_id    uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_code    text;
  v_opened  timestamptz;
  v_biz     uuid;
  v_created boolean := false;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;

  if not (
    public.pos_can_access(p_business_id)
    or exists (
      select 1 from public.businesses b
      where b.id = p_business_id and b.owner_id = v_uid
    )
  ) then
    raise exception 'NOT_ALLOWED';
  end if;

  select t.business_id into v_biz
  from public.tables t
  where t.id = p_table_id and t.business_id = p_business_id and t.is_active = true;
  if v_biz is null then raise exception 'TABLE_NOT_FOUND'; end if;

  -- Advisory lock: evita duplicados bajo concurrencia
  perform pg_advisory_xact_lock(hashtextextended(p_table_id::text, 0));

  select t.access_code, t.session_opened_at
  into v_code, v_opened
  from public.tables t
  where t.id = p_table_id;

  if v_code is null then
    v_code    := public.generate_table_access_code(p_business_id);
    v_opened  := now();
    v_created := true;
    update public.tables
    set
      access_code       = v_code,
      session_opened_at = v_opened,
      session_opened_by = v_uid
    where id = p_table_id;
  end if;

  return jsonb_build_object(
    'table_id',          p_table_id,
    'access_code',       v_code,
    'session_opened_at', v_opened,
    'created',           v_created
  );
end;
$$;
revoke all on function public.pos_open_table_session(uuid, uuid) from public, anon;
grant execute on function public.pos_open_table_session(uuid, uuid) to authenticated;

comment on function public.pos_open_table_session(uuid, uuid) is
  'Abre la sesión de ocupación de una mesa y genera su código de 6 dígitos. Idempotente: llamada repetida devuelve el mismo código. F2.';

-- ── 5. pos_close_table_session ────────────────────────────────────────────────
-- Cierra la sesión manualmente cuando no hay órdenes abiertas
-- (el grupo se fue sin consumir). Con órdenes abiertas → TABLE_HAS_OPEN_ORDERS.
create or replace function public.pos_close_table_session(
  p_business_id uuid,
  p_table_id    uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;

  if not (
    public.pos_can_access(p_business_id)
    or exists (
      select 1 from public.businesses b
      where b.id = p_business_id and b.owner_id = v_uid
    )
  ) then
    raise exception 'NOT_ALLOWED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_table_id::text, 0));

  if exists (
    select 1 from public.orders o
    where o.table_id = p_table_id
      and o.business_id = p_business_id
      and o.paid_at is null
      and o.canceled_at is null
  ) then
    raise exception 'TABLE_HAS_OPEN_ORDERS';
  end if;

  update public.tables
  set
    access_code       = null,
    session_opened_at = null,
    session_opened_by = null
  where id = p_table_id and business_id = p_business_id;

  return jsonb_build_object('closed', true);
end;
$$;
revoke all on function public.pos_close_table_session(uuid, uuid) from public, anon;
grant execute on function public.pos_close_table_session(uuid, uuid) to authenticated;

comment on function public.pos_close_table_session(uuid, uuid) is
  'Cierre manual de sesión de mesa sin órdenes abiertas. Falla con TABLE_HAS_OPEN_ORDERS si hay consumo abierto. F2.';

-- ── 6. pos_table_session ──────────────────────────────────────────────────────
-- Detalle de la sesión para el handheld (muestra el código) y el dashboard web
-- (solo lectura). Es el ÚNICO lugar que devuelve access_code.
-- Gate: pos_can_access OR dueño, Y además (mesero de la mesa OR dueño OR sin meseros).
create or replace function public.pos_table_session(
  p_business_id uuid,
  p_table_id    uuid
)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $$
  select case
    when (
      public.pos_can_access(p_business_id)
      or exists (
        select 1 from public.businesses b
        where b.id = p_business_id and b.owner_id = auth.uid()
      )
    )
    and (
      public.is_waiter_of_table(p_table_id)
      or public.owns_business_of_table(p_table_id)
      or not exists (
        select 1 from public.table_waiters tw
        where tw.table_id = p_table_id and tw.business_id = p_business_id
      )
    )
    then (
      select jsonb_build_object(
        'access_code',        t.access_code,
        'session_opened_at',  t.session_opened_at,
        'session_opened_by',  t.session_opened_by,
        'open_total_cents',   coalesce((
          select sum(oi.price_cents * oi.qty)
          from public.orders o
          join public.order_items oi on oi.order_id = o.id
          where o.table_id = p_table_id
            and o.business_id = p_business_id
            and o.paid_at is null
            and o.canceled_at is null
            and oi.paid_at is null
        ), 0),
        'open_orders_count',  coalesce((
          select count(*)
          from public.orders o
          where o.table_id = p_table_id
            and o.business_id = p_business_id
            and o.paid_at is null
            and o.canceled_at is null
        ), 0)
      )
      from public.tables t
      where t.id = p_table_id and t.business_id = p_business_id
    )
    else null
  end;
$$;
revoke all on function public.pos_table_session(uuid, uuid) from public, anon;
grant execute on function public.pos_table_session(uuid, uuid) to authenticated;

comment on function public.pos_table_session(uuid, uuid) is
  'Detalle de sesión de mesa: {access_code, session_opened_at, session_opened_by, open_total_cents, open_orders_count}. ÚNICO punto que devuelve access_code. null si sin acceso. F2.';

-- ── 7. Trigger autoclose de sesión ───────────────────────────────────────────
-- Limpia la sesión de la mesa cuando se paga O se cancela la última orden abierta.
create or replace function public.trg_fn_table_session_autoclose()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  -- Reacciona a: paid_at null→no-null  O  canceled_at null→no-null
  if (
       (new.paid_at    is not null and old.paid_at    is null)
    or (new.canceled_at is not null and old.canceled_at is null)
  ) then
    if new.table_id is not null
       and not exists (
         select 1 from public.orders o
         where o.table_id = new.table_id
           and o.id <> new.id
           and o.paid_at is null
           and o.canceled_at is null
       )
    then
      update public.tables
      set
        access_code       = null,
        session_opened_at = null,
        session_opened_by = null
      where id = new.table_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_table_session_autoclose on public.orders;
create trigger trg_table_session_autoclose
  after update of paid_at, canceled_at on public.orders
  for each row
  execute function public.trg_fn_table_session_autoclose();

comment on function public.trg_fn_table_session_autoclose() is
  'Trigger: limpia access_code/session_* en tables cuando la última orden abierta de la mesa se paga o cancela. F2.';

-- ── 8. Extender pos_combine_tables ───────────────────────────────────────────
-- Al combinar, la mesa secundaria pierde su sesión (código).
-- La primaria conserva la suya (o la abre con la primera orden).
-- Body completo copiado de la BD el 2026-09-09 + bloque de clear de sesión.
create or replace function public.pos_combine_tables(
  p_business_id      uuid,
  p_primary_table_id uuid,
  p_secondary_table_id uuid
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_pri_biz      uuid; v_pri_combined uuid;
  v_sec_biz      uuid; v_sec_combined uuid; v_sec_party integer;
  v_sec_open     integer; v_sec_is_primary integer;
begin
  if not public.pos_can_access(p_business_id) then raise exception 'no pos access'; end if;
  if p_primary_table_id = p_secondary_table_id then raise exception 'same table'; end if;

  select t.business_id, t.combined_into into v_pri_biz, v_pri_combined
  from public.tables t where t.id = p_primary_table_id and t.is_active;
  if v_pri_biz is null then raise exception 'primary not found'; end if;
  if v_pri_biz <> p_business_id then raise exception 'primary not in this business'; end if;
  if v_pri_combined is not null then raise exception 'primary is itself annexed'; end if;

  select t.business_id, t.combined_into, t.party_size
  into v_sec_biz, v_sec_combined, v_sec_party
  from public.tables t where t.id = p_secondary_table_id and t.is_active;
  if v_sec_biz is null then raise exception 'secondary not found'; end if;
  if v_sec_biz <> p_business_id then raise exception 'secondary not in this business'; end if;
  if v_sec_combined is not null then raise exception 'secondary already combined'; end if;
  if coalesce(v_sec_party, 0) > 0 then raise exception 'secondary in use'; end if;

  -- secondary no debe tener órdenes abiertas
  select count(*) into v_sec_open from public.orders o
  where o.table_id = p_secondary_table_id and o.paid_at is null and o.canceled_at is null;
  if v_sec_open > 0 then raise exception 'secondary has open orders'; end if;

  -- secondary no debe ser principal de otras
  select count(*) into v_sec_is_primary from public.tables t
  where t.combined_into = p_secondary_table_id;
  if v_sec_is_primary > 0 then raise exception 'secondary is a primary'; end if;

  -- F2: limpiar sesión de la secundaria al combinar (la primaria conserva la suya)
  update public.tables
  set
    access_code       = null,
    session_opened_at = null,
    session_opened_by = null
  where id = p_secondary_table_id;

  update public.tables set combined_into = p_primary_table_id where id = p_secondary_table_id;
end;
$$;

-- ── 9. Extender pos_create_order ─────────────────────────────────────────────
-- Body COMPLETO copiado de la BD el 2026-09-09 (serie POS de agosto no versionada
-- en git). Solo se añade el bloque de apertura de sesión justo después de validar
-- p_table_id. Ninguna otra línea fue modificada.
create or replace function public.pos_create_order(
  p_business_id uuid,
  p_table_id    uuid,
  p_items       jsonb,
  p_notes       text default null
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_uid         uuid := auth.uid();
  v_emp         public.employees;
  v_has_pos     boolean;
  v_order_id    uuid;
  v_subtotal    bigint := 0;
  v_item        jsonb;
  v_mi_id       uuid;
  v_qty         integer;
  v_base        integer;
  v_unit        integer;
  v_upcharge    integer;
  v_options     jsonb;
  v_mod         jsonb;
  v_group_id    uuid;
  v_grp         record;
  v_label       text;
  v_choice      jsonb;
  v_found       boolean;
  v_cnt         integer;
  v_table_label text;
  v_sales_loc   uuid;   -- NUEVO: ubicación de venta del negocio (si la hay)
  v_sbl_upd     integer; -- NUEVO: filas afectadas en stock_by_location
begin
  select e.* into v_emp
  from public.employees e
  where e.user_id = v_uid and e.business_id = p_business_id and e.status = 'accepted'
  limit 1;
  if not found then raise exception 'not an active employee of this business'; end if;

  select coalesce((cr.permissions->>'pos_access')::boolean, false) into v_has_pos
  from public.custom_roles cr where cr.id = v_emp.custom_role_id;
  if not coalesce(v_has_pos, false) then raise exception 'no pos access'; end if;

  if p_table_id is not null then
    select t.label into v_table_label
    from public.tables t
    where t.id = p_table_id and t.business_id = p_business_id;
    if not found then raise exception 'table not in this business'; end if;
  end if;

  -- ── F2: apertura automática de sesión de mesa en la primera orden ─────────
  -- Advisory lock para evitar duplicados concurrentes.
  -- coalesce garantiza idempotencia: si ya hay código, lo conserva.
  if p_table_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(p_table_id::text, 0));
    update public.tables t
    set
      access_code       = coalesce(t.access_code, public.generate_table_access_code(p_business_id)),
      session_opened_at = coalesce(t.session_opened_at, now()),
      session_opened_by = coalesce(t.session_opened_by, v_uid)
    where t.id = p_table_id;
  end if;
  -- ─────────────────────────────────────────────────────────────────────────

  -- NUEVO: leer la ubicación de venta del negocio (NULL si no usa ubicaciones)
  select b.sales_location_id into v_sales_loc from public.businesses b where b.id = p_business_id;

  insert into public.orders
    (business_id, table_id, table_label, order_type, status, taken_by, notes)
  values
    (p_business_id, p_table_id, v_table_label, 'table', 'preparing', v_uid, p_notes)
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_mi_id := (v_item->>'menu_item_id')::uuid;
    v_qty   := greatest(coalesce((v_item->>'qty')::integer, 1), 1);

    select mi.price_cents into v_base
    from public.menu_items mi
    where mi.id = v_mi_id and mi.business_id = p_business_id and mi.is_available = true;
    if not found then raise exception 'menu item % not available', v_mi_id; end if;

    v_upcharge := 0;
    v_options  := coalesce(v_item->'options', '{}'::jsonb);

    if v_options ? 'modifiers' then
      for v_mod in select * from jsonb_array_elements(v_options->'modifiers')
      loop
        v_group_id := (v_mod->>'group_id')::uuid;
        if not exists (
          select 1 from public.menu_item_modifier_groups l
          where l.menu_item_id = v_mi_id and l.modifier_group_id = v_group_id
        ) then
          raise exception 'modifier group % not linked to item', v_group_id;
        end if;
        select mg.type, mg.min_select, mg.max_select, mg.choices into v_grp
        from public.modifier_groups mg
        where mg.id = v_group_id and mg.business_id = p_business_id;
        if not found then raise exception 'modifier group % not found', v_group_id; end if;
        v_cnt := coalesce(jsonb_array_length(v_mod->'choice_labels'), 0);
        if v_cnt < v_grp.min_select or v_cnt > v_grp.max_select then
          raise exception 'invalid selection count for group %', v_group_id;
        end if;
        for v_label in select jsonb_array_elements_text(v_mod->'choice_labels')
        loop
          v_found := false;
          for v_choice in select * from jsonb_array_elements(v_grp.choices)
          loop
            if (v_choice->>'label') = v_label then
              v_upcharge := v_upcharge + coalesce((v_choice->>'price_cents')::integer, 0);
              v_found := true;
              exit;
            end if;
          end loop;
          if not v_found then raise exception 'invalid choice % for group %', v_label, v_group_id; end if;
        end loop;
      end loop;
    end if;

    v_unit := v_base + v_upcharge;

    insert into public.order_items
      (order_id, menu_item_id, qty, price_cents, options, special_instructions, seat)
    values
      (v_order_id, v_mi_id, v_qty, v_unit, v_options,
       nullif(v_item->>'special_instructions',''),
       (v_item->>'seat')::integer);

    -- ── INVENTARIO PERPETUO (con soporte de ubicación de venta) ──────────────
    -- Camino NUEVO: si el negocio tiene ubicación de venta Y el producto tiene fila ahí,
    -- descontar de esa ubicación (el trigger sbl_sync_total recalcula stock_count).
    v_sbl_upd := 0;
    if v_sales_loc is not null then
      update public.stock_by_location
         set qty = greatest(0, qty - v_qty), updated_at = now()
       where menu_item_id = v_mi_id and location_id = v_sales_loc and business_id = p_business_id;
      get diagnostics v_sbl_upd = row_count;
      if v_sbl_upd > 0 then
        insert into public.stock_movements (menu_item_id, business_id, delta, reason, created_by)
        values (v_mi_id, p_business_id, -v_qty, 'sale', v_uid);
      end if;
    end if;

    -- Camino ACTUAL (fallback): sin ubicación de venta o el producto no tiene fila ahí →
    -- descontar de stock_count directo, exactamente como antes.
    if v_sbl_upd = 0 then
      update public.menu_items
         set stock_count = greatest(0, stock_count - v_qty)
       where id = v_mi_id and business_id = p_business_id and stock_count is not null;
      if found then
        insert into public.stock_movements (menu_item_id, business_id, delta, reason, created_by)
        values (v_mi_id, p_business_id, -v_qty, 'sale', v_uid);
      end if;
    end if;
    -- ─────────────────────────────────────────────────────────────────────────

    v_subtotal := v_subtotal + (v_unit::bigint * v_qty);
  end loop;

  if v_subtotal = 0 then raise exception 'order has no valid items'; end if;

  update public.orders
  set subtotal_cents = v_subtotal, total_cents = v_subtotal
  where id = v_order_id;

  insert into public.notifications (user_id, type, payload)
  select distinct e2.user_id, 'pos_order_assist',
    jsonb_build_object(
      'order_id', v_order_id, 'table_id', p_table_id,
      'table_label', v_table_label, 'helper_user_id', v_uid, 'business_id', p_business_id
    )
  from public.table_waiters tw
  join public.employees e2 on e2.id = tw.employee_id
  where tw.table_id = p_table_id and tw.business_id = p_business_id
    and e2.user_id <> v_uid;

  return v_order_id;
end;
$$;

-- ── 10. Actualizar pos_tables_overview ───────────────────────────────────────
-- Body COMPLETO copiado de la BD el 2026-09-09. Solo dos diferencias:
-- a) has_access_code boolean añadido al final del RETURNS TABLE.
-- b) state también es 'ocupada' cuando session_opened_at is not null (mesa con
--    código pero aún sin órdenes — ej. botón "Código de mesa" antes de tomar la
--    primera orden).
-- c) has_access_code = (t.access_code is not null) añadido al SELECT final.
-- Ninguna otra línea fue modificada.
create or replace function public.pos_tables_overview(p_business_id uuid)
returns table(
  table_id         uuid,
  label            text,
  floor            text,
  seats            integer,
  party_size       integer,
  state            text,
  assignment       text,
  open_total_cents bigint,
  open_since       timestamp with time zone,
  combined_into    uuid,
  combined_seats   integer,
  combinable       boolean,
  has_access_code  boolean          -- F2: nuevo campo al final
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_emp_id uuid;
begin
  if not public.pos_can_access(p_business_id) then raise exception 'no pos access'; end if;
  select e.id into v_emp_id from public.employees e
  where e.user_id = auth.uid() and e.business_id = p_business_id and e.status = 'accepted' limit 1;

  return query
  select
    t.id, t.label, t.floor, t.seats, t.party_size,
    case when exists (
      select 1 from public.orders o
      where o.table_id = t.id and o.business_id = p_business_id and o.paid_at is null and o.canceled_at is null
    ) or t.combined_into is not null
      -- F2: mesa con sesión abierta (código generado antes de la primera orden)
      or t.session_opened_at is not null
    then 'ocupada' else 'libre' end as state,
    case
      when exists (select 1 from public.table_waiters tw
                   where tw.table_id = t.id and tw.business_id = p_business_id and tw.employee_id = v_emp_id) then 'mine'
      when exists (select 1 from public.table_waiters tw
                   where tw.table_id = t.id and tw.business_id = p_business_id) then 'other'
      else 'unassigned'
    end as assignment,
    coalesce((select sum(o.total_cents) from public.orders o
              where o.table_id = t.id and o.business_id = p_business_id and o.paid_at is null and o.canceled_at is null), 0) as open_total_cents,
    (select min(o.created_at) from public.orders o
     where o.table_id = t.id and o.business_id = p_business_id and o.paid_at is null and o.canceled_at is null) as open_since,
    t.combined_into,
    (t.seats + coalesce((select sum(a.seats) from public.tables a
                         where a.combined_into = t.id and a.is_active), 0))::integer as combined_seats,
    (not exists (
        select 1 from public.orders o
        where o.table_id = t.id and o.business_id = p_business_id and o.paid_at is null and o.canceled_at is null
      ) and coalesce(t.party_size, 0) = 0 and t.combined_into is null) as combinable,
    -- F2: tiene sesión abierta (código generado)
    (t.access_code is not null) as has_access_code
  from public.tables t
  where t.business_id = p_business_id and t.is_active = true
  order by t.sort;
end;
$$;

commit;
