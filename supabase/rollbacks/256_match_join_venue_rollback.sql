-- Reversión de 256_match_join_venue.sql: vuelve match_check_in a su definición anterior (la que SÍ inserta el opt-in; reproduce el defecto B5-1: salir de
-- Match deja de mantenerse) y quita match_join_venue y la función interna. Las filas de game_optins y match_presence NO se tocan.
-- Si la app ya está en la versión que llama a match_join_venue, esa llamada fallará tras la reversión: despliega antes la versión anterior de la app.

create or replace function public.match_check_in(
  p_business_id uuid, p_lat double precision default null::double precision, p_lng double precision default null::double precision,
  p_qr_token text default null::text, p_mocked boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_uid uuid := auth.uid(); v_user record; v_qr_ok boolean := false; v_other record; v_biz record; v_row public.match_presence%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select u.age_confirmed_at, coalesce((u.settings->>'gamesEnabled')::boolean, true) as games_enabled into v_user from public.users u where u.id = v_uid;
  if v_user.age_confirmed_at is null then return jsonb_build_object('status','denied','reason','age_not_confirmed'); end if;
  if not v_user.games_enabled then return jsonb_build_object('status','denied','reason','games_disabled'); end if;
  if not public.match_enabled_for_business(p_business_id) then return jsonb_build_object('status','denied','reason','match_disabled'); end if;
  if exists (select 1 from public.match_kicks k where k.business_id = p_business_id and k.user_id = v_uid) then return jsonb_build_object('status','denied','reason','unavailable'); end if;

  -- Regla de oro: sin entrada al chat con ubicación, no hay Match
  if not public.venue_presence_ok(p_business_id, v_uid) then return jsonb_build_object('status','denied','reason','not_in_venue'); end if;

  if p_qr_token is not null then
    v_qr_ok := exists (select 1 from public.rooms r where r.business_id = p_business_id and r.is_active and r.qr_token = p_qr_token);
    if not v_qr_ok then return jsonb_build_object('status','denied','reason','invalid_qr'); end if;
  end if;

  -- Viaje imposible
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
$function$;

drop function if exists public.match_join_venue(uuid, double precision, double precision, text, boolean);
drop function if exists public.match_presence_core(uuid, double precision, double precision, text, boolean, boolean);
