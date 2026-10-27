-- 176: feed del megáfono (ofertas + publicaciones de negocios, por radio y fecha)
--      + preferencia feedRadiusMiles en update_my_settings

create or replace function public.megaphone_feed(
  p_lat double precision default null,
  p_lng double precision default null,
  p_radius_miles integer default 50,
  p_before timestamptz default null,
  p_limit integer default 20
)
returns table (
  kind text,
  id uuid,
  business_id uuid,
  business_name text,
  business_slug text,
  icon_emoji text,
  logo_url text,
  room_id uuid,
  title text,
  body text,
  discount text,
  code text,
  expires_at timestamptz,
  media_urls text[],
  created_at timestamptz,
  distance_miles double precision,
  like_count bigint,
  comment_count bigint,
  liked_by_me boolean
)
language sql
stable
security invoker
set search_path = public
as $$
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
$$;

revoke all on function public.megaphone_feed(double precision, double precision, integer, timestamptz, integer) from public, anon;
grant execute on function public.megaphone_feed(double precision, double precision, integer, timestamptz, integer) to authenticated;

-- Agregar feedRadiusMiles (5/10/25/50/100) a las preferencias permitidas
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
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'invalid_patch' using errcode = '22023';
  end if;

  for v_key, v_val in select * from jsonb_each(p_patch) loop
    case v_key
      when 'notifWork', 'notifSocial' then
        if jsonb_typeof(v_val) <> 'boolean' then
          raise exception 'invalid_value_for_%', v_key using errcode = '22023';
        end if;
      when 'proximityMode' then
        if jsonb_typeof(v_val) <> 'string'
           or (v_val #>> '{}') not in ('all', 'favorites', 'visited', 'off') then
          raise exception 'invalid_value_for_%', v_key using errcode = '22023';
        end if;
      when 'appearance' then
        if jsonb_typeof(v_val) <> 'string'
           or (v_val #>> '{}') not in ('dark', 'light', 'system') then
          raise exception 'invalid_value_for_%', v_key using errcode = '22023';
        end if;
      when 'feedRadiusMiles' then
        if jsonb_typeof(v_val) <> 'number'
           or (v_val #>> '{}') not in ('5', '10', '25', '50', '100') then
          raise exception 'invalid_value_for_%', v_key using errcode = '22023';
        end if;
      else
        raise exception 'unknown_setting_%', v_key using errcode = '22023';
    end case;
  end loop;

  update public.users
  set settings = coalesce(settings, '{}'::jsonb) || p_patch
  where id = v_uid
  returning settings into v_result;

  return coalesce(v_result, '{}'::jsonb);
end;
$$;

revoke all on function public.update_my_settings(jsonb) from public, anon;
grant execute on function public.update_my_settings(jsonb) to authenticated;
