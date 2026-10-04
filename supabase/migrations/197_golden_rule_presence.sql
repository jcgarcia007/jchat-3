-- 197: REGLA DE ORO (1/3) — presencia en el local como única fuente de verdad.
-- Dentro del área (ubicación verificada por el servidor): todo. Fuera: solo menú y recoger (si el dueño lo permite).
-- APLICADA EN PRODUCCIÓN POR PLANNING (2026-10-04). Este archivo solo la versiona.

alter table public.businesses add column if not exists pickup_enabled boolean not null default false;

create or replace function public.venue_presence_ok(p_business_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.room_geo_presence gp
    join public.rooms r on r.id = gp.room_id
    where r.business_id = p_business_id and gp.user_id = p_user_id and gp.expires_at > now()
  );
$$;
revoke all on function public.venue_presence_ok(uuid, uuid) from public, anon;
grant execute on function public.venue_presence_ok(uuid, uuid) to authenticated, service_role;

create or replace function public.venue_distance_m(p_business_id uuid, p_lat float8, p_lng float8)
returns float8 language sql stable security definer set search_path = public as $$
  select case when b.lat is null or b.lng is null or p_lat is null or p_lng is null then null
              else public.geo_distance_m(p_lat, p_lng, b.lat, b.lng) end
  from public.businesses b where b.id = p_business_id;
$$;
create or replace function public.venue_inside(p_business_id uuid, p_lat float8, p_lng float8)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.venue_distance_m(p_business_id, p_lat, p_lng) <= b.geofence_radius_m + 25, false)
  from public.businesses b where b.id = p_business_id;
$$;
revoke all on function public.venue_distance_m(uuid, float8, float8), public.venue_inside(uuid, float8, float8) from public, anon;
grant execute on function public.venue_distance_m(uuid, float8, float8), public.venue_inside(uuid, float8, float8) to authenticated, service_role;

-- Entrada por QR CON ubicación (la versión sin coordenadas se retira cuando la web deje de usarla)
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

-- Match: activo solo si el servidor ya ve la entrada al chat con ubicación. Ubicación simulada exige además el QR.
create or replace function public.match_check_in(
  p_business_id uuid, p_lat float8 default null, p_lng float8 default null, p_qr_token text default null, p_mocked boolean default false
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_user record; v_qr_ok boolean := false; v_other record; v_biz record; v_row public.match_presence%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select u.age_confirmed_at, coalesce((u.settings->>'gamesEnabled')::boolean, true) as games_enabled into v_user from public.users u where u.id = v_uid;
  if v_user.age_confirmed_at is null then return jsonb_build_object('status','denied','reason','age_not_confirmed'); end if;
  if not v_user.games_enabled then return jsonb_build_object('status','denied','reason','games_disabled'); end if;
  if not public.match_enabled_for_business(p_business_id) then return jsonb_build_object('status','denied','reason','match_disabled'); end if;
  if exists (select 1 from public.match_kicks k where k.business_id = p_business_id and k.user_id = v_uid) then return jsonb_build_object('status','denied','reason','unavailable'); end if;
  if not public.venue_presence_ok(p_business_id, v_uid) then return jsonb_build_object('status','denied','reason','not_in_venue'); end if;
  if p_qr_token is not null then
    v_qr_ok := exists (select 1 from public.rooms r where r.business_id = p_business_id and r.is_active and r.qr_token = p_qr_token);
    if not v_qr_ok then return jsonb_build_object('status','denied','reason','invalid_qr'); end if;
  end if;
  select b.lat, b.lng into v_biz from public.businesses b where b.id = p_business_id;
  select mp.business_id, b.lat, b.lng into v_other from public.match_presence mp join public.businesses b on b.id = mp.business_id
  where mp.user_id = v_uid and mp.business_id <> p_business_id and mp.last_seen_at > now() - interval '5 minutes' limit 1;
  if v_other.business_id is not null and v_biz.lat is not null and v_other.lat is not null
     and public.geo_distance_m(v_biz.lat, v_biz.lng, v_other.lat, v_other.lng) > 2000 then
    return jsonb_build_object('status','denied','reason','impossible_travel');
  end if;
  insert into public.game_optins (user_id, business_id, game_key) values (v_uid, p_business_id, 'match') on conflict do nothing;
  insert into public.match_presence (user_id, business_id, entered_at, last_seen_at, expires_at, active_since, method, readings, mocked)
  values (v_uid, p_business_id, now(), now(), now() + interval '15 minutes',
          case when v_qr_ok or not coalesce(p_mocked,false) then now() else null end,
          case when v_qr_ok then 'qr' else 'geo' end, 1, coalesce(p_mocked,false) and not v_qr_ok)
  on conflict (user_id, business_id) do update set
    last_seen_at = now(), expires_at = now() + interval '15 minutes', readings = match_presence.readings + 1,
    method = case when v_qr_ok then 'qr' else match_presence.method end,
    mocked = case when v_qr_ok or match_presence.method = 'qr' then false else match_presence.mocked or coalesce(p_mocked,false) end,
    active_since = case when v_qr_ok or match_presence.method = 'qr' then coalesce(match_presence.active_since, now())
                        when coalesce(p_mocked,false) then null else coalesce(match_presence.active_since, now()) end
  returning * into v_row;
  return jsonb_build_object('status', case when v_row.active_since is not null then 'active' else 'pending' end,
    'reason', case when v_row.active_since is null then 'mocked_location' else null end,
    'active_since', v_row.active_since, 'expires_at', v_row.expires_at, 'readings', v_row.readings, 'method', v_row.method);
end;
$$;
