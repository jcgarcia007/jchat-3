-- 081: cocina K1 — estados POR PLATO + estado del pedido DERIVADO de sus platos.
-- Ver docs/COCINA.md (D-62) y la regla de edición (D-63).
--
-- Estados por plato: 'pending' | 'preparing' | 'ready'.
-- Un plato nace en 'pending' — si naciera en 'preparing' no existiría ventana de
-- edición (D-63).
--
-- ⚠️ COMPATIBILIDAD CON LO DESPLEGADO (lee esto antes de tocar nada):
-- Las Edge Functions EN PRODUCCIÓN (stripe-webhook v28, payments v32) insertan
-- item_status = 'cooking' literal. Si el CHECK entrara sin más, CADA pedido nuevo
-- fallaría al insertar sus líneas: el webhook se traga ese error y dejaría al
-- cliente pagado y con un pedido SIN PLATOS. Por eso esta migración instala un
-- trigger BEFORE que traduce el valor legado 'cooking' → 'pending'. Así lo
-- desplegado sigue funcionando y el CHECK puede ser estricto desde ya.
-- El código de ambas EF ya envía 'pending' en el repo; cuando se despliegue,
-- este trigger de compatibilidad puede eliminarse (ver 'para retirar' abajo).

begin;

-- ── a) Compatibilidad primero, para que nada falle a mitad de migración ──────
create or replace function public.normalize_item_status()
returns trigger language plpgsql set search_path = '' as $$
begin
  -- Valor legado del código aún desplegado. Retirar cuando las EF estén al día.
  if new.item_status = 'cooking' then
    new.item_status := 'pending';
  end if;
  return new;
end $$;

drop trigger if exists trg_order_items_normalize_status on public.order_items;
create trigger trg_order_items_normalize_status
  before insert or update of item_status on public.order_items
  for each row execute function public.normalize_item_status();

-- ── a) Migración de los datos existentes ────────────────────────────────────
-- Todos están en 'cooking', que era el DEFAULT de la columna: nunca fue una
-- decisión de cocina, nadie los empezó de verdad. Por eso van a 'pending' y no a
-- 'preparing' — marcarlos como "preparando" afirmaría un trabajo que no ocurrió.
update public.order_items
set item_status = 'pending'
where item_status is distinct from 'pending'
  and item_status not in ('preparing', 'ready');

alter table public.order_items
  alter column item_status set default 'pending';

alter table public.order_items
  drop constraint if exists order_items_item_status_valid;
alter table public.order_items
  add constraint order_items_item_status_valid
  check (item_status in ('pending', 'preparing', 'ready'));

comment on column public.order_items.item_status is
  'Estado de cocina de ESTE plato: pending | preparing | ready. El estado del '
  'PEDIDO (orders.status) se deriva de aquí por trigger — no se mantiene a mano.';

-- ── c) Derivación del estado del PEDIDO ─────────────────────────────────────
-- Trigger (no función suelta) porque la derivación no puede depender de que
-- alguien se acuerde de llamarla: hoy escriben item_status la RPC de abajo, y
-- mañana la edición de pedidos y el KDS. Con un trigger, cualquiera que escriba
-- deja el pedido coherente.
--
-- Sin riesgo de bucle: este trigger vive en order_items y solo escribe en orders;
-- los triggers de orders (set_updated_at, orders_status_changed) son BEFORE UPDATE
-- sobre la propia fila de orders y no tocan order_items.
--
-- Regla (D-62): todos listos → 'ready'; algo empezado → 'preparing'; nada
-- empezado → 'confirmed'. Un plato 'ready' cuenta como EMPEZADO, así que un
-- pedido con parte listo y parte pendiente queda 'preparing' (el caso mixto no
-- estaba escrito en la decisión; es la única lectura coherente con "ninguno
-- empezado → confirmed").
create or replace function public.sync_order_status_from_items()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_order_id uuid := coalesce(new.order_id, old.order_id);
  v_cur text;
  v_total int;
  v_ready int;
  v_started int;
  v_new text;
begin
  select o.status into v_cur from public.orders o where o.id = v_order_id;

  -- Estados administrativos/terminales: la derivación NUNCA los pisa.
  if v_cur is null or v_cur in ('delivered', 'cancelled', 'refunded') then
    return null;
  end if;

  select count(*),
         count(*) filter (where oi.item_status = 'ready'),
         count(*) filter (where oi.item_status in ('preparing', 'ready'))
    into v_total, v_ready, v_started
  from public.order_items oi
  where oi.order_id = v_order_id;

  if v_total = 0 then
    return null; -- pedido sin líneas: no inventamos estado
  end if;

  if v_ready = v_total then
    v_new := 'ready';
  elsif v_started > 0 then
    v_new := 'preparing';
  else
    v_new := 'confirmed';
  end if;

  if v_new is distinct from v_cur then
    update public.orders set status = v_new where id = v_order_id;
    -- status_updated_at lo pone el trigger orders_status_changed.
  end if;

  return null;
end $$;

revoke execute on function public.sync_order_status_from_items() from public, anon;

-- Se crea DESPUÉS del backfill a propósito: si existiera durante la migración de
-- 'cooking' → 'pending', habría degradado a 'confirmed' los 11 pedidos reales que
-- hoy están en 'ready', reescribiendo historia.
drop trigger if exists trg_order_items_sync_order_status on public.order_items;
create trigger trg_order_items_sync_order_status
  after insert or delete or update of item_status on public.order_items
  for each row execute function public.sync_order_status_from_items();

-- ── b) RPC: un empleado marca el estado de un plato ─────────────────────────
-- SECURITY DEFINER porque order_items NO tiene política de UPDATE (solo SELECT):
-- ningún cliente puede escribir item_status directamente, y abrir esa RLS daría
-- más de lo que se quiere. Mismo patrón que open_tab_on_table (079).
create or replace function public.set_item_status(p_order_item_id uuid, p_status text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_biz uuid;
  v_order_id uuid;
  v_order_status text;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_status is null or p_status not in ('pending', 'preparing', 'ready') then
    raise exception 'INVALID_STATUS';
  end if;

  select o.business_id, o.id into v_biz, v_order_id
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where oi.id = p_order_item_id;
  if v_order_id is null then raise exception 'ITEM_NOT_FOUND'; end if;

  -- Empleado aceptado del negocio, o el dueño, o un admin de plataforma.
  if not (
    public.is_employee_of_business(v_biz)
    or exists (select 1 from public.businesses b where b.id = v_biz and b.owner_id = v_uid)
    or public.is_platform_admin()
  ) then
    raise exception 'NOT_EMPLOYEE';
  end if;

  update public.order_items set item_status = p_status where id = p_order_item_id;

  -- El trigger de derivación ya corrió: leemos el estado resultante del pedido.
  select o.status into v_order_status from public.orders o where o.id = v_order_id;

  return jsonb_build_object(
    'item_status', p_status,
    'order_id', v_order_id,
    'order_status', v_order_status
  );
end $$;

revoke execute on function public.set_item_status(uuid, text) from public, anon;
grant execute on function public.set_item_status(uuid, text) to authenticated;

commit;
