-- APLICADA EN PRODUCCIÓN POR PLANNING (2026-10-08, versión 20261008032042). Este archivo solo la versiona, tal cual está en schema_migrations.
-- 209: el tablero de recogida del mesero (POS) decide por status, no por paid_at.
-- Antes, "o.paid_at is null" dejaba fuera todo pedido pagado en la app (mesa, recoger, regalo)
-- y hacía desaparecer un pedido de mesero cobrado antes de servirse. Mismo criterio que el KDS (fix/kds-paid-orders).
create or replace function public.pos_pickup_board(p_business_id uuid)
returns table(order_item_id uuid, order_id uuid, table_id uuid, table_label text, seat integer, item_name text, qty integer, item_status text, station text, created_at timestamptz, preparing_at timestamptz, ready_at timestamptz)
language plpgsql security definer set search_path to '' as $function$
begin
  if not public.pos_can_access(p_business_id) then raise exception 'no pos access'; end if;
  return query
  select oi.id, oi.order_id, o.table_id, o.table_label, oi.seat, mi.name, oi.qty, oi.item_status, mi.station,
         oi.created_at, oi.preparing_at, oi.ready_at
  from public.orders o
  join public.order_items oi on oi.order_id = o.id
  join public.menu_items mi on mi.id = oi.menu_item_id
  where o.business_id = p_business_id
    and o.status in ('pending','confirmed','preparing','ready')
    and o.canceled_at is null
    and coalesce(o.approval_status,'approved') <> 'awaiting' and oi.item_status <> 'done'
  order by o.table_label, o.created_at, oi.seat nulls first, oi.id;
end; $function$;
