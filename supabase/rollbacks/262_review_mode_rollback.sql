-- ROLLBACK de 262_review_mode (destructivo: borra las tablas del modo revisión y su registro). Juan lo aplica a mano.
-- Restaura los cuerpos de producción anteriores a 262 de las 7 funciones y la política de businesses.
alter policy "businesses: public read" on public.businesses using (true);

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

CREATE OR REPLACE FUNCTION public.venue_inside(p_business_id uuid, p_lat double precision, p_lng double precision)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(public.venue_distance_m(p_business_id, p_lat, p_lng) <= b.geofence_radius_m + 25, false)
  from public.businesses b where b.id = p_business_id;
$function$;

drop function if exists public.review_bypass_businesses();
drop function if exists public.review_join_room(uuid);
drop function if exists public.review_group_overview();
drop function if exists public.review_group_set_status(text, text, text);
drop function if exists public.review_group_add_business(text);
drop function if exists public.review_group_add_member(text, text);
drop function if exists public.review_mode_off();
drop function if exists public.review_mode_set(int);
drop function if exists public.business_visible_to(uuid);
drop function if exists public.review_bypass(uuid, uuid, text);
drop function if exists public.review_member_sees_as(uuid, uuid);
drop function if exists public.review_member_sees(uuid);
drop function if exists public.review_is_group_business(uuid);
drop function if exists public.review_is_member(uuid);
drop function if exists public.review_mode_active();
drop table if exists public.review_bypass_log;
drop table if exists public.review_group_businesses;
drop table if exists public.review_group_members;
drop table if exists public.review_mode;
