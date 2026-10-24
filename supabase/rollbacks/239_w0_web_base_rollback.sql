-- Reversión de 239_w0_web_base.sql. Se ejecuta a mano en el SQL Editor SOLO si hay que deshacer la 239.
-- Orden: primero se devuelve la versión anterior de join_room_via_qr(token, lat, lng) (la que usa 24 h fijas), porque la
-- versión nueva llama a venue_session_expires_at; después se borra esa función y, al final, la columna.
-- Es seguro ejecutarla dos veces. Aviso: borrar businesses.timezone pierde la zona que se haya guardado en cada local.

-- 1) Función vieja sin ubicación: vuelve a poder llamarse (grants que dejó la 183 + la 026).
grant execute on function public.join_room_via_qr(text) to authenticated;

-- 2) join_room_via_qr(token, lat, lng): la versión anterior, copia exacta de 197_golden_rule_presence.sql (24 h fijas).
create or replace function public.join_room_via_qr(token text, p_lat float8, p_lng float8)
returns table (room_id uuid, parent_room_id uuid, access_granted boolean, is_owner boolean, distance_m float8, reason text)
language plpgsql security definer set search_path = public as $$
declare v_room uuid; v_parent uuid; v_res record;
begin
  if auth.uid() is null then raise exception 'auth_required'; end if;
  select r.id, r.parent_room_id into v_room, v_parent from public.rooms r where r.qr_token = token and r.is_active = true;
  if v_room is null then raise exception 'invalid_qr'; end if;
  select * into v_res from public.check_geofence_and_join_room(v_room, p_lat, p_lng);
  if not v_res.access_granted then
    return query select v_room, v_parent, false, false, v_res.distance_m, v_res.reason;
    return;
  end if;
  insert into public.room_members (room_id, user_id, expires_at) values (v_room, auth.uid(), now() + interval '24 hours')
  on conflict on constraint room_members_pkey do update set expires_at = now() + interval '24 hours';
  if v_parent is not null then
    insert into public.room_members (room_id, user_id, expires_at) values (v_parent, auth.uid(), now() + interval '24 hours')
    on conflict on constraint room_members_pkey do update set expires_at = now() + interval '24 hours';
  end if;
  return query select v_room, v_parent, true, v_res.is_owner, v_res.distance_m, v_res.reason;
end;
$$;

revoke all on function public.join_room_via_qr(text, float8, float8) from public, anon;
grant execute on function public.join_room_via_qr(text, float8, float8) to authenticated;

-- 3) La función de vencimiento ya no la usa nadie.
drop function if exists public.venue_session_expires_at(uuid);

-- 4) La zona horaria del local.
alter table public.businesses drop column if exists timezone;
