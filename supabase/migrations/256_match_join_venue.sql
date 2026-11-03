-- 256: Match, entrada explícita. NO APLICADA (la aplica Juan Carlos por MCP, cuando diga "aplica 256").
-- Reversión: supabase/rollbacks/256_match_join_venue_rollback.sql · Comprobación: supabase/scripts/256_check.sql
--
-- Problema (prueba de tiendas, B5-1, P1): "Salir" de Match no se mantenía. match_check_in era la ÚNICA función que insertaba en game_optins
-- y la llama el latido de presencia del chat (cada lectura GPS, cada ~5 min), que sigue vivo después de salir: a los pocos minutos la persona
-- quedaba inscrita otra vez y se anulaba la promesa "se borra todo lo que hiciste en Match" (Apple 2.1 / 5.1.1, Play Data safety).
--
-- Arreglo: la inscripción solo nace de una ACCIÓN EXPLÍCITA de la persona (Juegos → Match, o el QR del local).
--  * match_join_venue(...)  → la ÚNICA función que inserta en game_optins. Hace las mismas validaciones que match_check_in, renueva la presencia
--                             de Match y crea el opt-in si no existe. Devuelve el mismo jsonb que match_check_in.
--  * match_check_in(...)    → el latido. Solo RENUEVA la presencia de quien YA tiene opt-in. Sin opt-in responde
--                             {"status":"denied","reason":"not_joined"} y NO escribe nada (ni opt-in ni presencia).
--  * match_leave_venue      → no cambia (borra opt-in, presencia, likes, matches y chats efímeros del local). Como el latido ya no puede recrear
--                             el opt-in, la persona queda fuera hasta volver a entrar con un toque explícito.
-- Las validaciones (edad, juegos activados, Match habilitado, expulsión, presencia en el local, QR, viaje imposible) viven en UNA sola función interna,
-- match_presence_core, para que join y check_in no puedan divergir. La función interna NO la ejecuta ningún cliente.
--
-- Parámetros de match_join_venue: p_business_id y, opcionales y con el mismo significado que en match_check_in, p_lat, p_lng, p_qr_token, p_mocked
-- (el QR y la marca de ubicación simulada hacen falta para la entrada por QR). Llamarla solo con p_business_id es válido.
--
-- Idempotente y no destructivo: "create or replace" + revoke/grant. No toca filas existentes: las personas que YA tienen opt-in siguen dentro.

create or replace function public.match_presence_core(
  p_business_id uuid, p_lat double precision, p_lng double precision, p_qr_token text, p_mocked boolean, p_require_optin boolean)
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

  -- El latido (match_check_in) solo renueva la presencia de quien YA entró a Match. Sin opt-in no escribe nada.
  if p_require_optin and not exists (select 1 from public.game_optins o where o.user_id = v_uid and o.business_id = p_business_id and o.game_key = 'match') then
    return jsonb_build_object('status','denied','reason','not_joined');
  end if;

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

comment on function public.match_presence_core(uuid, double precision, double precision, text, boolean, boolean) is
  'Interna (256): validaciones de Match + renovación de la presencia. NO inserta en game_optins. La usan match_check_in (exige opt-in) y match_join_venue.';

revoke all on function public.match_presence_core(uuid, double precision, double precision, text, boolean, boolean) from public, anon, authenticated;

-- El latido: solo renueva la presencia de quien ya está dentro de Match.
create or replace function public.match_check_in(
  p_business_id uuid, p_lat double precision default null::double precision, p_lng double precision default null::double precision,
  p_qr_token text default null::text, p_mocked boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  return public.match_presence_core(p_business_id, p_lat, p_lng, p_qr_token, p_mocked, true);
end;
$function$;

-- La entrada explícita: la ÚNICA función que crea el opt-in de Match.
create or replace function public.match_join_venue(
  p_business_id uuid, p_lat double precision default null::double precision, p_lng double precision default null::double precision,
  p_qr_token text default null::text, p_mocked boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_uid uuid := auth.uid(); v_result jsonb;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  v_result := public.match_presence_core(p_business_id, p_lat, p_lng, p_qr_token, p_mocked, false);
  if v_result->>'status' = 'denied' then return v_result; end if;
  insert into public.game_optins (user_id, business_id, game_key) values (v_uid, p_business_id, 'match') on conflict do nothing;
  return v_result;
end;
$function$;

comment on function public.match_join_venue(uuid, double precision, double precision, text, boolean) is
  'Entrada explícita a Match (256): valida, renueva la presencia y crea el opt-in. Es la única función que inserta en game_optins.';

revoke all on function public.match_join_venue(uuid, double precision, double precision, text, boolean) from public, anon;
grant execute on function public.match_join_venue(uuid, double precision, double precision, text, boolean) to authenticated, service_role;
