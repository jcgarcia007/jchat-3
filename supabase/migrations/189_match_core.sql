-- 189: JChat Match — base: catálogo de juegos, interruptor del dueño, opt-in por local, check-in fuerte, expulsiones, ajustes.
-- APLICADA EN PRODUCCIÓN POR PLANNING (2026-10-03). Este archivo solo la versiona.

-- 1) Catálogo de juegos (un interruptor por juego en el aviso de entrada)
create table if not exists public.games (
  key text primary key,
  name_es text not null,
  name_en text not null,
  is_active boolean not null default true,
  sort integer not null default 0
);
alter table public.games enable row level security;
drop policy if exists games_read on public.games;
create policy games_read on public.games for select to authenticated using (true);
insert into public.games (key, name_es, name_en, is_active, sort) values ('match', 'Match', 'Match', true, 1)
on conflict (key) do nothing;

-- 2) Decisión del dueño por local (apagado por defecto)
create table if not exists public.business_games (
  business_id uuid not null references public.businesses(id) on delete cascade,
  game_key text not null references public.games(key) on delete cascade,
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (business_id, game_key)
);
alter table public.business_games enable row level security;
drop policy if exists business_games_read on public.business_games;
create policy business_games_read on public.business_games for select to authenticated using (true);
drop policy if exists business_games_owner_write on public.business_games;
create policy business_games_owner_write on public.business_games for all to authenticated
  using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid()))
  with check (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid()));

create or replace function public.match_enabled_for_business(p_business_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select bg.enabled from public.business_games bg where bg.business_id = p_business_id and bg.game_key = 'match'), false)
     and exists (select 1 from public.games g where g.key = 'match' and g.is_active);
$$;
grant execute on function public.match_enabled_for_business(uuid) to authenticated, service_role;

-- 3) Opt-in del usuario por local (fila = "pedí ser incluido en este local")
create table if not exists public.game_optins (
  user_id uuid not null references public.users(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  game_key text not null references public.games(key) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, business_id, game_key)
);
alter table public.game_optins enable row level security;
drop policy if exists game_optins_own on public.game_optins;
create policy game_optins_own on public.game_optins for select to authenticated using (user_id = auth.uid());
-- escrituras solo por RPC

-- 4) Expulsiones de Match por local (decisión del dueño; silenciosa para el usuario)
create table if not exists public.match_kicks (
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  kicked_by uuid references public.users(id) on delete set null,
  reason text,
  created_at timestamptz not null default now(),
  primary key (business_id, user_id)
);
alter table public.match_kicks enable row level security;
drop policy if exists match_kicks_owner on public.match_kicks;
create policy match_kicks_owner on public.match_kicks for all to authenticated
  using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid()))
  with check (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid()));

-- 5) Presencia de Match (check-in fuerte): por usuario y NEGOCIO, no por sala
create table if not exists public.match_presence (
  user_id uuid not null references public.users(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  entered_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  active_since timestamptz,              -- null = pendiente (aún no es presencia "fuerte")
  method text not null check (method in ('qr', 'geo')),
  readings integer not null default 1,
  mocked boolean not null default false,  -- señal de ubicación simulada (Android), no garantía
  primary key (user_id, business_id)
);
create index if not exists match_presence_business_active_idx on public.match_presence (business_id, expires_at) where active_since is not null;
create index if not exists match_presence_expires_idx on public.match_presence (expires_at);
alter table public.match_presence enable row level security;
drop policy if exists match_presence_own on public.match_presence;
create policy match_presence_own on public.match_presence for select to authenticated using (user_id = auth.uid());
-- escrituras solo por RPC

-- 6) Helper: distancia Haversine en metros
create or replace function public.geo_distance_m(lat1 float8, lng1 float8, lat2 float8, lng2 float8)
returns float8 language sql immutable as $$
  select 6371000 * 2 * atan2(
    sqrt(power(sin(radians(lat2 - lat1) / 2), 2) + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)),
    sqrt(1 - (power(sin(radians(lat2 - lat1) / 2), 2) + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)))
  );
$$;

-- 7) Check-in de Match (latido). QR del local → activo al instante. Geo → activo tras 2 lecturas dentro del radio separadas ≥ 5 min.
--    Verifica: edad confirmada, "Participar en juegos", Match activo en el local, no expulsado, dentro del radio, y "viaje imposible".
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
    return jsonb_build_object('status','denied','reason','unavailable'); -- silencioso
  end if;

  select b.lat, b.lng, b.geofence_radius_m into v_biz from public.businesses b where b.id = p_business_id;

  -- QR del local (cualquier sala activa del negocio)
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

  -- Opt-in del local (el check-in ES el acto de pedir ser incluido)
  insert into public.game_optins (user_id, business_id, game_key) values (v_uid, p_business_id, 'match')
  on conflict do nothing;

  insert into public.match_presence (user_id, business_id, entered_at, last_seen_at, expires_at, active_since, method, readings, mocked)
  values (v_uid, p_business_id, now(), now(), now() + interval '15 minutes',
          case when v_qr_ok then now() else null end,
          case when v_qr_ok then 'qr' else 'geo' end, 1, coalesce(p_mocked, false))
  on conflict (user_id, business_id) do update set
    last_seen_at = now(),
    expires_at = now() + interval '15 minutes',
    readings = match_presence.readings + 1,
    mocked = match_presence.mocked or coalesce(p_mocked, false),
    method = case when v_qr_ok then 'qr' else match_presence.method end,
    active_since = coalesce(match_presence.active_since,
                            case when v_qr_ok then now()
                                 when match_presence.readings + 1 >= 2 and now() - match_presence.entered_at >= interval '5 minutes' then now()
                                 else null end)
  returning * into v_row;

  v_status := case when v_row.active_since is not null then 'active' else 'pending' end;
  return jsonb_build_object('status', v_status, 'active_since', v_row.active_since, 'expires_at', v_row.expires_at,
                            'readings', v_row.readings, 'method', v_row.method, 'distance_m', round(coalesce(v_dist,0)::numeric));
end;
$$;
revoke all on function public.match_check_in(uuid, float8, float8, text, boolean) from public, anon;
grant execute on function public.match_check_in(uuid, float8, float8, text, boolean) to authenticated;

-- 8) Ajustes nuevos en update_my_settings: gamesEnabled, pushPreviewDm/pushPreviewMatch (full|name|discreet), matchNotifyNewPeople, matchAgeMin/Max
create or replace function public.update_my_settings(p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_key text;
  v_val jsonb;
  v_result jsonb;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then raise exception 'invalid_patch' using errcode = '22023'; end if;

  for v_key, v_val in select * from jsonb_each(p_patch) loop
    case v_key
      when 'notifWork', 'notifSocial', 'gamesEnabled', 'matchNotifyNewPeople' then
        if jsonb_typeof(v_val) <> 'boolean' then raise exception 'invalid_value_for_%', v_key using errcode = '22023'; end if;
      when 'proximityMode' then
        if jsonb_typeof(v_val) <> 'string' or (v_val #>> '{}') not in ('all','favorites','visited','off') then raise exception 'invalid_value_for_%', v_key using errcode = '22023'; end if;
      when 'appearance' then
        if jsonb_typeof(v_val) <> 'string' or (v_val #>> '{}') not in ('dark','light','system') then raise exception 'invalid_value_for_%', v_key using errcode = '22023'; end if;
      when 'feedRadiusMiles' then
        if jsonb_typeof(v_val) <> 'number' or (v_val #>> '{}') not in ('5','10','25','50','100') then raise exception 'invalid_value_for_%', v_key using errcode = '22023'; end if;
      when 'pushPreviewDm', 'pushPreviewMatch' then
        if jsonb_typeof(v_val) <> 'string' or (v_val #>> '{}') not in ('full','name','discreet') then raise exception 'invalid_value_for_%', v_key using errcode = '22023'; end if;
      when 'matchAgeMin', 'matchAgeMax' then
        if jsonb_typeof(v_val) <> 'number' or (v_val #>> '{}')::numeric < 18 or (v_val #>> '{}')::numeric > 99 then raise exception 'invalid_value_for_%', v_key using errcode = '22023'; end if;
      else
        raise exception 'unknown_setting_%', v_key using errcode = '22023';
    end case;
  end loop;

  update public.users set settings = coalesce(settings, '{}'::jsonb) || p_patch where id = v_uid returning settings into v_result;
  return coalesce(v_result, '{}'::jsonb);
end;
$$;
