-- 196: Match se activa al instante con la misma verificación de ubicación del chat (GPS dentro del radio).
-- Solo si el teléfono reporta ubicación simulada (Android) queda 'pending' hasta escanear el QR del local.
-- Se mantienen: edad, participar en juegos, Match activo en el local, expulsión, radio, viaje imposible y vencimiento a 15 min.
-- APLICADA EN PRODUCCIÓN POR PLANNING (2026-10-04). Este archivo solo la versiona.

create or replace function public.match_check_in(
  p_business_id uuid,
  p_lat float8 default null,
  p_lng float8 default null,
  p_qr_token text default null,
  p_mocked boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_user record;
  v_biz record;
  v_qr_ok boolean := false;
  v_dist float8;
  v_other record;
  v_row public.match_presence%rowtype;
  v_status text;
  v_mocked boolean := coalesce(p_mocked, false);
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;

  select u.age_confirmed_at, coalesce((u.settings->>'gamesEnabled')::boolean, true) as games_enabled
  into v_user from public.users u where u.id = v_uid;
  if v_user.age_confirmed_at is null then return jsonb_build_object('status','denied','reason','age_not_confirmed'); end if;
  if not v_user.games_enabled then return jsonb_build_object('status','denied','reason','games_disabled'); end if;

  if not public.match_enabled_for_business(p_business_id) then
    return jsonb_build_object('status','denied','reason','match_disabled');
  end if;
  if exists (select 1 from public.match_kicks k where k.business_id = p_business_id and k.user_id = v_uid) then
    return jsonb_build_object('status','denied','reason','unavailable');
  end if;

  select b.lat, b.lng, b.geofence_radius_m into v_biz from public.businesses b where b.id = p_business_id;

  if p_qr_token is not null then
    v_qr_ok := exists (select 1 from public.rooms r where r.business_id = p_business_id and r.is_active and r.qr_token = p_qr_token);
    if not v_qr_ok then return jsonb_build_object('status','denied','reason','invalid_qr'); end if;
  else
    if p_lat is null or p_lng is null then return jsonb_build_object('status','denied','reason','location_required'); end if;
    if v_biz.lat is null or v_biz.lng is null or v_biz.geofence_radius_m is null then
      return jsonb_build_object('status','denied','reason','no_geofence');
    end if;
    v_dist := public.geo_distance_m(p_lat, p_lng, v_biz.lat, v_biz.lng);
    if v_dist > v_biz.geofence_radius_m + 25 then
      return jsonb_build_object('status','denied','reason','outside_radius','distance_m', round(v_dist::numeric));
    end if;
  end if;

  -- Viaje imposible: otra presencia viva en un local a > 2 km hace < 5 min
  select mp.business_id, b.lat, b.lng into v_other
  from public.match_presence mp join public.businesses b on b.id = mp.business_id
  where mp.user_id = v_uid and mp.business_id <> p_business_id and mp.last_seen_at > now() - interval '5 minutes'
  limit 1;
  if v_other.business_id is not null and v_biz.lat is not null and v_other.lat is not null
     and public.geo_distance_m(v_biz.lat, v_biz.lng, v_other.lat, v_other.lng) > 2000 then
    return jsonb_build_object('status','denied','reason','impossible_travel');
  end if;

  insert into public.game_optins (user_id, business_id, game_key) values (v_uid, p_business_id, 'match')
  on conflict do nothing;

  -- QR → activo. GPS sin simulación → activo al instante. GPS simulado → pendiente hasta QR.
  insert into public.match_presence (user_id, business_id, entered_at, last_seen_at, expires_at, active_since, method, readings, mocked)
  values (v_uid, p_business_id, now(), now(), now() + interval '15 minutes',
          case when v_qr_ok or not v_mocked then now() else null end,
          case when v_qr_ok then 'qr' else 'geo' end, 1, v_mocked and not v_qr_ok)
  on conflict (user_id, business_id) do update set
    last_seen_at = now(),
    expires_at = now() + interval '15 minutes',
    readings = match_presence.readings + 1,
    method = case when v_qr_ok then 'qr' else match_presence.method end,
    -- un QR válido limpia la marca de simulación; una lectura simulada nueva la vuelve a poner (salvo que ya entró por QR)
    mocked = case when v_qr_ok then false
                  when match_presence.method = 'qr' then match_presence.mocked
                  else match_presence.mocked or v_mocked end,
    active_since = case
      when v_qr_ok then coalesce(match_presence.active_since, now())
      when match_presence.method = 'qr' then match_presence.active_since          -- ya verificado por QR
      when v_mocked then null                                                     -- simulado → pendiente
      else coalesce(match_presence.active_since, now())
    end
  returning * into v_row;

  v_status := case when v_row.active_since is not null then 'active' else 'pending' end;
  return jsonb_build_object('status', v_status, 'reason', case when v_status = 'pending' then 'mocked_location' else null end,
                            'active_since', v_row.active_since, 'expires_at', v_row.expires_at,
                            'readings', v_row.readings, 'method', v_row.method, 'distance_m', round(coalesce(v_dist,0)::numeric));
end;
$$;
revoke all on function public.match_check_in(uuid, float8, float8, text, boolean) from public, anon;
grant execute on function public.match_check_in(uuid, float8, float8, text, boolean) to authenticated;
