-- 275 — Tarjeta mínima del cliente de una reserva hecha desde la app (M3, build 13).
-- Las reservas de la app solo tienen user_id (no hay fila en reservation_customers) y el local no puede leer `users`.
-- Esta RPC devuelve SOLO display_name, username y avatar_url del cliente, y solo a quien puede gestionar las reservas del local
-- (reservations_can_manage: dueño, admin de plataforma o personal aceptado con reservations_manage). Ni correo ni teléfono.
-- Idempotente y no destructiva.

create or replace function public.reservation_customer_card(p_reservation_id uuid)
returns table (display_name text, username text, avatar_url text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_biz  uuid;
  v_user uuid;
begin
  select r.business_id, r.user_id into v_biz, v_user from public.reservations r where r.id = p_reservation_id;
  -- misma respuesta para "no existe" y "no puedes": no sirve para sondear ids
  if v_biz is null or not public.reservations_can_manage(v_biz) then
    raise exception 'NOT_ALLOWED';
  end if;
  if v_user is null then return; end if;     -- reserva por teléfono: el nombre está en reservation_customers
  return query
    select u.display_name::text, u.username::text, u.avatar_url::text
      from public.users u
     where u.id = v_user;
end;
$$;

revoke all on function public.reservation_customer_card(uuid) from public, anon;
grant execute on function public.reservation_customer_card(uuid) to authenticated, service_role;
comment on function public.reservation_customer_card(uuid) is
  'M3: nombre, @usuario y foto del cliente de una reserva de la app, solo para quien puede gestionar las reservas de ese local (reservations_can_manage). Nada más.';
