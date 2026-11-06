-- 262 — Modo revisión (Fase D1). NO APLICADA: la aplica Juan por MCP. Idempotente y sin DROP.
--
-- Un "grupo de prueba" en base de datos (cuentas del revisor y QA + locales de demo) y un interruptor general con caducidad
-- (máximo 30 días). La única excepción a la regla de oro (estar físicamente en el local) es:
--     interruptor encendido  Y  cuenta activa del grupo  Y  local activo del grupo
-- y cada vez que se usa queda en review_bypass_log. Todo lo demás no cambia:
--   · un local del grupo solo lo abre quien es del grupo (aunque esté físicamente dentro) y no lo ve nadie más;
--   · las personas del grupo no salen en mazos de Match ni en "presentes" de locales que no son del grupo.
-- Los cuerpos de las funciones reemplazadas son los de producción (2026-11-06, mismo md5 que la base local) con una rama añadida.

-- ───────── Tablas ─────────

create table if not exists public.review_mode (
  id            boolean primary key default true,
  enabled_until timestamptz,
  enabled_by    uuid,
  updated_at    timestamptz not null default now(),
  constraint review_mode_single_row check (id)
);
insert into public.review_mode (id) values (true) on conflict (id) do nothing;

create table if not exists public.review_group_members (
  user_id    uuid primary key references public.users(id) on delete cascade,
  kind       text not null check (kind in ('reviewer', 'qa')),
  status     text not null default 'active' check (status in ('active', 'paused', 'retired')),
  note       text,
  created_at timestamptz not null default now()
);

create table if not exists public.review_group_businesses (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  status      text not null default 'active' check (status in ('active', 'paused', 'retired')),
  created_at  timestamptz not null default now()
);

create table if not exists public.review_bypass_log (
  id          bigint generated always as identity primary key,
  user_id     uuid not null,
  business_id uuid not null,
  fn          text not null,
  at          timestamptz not null default now()
);
create index if not exists review_bypass_log_at_idx on public.review_bypass_log (at desc);
create index if not exists review_bypass_log_dedupe_idx on public.review_bypass_log (user_id, business_id, fn, at desc);

alter table public.review_mode            enable row level security;
alter table public.review_group_members   enable row level security;
alter table public.review_group_businesses enable row level security;
alter table public.review_bypass_log      enable row level security;

revoke all on public.review_mode, public.review_group_members, public.review_group_businesses, public.review_bypass_log from public, anon, authenticated;
grant select on public.review_mode, public.review_group_members, public.review_group_businesses, public.review_bypass_log to authenticated;
grant all on public.review_mode, public.review_group_members, public.review_group_businesses, public.review_bypass_log to service_role;

-- Lectura: solo is_platform_admin() (y service_role, que se salta RLS). Escritura: ninguna política = solo service_role / funciones del servidor.
do $$
declare t text;
begin
  foreach t in array array['review_mode', 'review_group_members', 'review_group_businesses', 'review_bypass_log'] loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || ': admin read') then
      execute format('create policy %I on public.%I for select to authenticated using (public.is_platform_admin())', t || ': admin read', t);
    end if;
  end loop;
end $$;

-- ───────── Funciones de apoyo (security definer, search_path fijo) ─────────

create or replace function public.review_mode_active() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.review_mode m where m.enabled_until > now()) $$;

-- Pertenece al grupo (activa o en pausa; "retired" ya no cuenta como del grupo).
create or replace function public.review_is_member(p_user_id uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.review_group_members m where m.user_id = p_user_id and m.status <> 'retired') $$;

create or replace function public.review_is_group_business(p_business_id uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.review_group_businesses g where g.business_id = p_business_id and g.status <> 'retired') $$;

-- ¿Quien llama es miembro ACTIVO, con el interruptor encendido, y el local es ACTIVO del grupo? (sin escribir nada)
create or replace function public.review_member_sees(p_business_id uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.review_mode_active()
     and exists (select 1 from public.review_group_members m where m.user_id = auth.uid() and m.status = 'active')
     and exists (select 1 from public.review_group_businesses g where g.business_id = p_business_id and g.status = 'active')
$$;

-- El bypass de la geocerca. VOLATILE por el registro. Solo la llaman otras funciones del servidor (sin EXECUTE para anon/authenticated).
-- Un mismo (persona, local, función) se registra una vez cada 10 minutos para que las comprobaciones de pedidos no llenen el log.
create or replace function public.review_bypass(p_business_id uuid, p_user_id uuid, p_fn text) returns boolean
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if p_user_id is null or p_business_id is null then return false; end if;
  if not public.review_member_sees_as(p_business_id, p_user_id) then return false; end if;
  if not exists (
    select 1 from public.review_bypass_log l
    where l.user_id = p_user_id and l.business_id = p_business_id and l.fn = p_fn and l.at > now() - interval '10 minutes'
  ) then
    insert into public.review_bypass_log (user_id, business_id, fn) values (p_user_id, p_business_id, p_fn);
  end if;
  return true;
end;
$$;

create or replace function public.review_member_sees_as(p_business_id uuid, p_user_id uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.review_mode_active()
     and exists (select 1 from public.review_group_members m where m.user_id = p_user_id and m.status = 'active')
     and exists (select 1 from public.review_group_businesses g where g.business_id = p_business_id and g.status = 'active')
$$;

-- Un local del grupo es visible solo para: miembros activos con el modo encendido, su dueño y el super-admin. Los demás locales, para todos.
create or replace function public.business_visible_to(p_business_id uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select not public.review_is_group_business(p_business_id)
      or public.review_member_sees(p_business_id)
      or exists (select 1 from public.businesses b where b.id = p_business_id and b.owner_id = auth.uid())
      or public.is_platform_admin()
$$;

revoke all on function public.review_mode_active(), public.review_is_member(uuid), public.review_is_group_business(uuid),
  public.review_member_sees(uuid), public.review_member_sees_as(uuid, uuid), public.review_bypass(uuid, uuid, text),
  public.business_visible_to(uuid) from public, anon, authenticated;
-- Las llama una política RLS / una función SQL invoker en nombre de quien consulta:
grant execute on function public.business_visible_to(uuid), public.review_member_sees(uuid) to anon, authenticated, service_role;
grant execute on function public.review_mode_active(), public.review_is_member(uuid), public.review_is_group_business(uuid),
  public.review_member_sees_as(uuid, uuid), public.review_bypass(uuid, uuid, text) to service_role;

-- ───────── Para la app (el servidor decide; el cliente no mide nada para el grupo) ─────────

-- Entrada de un miembro a la sala de un local del grupo SIN coordenadas (permiso de ubicación denegado o lectura inservible).
-- Para cualquier otra persona o local devuelve false y no escribe nada. Misma presencia que check_geofence_and_join_room.
create or replace function public.review_join_room(_room_id uuid) returns boolean
language plpgsql volatile security definer set search_path = ''
as $$
declare _uid uuid := auth.uid(); _business uuid;
begin
  if _uid is null then return false; end if;
  select r.business_id into _business from public.rooms r where r.id = _room_id and r.is_active;
  if _business is null or not public.review_is_group_business(_business) then return false; end if;
  if not public.review_bypass(_business, _uid, 'review_join_room') then return false; end if;
  insert into public.room_geo_presence (room_id, user_id, expires_at, last_seen_at)
  values (_room_id, _uid, now() + interval '10 minutes', now())
  on conflict (room_id, user_id)
  do update set expires_at = excluded.expires_at, last_seen_at = excluded.last_seen_at;
  return true;
end;
$$;

-- Los locales para los que quien llama tiene el bypass ahora mismo (vacío para todo el mundo salvo miembros activos con el modo encendido).
-- La app lo usa para no bloquear "Entrar al chat" por una distancia que el servidor no va a exigir.
create or replace function public.review_bypass_businesses() returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select g.business_id from public.review_group_businesses g
  where g.status = 'active' and public.review_member_sees_as(g.business_id, auth.uid())
$$;

revoke all on function public.review_join_room(uuid), public.review_bypass_businesses() from public, anon;
grant execute on function public.review_join_room(uuid), public.review_bypass_businesses() to authenticated, service_role;

-- ───────── Administración (solo is_platform_admin(); EXECUTE para authenticated, nunca anon) ─────────

create or replace function public.review_mode_set(p_days int) returns timestamptz
language plpgsql volatile security definer set search_path = ''
as $$
declare v_until timestamptz;
begin
  if auth.uid() is null or not public.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_days is null or p_days < 1 or p_days > 30 then raise exception 'invalid_days' using errcode = '22023'; end if;
  v_until := now() + make_interval(days => p_days);
  update public.review_mode set enabled_until = v_until, enabled_by = auth.uid(), updated_at = now() where id;
  return v_until;
end;
$$;

create or replace function public.review_mode_off() returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.review_mode set enabled_until = null, enabled_by = auth.uid(), updated_at = now() where id;
end;
$$;

create or replace function public.review_group_add_member(p_username text, p_kind text) returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare v_id uuid;
begin
  if auth.uid() is null or not public.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_kind not in ('reviewer', 'qa') then raise exception 'invalid_kind' using errcode = '22023'; end if;
  select u.id into v_id from public.users u where lower(u.username) = lower(btrim(p_username));
  if v_id is null then raise exception 'user_not_found' using errcode = 'P0002'; end if;
  insert into public.review_group_members (user_id, kind, status) values (v_id, p_kind, 'active')
  on conflict (user_id) do update set kind = excluded.kind, status = 'active';
  return v_id;
end;
$$;

create or replace function public.review_group_add_business(p_slug text) returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare v_id uuid;
begin
  if auth.uid() is null or not public.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select b.id into v_id from public.businesses b where b.slug = btrim(p_slug);
  if v_id is null then raise exception 'business_not_found' using errcode = 'P0002'; end if;
  insert into public.review_group_businesses (business_id, status) values (v_id, 'active')
  on conflict (business_id) do update set status = 'active';
  return v_id;
end;
$$;

-- p_target = 'member' (p_ref = usuario) o 'business' (p_ref = slug); p_status = active | paused | retired
create or replace function public.review_group_set_status(p_target text, p_ref text, p_status text) returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare n int;
begin
  if auth.uid() is null or not public.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_status not in ('active', 'paused', 'retired') then raise exception 'invalid_status' using errcode = '22023'; end if;
  if p_target = 'member' then
    update public.review_group_members m set status = p_status
      from public.users u where u.id = m.user_id and lower(u.username) = lower(btrim(p_ref));
  elsif p_target = 'business' then
    update public.review_group_businesses g set status = p_status
      from public.businesses b where b.id = g.business_id and b.slug = btrim(p_ref);
  else
    raise exception 'invalid_target' using errcode = '22023';
  end if;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'not_in_group' using errcode = 'P0002'; end if;
end;
$$;

-- Todo lo que muestra /super-admin/review-mode, en una llamada.
create or replace function public.review_group_overview() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'enabled_until', (select m.enabled_until from public.review_mode m where m.id),
    'active', public.review_mode_active(),
    'members', coalesce((select jsonb_agg(jsonb_build_object('username', u.username, 'kind', m.kind, 'status', m.status, 'note', m.note) order by m.kind, u.username)
                         from public.review_group_members m join public.users u on u.id = m.user_id), '[]'::jsonb),
    'businesses', coalesce((select jsonb_agg(jsonb_build_object('slug', b.slug, 'name', b.name, 'status', g.status) order by b.name)
                            from public.review_group_businesses g join public.businesses b on b.id = g.business_id), '[]'::jsonb),
    'log', coalesce((select jsonb_agg(x order by x.at desc) from (
                       select l.at, u.username, b.slug, l.fn from public.review_bypass_log l
                       left join public.users u on u.id = l.user_id left join public.businesses b on b.id = l.business_id
                       order by l.at desc limit 50) x), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.review_mode_set(int), public.review_mode_off(), public.review_group_add_member(text, text),
  public.review_group_add_business(text), public.review_group_set_status(text, text, text), public.review_group_overview() from public, anon;
grant execute on function public.review_mode_set(int), public.review_mode_off(), public.review_group_add_member(text, text),
  public.review_group_add_business(text), public.review_group_set_status(text, text, text), public.review_group_overview() to authenticated, service_role;

-- ───────── Enganche de la geocerca (única regla de oro; cuerpos de producción 2026-11-06 + una rama) ─────────

CREATE OR REPLACE FUNCTION public.check_geofence_and_join_room(_room_id uuid, _lat double precision, _lng double precision)
 RETURNS TABLE(access_granted boolean, is_owner boolean, distance_m double precision, reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  _uid uuid;
  _business_id uuid;
  _owner_id uuid;
  _biz_lat float8;
  _biz_lng float8;
  _radius_m float8;
  _dlat float8;
  _dlng float8;
  _a float8;
  _dist float8;
begin
  _uid := auth.uid();

  if _uid is null then
    return query select false, false, null::float8, 'auth_required';
    return;
  end if;

  select r.business_id into _business_id
  from public.rooms r
  where r.id = _room_id and r.is_active = true;

  if _business_id is null then
    return query select false, false, null::float8, 'invalid_room';
    return;
  end if;

  select b.owner_id, b.lat, b.lng, b.geofence_radius_m
  into _owner_id, _biz_lat, _biz_lng, _radius_m
  from public.businesses b
  where b.id = _business_id;

  -- Única excepción de la regla de oro: el dueño de ESE negocio, sin chequeo de distancia.
  if _owner_id = _uid then
    return query select true, true, null::float8, 'owner';
    return;
  end if;

  -- Modo revisión (migración 262): un local del grupo de prueba solo lo abren los miembros activos con el interruptor encendido
  -- (review_bypass lo registra); para cualquier otra persona, aunque esté físicamente dentro, no está disponible.
  if public.review_is_group_business(_business_id) then
    if public.review_bypass(_business_id, _uid, 'check_geofence_and_join_room') then
      insert into public.room_geo_presence (room_id, user_id, expires_at, last_seen_at)
      values (_room_id, _uid, now() + interval '10 minutes', now())
      on conflict (room_id, user_id)
      do update set expires_at = excluded.expires_at, last_seen_at = excluded.last_seen_at;
      return query select true, false, null::float8, 'review_bypass';
    else
      return query select false, false, null::float8, 'not_available';
    end if;
    return;
  end if;

  -- Sin geocerca válida configurada → default restrictivo, NO acceso.
  if _biz_lat is null or _biz_lng is null or _radius_m is null then
    return query select false, false, null::float8, 'no_geofence';
    return;
  end if;

  _dlat := radians(_biz_lat - _lat);
  _dlng := radians(_biz_lng - _lng);
  _a := power(sin(_dlat / 2), 2)
      + cos(radians(_lat)) * cos(radians(_biz_lat)) * power(sin(_dlng / 2), 2);
  _dist := 6371000 * 2 * atan2(sqrt(_a), sqrt(1 - _a));

  if _dist <= _radius_m then
    insert into public.room_geo_presence (room_id, user_id, expires_at, last_seen_at)
    values (_room_id, _uid, now() + interval '10 minutes', now())
    on conflict (room_id, user_id)
    do update set expires_at = excluded.expires_at, last_seen_at = excluded.last_seen_at;

    return query select true, false, _dist, 'inside_radius';
    return;
  else
    -- Fuera del radio: revoca cualquier geo-presencia previa, no solo "no crear una nueva".
    delete from public.room_geo_presence
    where room_id = _room_id and user_id = _uid;

    return query select false, false, _dist, 'outside_radius';
    return;
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.venue_inside(p_business_id uuid, p_lat double precision, p_lng double precision)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- Modo revisión (262): en un local del grupo solo cuenta el bypass (miembro activo + interruptor); sin auth.uid() no hay bypass.
  if public.review_is_group_business(p_business_id) then
    return coalesce(public.review_bypass(p_business_id, auth.uid(), 'venue_inside'), false);
  end if;
  return coalesce((
    select public.venue_distance_m(p_business_id, p_lat, p_lng) <= b.geofence_radius_m + 25
    from public.businesses b where b.id = p_business_id
  ), false);
end;
$function$;

-- ───────── Visibilidad ─────────

CREATE OR REPLACE FUNCTION public.match_get_deck(p_business_id uuid, p_limit integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid := auth.uid(); v_min int; v_max int; v_year int := extract(year from now())::int;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not exists (select 1 from public.match_presence p where p.user_id = v_uid and p.business_id = p_business_id and p.active_since is not null and p.expires_at > now()) then
    raise exception 'not_present' using errcode = '42501';
  end if;
  select (u.settings->>'matchAgeMin')::int, (u.settings->>'matchAgeMax')::int into v_min, v_max from public.users u where u.id = v_uid;

  return coalesce((
    select jsonb_agg(public.match_card(v_uid, c.user_id, p_business_id) order by c.super_me desc, c.common desc, c.entered_at desc)
    from (
      select t.user_id, t.entered_at,
        exists (select 1 from public.match_swipes s where s.business_id = p_business_id and s.swiper_id = t.user_id and s.target_id = v_uid and s.action = 'super' and s.undone_at is null) as super_me,
        (select count(*) from public.user_interests a join public.user_interests b on b.interest_key = a.interest_key and b.user_id = t.user_id where a.user_id = v_uid) as common
      from public.match_presence t
      join public.users u on u.id = t.user_id
      where t.business_id = p_business_id and t.user_id <> v_uid
        and public.match_common_business(v_uid, t.user_id) = p_business_id
        and (public.review_is_group_business(p_business_id) or not public.review_is_member(t.user_id))
        and exists (select 1 from public.match_photos p where p.user_id = t.user_id and p.status = 'approved')
        and not exists (select 1 from public.match_swipes s where s.business_id = p_business_id and s.swiper_id = v_uid and s.target_id = t.user_id and s.undone_at is null)
        and (v_min is null or u.birth_year is null or (v_year - u.birth_year) >= v_min - 1)
        and (v_max is null or u.birth_year is null or (v_year - u.birth_year) <= v_max + 1)
      limit greatest(1, least(coalesce(p_limit, 20), 50))
    ) c
  ), '[]'::jsonb);
end;
$function$;

CREATE OR REPLACE FUNCTION public.venue_people_counts(p_business_ids uuid[])
 RETURNS TABLE(business_id uuid, people integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select r.business_id, count(distinct g.user_id)::int
  from public.room_geo_presence g
  join public.rooms r on r.id = g.room_id
  where r.business_id = any (p_business_ids) and g.expires_at > now()
    and (public.review_is_group_business(r.business_id) or not public.review_is_member(g.user_id))
  group by r.business_id
$function$;

CREATE OR REPLACE FUNCTION public.venue_present_users(p_business_id uuid, p_user_ids uuid[])
 RETURNS uuid[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or p_business_id is null or p_user_ids is null then
    return '{}'::uuid[];
  end if;

  -- Quien pregunta tiene que estar presente en este mismo local: si no, nadie puede usar la función para sondear un local.
  if not public.venue_presence_ok(p_business_id, v_uid) then
    return '{}'::uuid[];
  end if;

  return coalesce((
    select array_agg(c.id)
    from (
      select distinct x.id
      from unnest(p_user_ids[1:100]) as x(id)  -- como mucho 100 (se corta el resto) y sin duplicados
      where x.id is not null
    ) c
    where public.venue_presence_ok(p_business_id, c.id)
      and (public.review_is_group_business(p_business_id) or not public.review_is_member(c.id))
      and not exists (  -- misma regla que gift_available: sin bloqueo en ningún sentido con quien pregunta
        select 1 from public.blocks b
        where (b.blocker_id = v_uid and b.blocked_id = c.id) or (b.blocker_id = c.id and b.blocked_id = v_uid)
      )
  ), '{}'::uuid[]);
end;
$function$;

CREATE OR REPLACE FUNCTION public.resolve_venue_entry(p_venue text DEFAULT NULL::text, p_label text DEFAULT NULL::text, p_code text DEFAULT NULL::text, p_token text DEFAULT NULL::text)
 RETURNS TABLE(business_id uuid, business_name text, business_slug text, logo_url text, room_id uuid, table_label text, table_qr_token text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_venue text := nullif(lower(btrim(p_venue)), '');
  v_biz   uuid;
  v_room  uuid;
  v_label text;
  v_ttok  text;
begin
  if nullif(btrim(p_token), '') is not null then
    select r.business_id, r.id into v_biz, v_room
    from public.rooms r
    join public.businesses b on b.id = r.business_id
    where r.qr_token = btrim(p_token) and r.is_active and b.is_active
      and (v_venue is null or b.subdomain = v_venue or b.slug = v_venue);
  elsif v_venue is not null then
    select b.id into v_biz
    from public.businesses b
    where b.is_active and (b.subdomain = v_venue or b.slug = v_venue)
    order by (b.subdomain = v_venue) desc nulls last
    limit 1;

    if v_biz is not null and nullif(btrim(p_label), '') is not null and nullif(btrim(p_code), '') is not null then
      select t.label, t.qr_token into v_label, v_ttok
      from public.tables t
      where t.business_id = v_biz and t.is_active
        and lower(t.label) in (lower(btrim(p_label)), 't' || lower(btrim(p_label)), 'mesa ' || lower(btrim(p_label)))
        and t.short_code = lower(btrim(p_code))
      limit 1;
      if v_label is null then
        return;
      end if;
    end if;
  end if;

  if v_biz is null then
    return;
  end if;
  if not public.business_visible_to(v_biz) then
    return;  -- local del grupo de prueba (262): para quien no es del grupo, es como si no existiera
  end if;

  if v_room is null then
    select r.id into v_room
    from public.rooms r
    where r.business_id = v_biz and r.is_active and r.parent_room_id is null
    order by r.is_main desc, r.sort asc nulls last, r.created_at asc
    limit 1;
  end if;

  if v_room is null then
    return;
  end if;

  return query
    select b.id, b.name, b.slug, b.logo_url, v_room, v_label, v_ttok
    from public.businesses b where b.id = v_biz;
end;
$function$;

CREATE OR REPLACE FUNCTION public.megaphone_feed(p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision, p_radius_miles integer DEFAULT 50, p_before timestamp with time zone DEFAULT NULL::timestamp with time zone, p_limit integer DEFAULT 20)
 RETURNS TABLE(kind text, id uuid, business_id uuid, business_name text, business_slug text, icon_emoji text, logo_url text, room_id uuid, title text, body text, discount text, code text, expires_at timestamp with time zone, media_urls text[], created_at timestamp with time zone, distance_miles double precision, like_count bigint, comment_count bigint, liked_by_me boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with biz as (
    select
      b.id, b.name, b.slug, b.icon_emoji, b.logo_url,
      case
        when p_lat is null or p_lng is null or b.lat is null or b.lng is null then null
        else 3958.8 * 2 * asin(sqrt(
          power(sin(radians(b.lat - p_lat) / 2), 2)
          + cos(radians(p_lat)) * cos(radians(b.lat)) * power(sin(radians(b.lng - p_lng) / 2), 2)
        ))
      end as dist,
      (select r.id from public.rooms r
        where r.business_id = b.id
        order by r.is_main desc nulls last, r.sort asc nulls last
        limit 1) as main_room
    from public.businesses b
    where b.status = 'verified'
  ),
  eligible as (
    select * from biz
    where p_lat is null or p_lng is null
       or (dist is not null and dist <= least(greatest(coalesce(p_radius_miles, 50), 1), 500))
       or public.review_member_sees(id)  -- 262: los miembros del grupo ven los locales del grupo desde cualquier distancia
  ),
  items as (
    select
      'offer'::text as kind, o.id, e.id as business_id, e.name as business_name, e.slug as business_slug,
      e.icon_emoji, e.logo_url, coalesce(o.room_id, e.main_room) as room_id,
      o.title, o.description as body, o.discount, o.code, o.expires_at,
      '{}'::text[] as media_urls, o.created_at, e.dist as distance_miles,
      null::bigint as like_count, null::bigint as comment_count, null::boolean as liked_by_me
    from public.offers o
    join eligible e on e.id = o.business_id
    where o.is_active
      and (o.start_at is null or o.start_at <= now())
      and (o.expires_at is null or o.expires_at > now())
    union all
    select
      'post'::text, p.id, e.id, e.name, e.slug,
      e.icon_emoji, e.logo_url, e.main_room,
      null::text, p.caption, null::text, null::text, null::timestamptz,
      p.media_urls, p.created_at, e.dist,
      (select count(*) from public.post_likes l where l.post_id = p.id),
      (select count(*) from public.comments c where c.post_id = p.id),
      exists (select 1 from public.post_likes l where l.post_id = p.id and l.user_id = (select auth.uid()))
    from public.posts p
    join eligible e on e.id = p.business_id
  )
  select * from items
  where p_before is null or items.created_at < p_before
  order by items.created_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$function$;

-- ───────── RLS de businesses: los locales del grupo son invisibles para quien no es del grupo ─────────
-- (ALTER POLICY es idempotente y no borra nada; la política era "using (true)".)
alter policy "businesses: public read" on public.businesses using (public.business_visible_to(id));
