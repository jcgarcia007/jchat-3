-- 201: Pedido en curso — notificaciones de estado al cliente, pedidos activos para la barra, "Entregado" para el personal.
-- APLICADA EN PRODUCCIÓN POR PLANNING (2026-10-04). Este archivo solo la versiona.

create or replace function public.notify_order_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_biz text;
begin
  if new.user_id is null or new.status is not distinct from old.status then return new; end if;
  if new.status not in ('preparing','ready','delivered','cancelled') then return new; end if;
  select name into v_biz from public.businesses where id = new.business_id;
  insert into public.notifications (user_id, type, payload)
  values (new.user_id, 'order_status', jsonb_build_object(
    'order_id', new.id, 'order_number', new.order_number, 'business_id', new.business_id, 'business_name', v_biz,
    'status', new.status, 'order_type', new.order_type, 'table_label', new.table_label));
  return new;
end;
$$;
drop trigger if exists trg_notify_order_status on public.orders;
create trigger trg_notify_order_status after update of status on public.orders for each row execute function public.notify_order_status();

create or replace function public.my_active_orders()
returns table (id uuid, order_number bigint, business_id uuid, business_name text, status text, order_type text, table_label text, status_updated_at timestamptz, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select o.id, o.order_number, o.business_id, b.name, o.status, o.order_type, o.table_label, o.status_updated_at, o.created_at
  from public.orders o join public.businesses b on b.id = o.business_id
  where o.user_id = auth.uid()
    and o.status in ('pending','confirmed','preparing','ready')
    and o.created_at > now() - interval '12 hours'
    and (o.status <> 'ready' or coalesce(o.status_updated_at, o.created_at) > now() - interval '3 hours')
  order by o.created_at desc;
$$;
revoke all on function public.my_active_orders() from public, anon;
grant execute on function public.my_active_orders() to authenticated;

create or replace function public.staff_set_order_status(p_order_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare v_biz uuid;
begin
  if p_status not in ('confirmed','preparing','ready','delivered','cancelled') then raise exception 'invalid_status' using errcode = '22023'; end if;
  select business_id into v_biz from public.orders where id = p_order_id;
  if v_biz is null or not public.is_venue_staff(v_biz, auth.uid()) then raise exception 'not_staff' using errcode = '42501'; end if;
  update public.orders set status = p_status where id = p_order_id;
end;
$$;
revoke all on function public.staff_set_order_status(uuid, text) from public, anon;
grant execute on function public.staff_set_order_status(uuid, text) to authenticated;
