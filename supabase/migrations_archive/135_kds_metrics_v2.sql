-- 135_kds_metrics_v2.sql — Métricas de cocina v2: filtros (estación/mesero), SLA %, período anterior, horas pico.
-- YA APLICADA A PROD por Planning (MCP, 2026-08-19; incluye fix de gate: dueño O empleado pos_access).
-- v1 (pos_kds_metrics) queda intacta. SLA por fase en minutos: menu_items.sla {pending_mins,preparing_mins,ready_mins}
-- sobreescribe businesses.kds_settings->'sla' (mismas llaves) — misma semántica que el KDS.

create or replace function public.pos_kds_metrics_v2(
  p_business_id uuid, p_from timestamptz, p_to timestamptz,
  p_station text default null, p_taken_by uuid default null, p_tz text default 'UTC'
) returns jsonb language plpgsql stable set search_path to 'public'
as $function$
declare
  v_result jsonb;
  v_len interval := p_to - p_from;
begin
  if not (
    exists (select 1 from businesses bz where bz.id = p_business_id and bz.owner_id = auth.uid())
    or public.pos_can_access(p_business_id)
  ) then
    raise exception 'no pos access';
  end if;

  with base as (
    select mi.station, mi.name, o.taken_by, oi.created_at,
           extract(epoch from (oi.preparing_at - oi.created_at)) as queue_s,
           extract(epoch from (oi.ready_at - oi.preparing_at))   as prep_s,
           extract(epoch from (oi.done_at - oi.ready_at))        as pickup_s,
           extract(epoch from (oi.done_at - oi.created_at))      as wait_s,
           extract(hour from (oi.created_at at time zone p_tz))::int as hr,
           coalesce((mi.sla->>'pending_mins')::numeric,   (b.kds_settings->'sla'->>'pending_mins')::numeric)   * 60 as thr_queue_s,
           coalesce((mi.sla->>'preparing_mins')::numeric, (b.kds_settings->'sla'->>'preparing_mins')::numeric) * 60 as thr_prep_s,
           coalesce((mi.sla->>'ready_mins')::numeric,     (b.kds_settings->'sla'->>'ready_mins')::numeric)     * 60 as thr_pickup_s
    from orders o
    join order_items oi on oi.order_id = o.id
    join menu_items mi on mi.id = oi.menu_item_id
    join businesses b on b.id = o.business_id
    where o.business_id = p_business_id
      and o.canceled_at is null
      and oi.created_at >= (p_from - v_len) and oi.created_at < p_to
      and (p_station is null or mi.station = p_station)
      and (p_taken_by is null or o.taken_by = p_taken_by)
  ), scored as (
    select base.*,
      (created_at >= p_from) as in_cur,
      case
        when (thr_queue_s is not null and queue_s is not null)
          or (thr_prep_s is not null and prep_s is not null)
          or (thr_pickup_s is not null and pickup_s is not null)
        then case
          when (thr_queue_s  is not null and queue_s  is not null and queue_s  > thr_queue_s)
            or (thr_prep_s   is not null and prep_s   is not null and prep_s   > thr_prep_s)
            or (thr_pickup_s is not null and pickup_s is not null and pickup_s > thr_pickup_s)
          then 0 else 1 end
        else null
      end as sla_ok
    from base
  ), cur as (select * from scored where in_cur)
  select jsonb_build_object(
    'overall', (select jsonb_build_object(
        'count', count(*),
        'queue_secs',  round(avg(queue_s)  filter (where queue_s  is not null)),
        'prep_secs',   round(avg(prep_s)   filter (where prep_s   is not null)),
        'pickup_secs', round(avg(pickup_s) filter (where pickup_s is not null)),
        'sla_pct',     round(avg(sla_ok)   filter (where sla_ok   is not null) * 100)
      ) from cur),
    'prev', (select jsonb_build_object(
        'count', count(*),
        'queue_secs',  round(avg(queue_s)  filter (where queue_s  is not null)),
        'prep_secs',   round(avg(prep_s)   filter (where prep_s   is not null)),
        'pickup_secs', round(avg(pickup_s) filter (where pickup_s is not null)),
        'sla_pct',     round(avg(sla_ok)   filter (where sla_ok   is not null) * 100)
      ) from scored where not in_cur),
    'by_station', (select coalesce(jsonb_agg(jsonb_build_object(
        'station', station, 'count', cnt,
        'queue_secs', q, 'prep_secs', p, 'pickup_secs', pk, 'sla_pct', sp
      ) order by station), '[]'::jsonb)
      from (
        select station, count(*) cnt,
          round(avg(queue_s)  filter (where queue_s  is not null)) q,
          round(avg(prep_s)   filter (where prep_s   is not null)) p,
          round(avg(pickup_s) filter (where pickup_s is not null)) pk,
          round(avg(sla_ok)   filter (where sla_ok   is not null) * 100) sp
        from cur group by station
      ) s),
    'by_waiter', (select coalesce(jsonb_agg(jsonb_build_object(
        'taken_by', taken_by, 'count', cnt,
        'wait_secs', w, 'pickup_secs', pk, 'sla_pct', sp
      ) order by cnt desc), '[]'::jsonb)
      from (
        select taken_by, count(*) cnt,
          round(avg(wait_s)   filter (where wait_s   is not null)) w,
          round(avg(pickup_s) filter (where pickup_s is not null)) pk,
          round(avg(sla_ok)   filter (where sla_ok   is not null) * 100) sp
        from cur group by taken_by
      ) w),
    'by_hour', (select coalesce(jsonb_agg(jsonb_build_object('hour', hr, 'count', cnt) order by hr), '[]'::jsonb)
      from (select hr, count(*) cnt from cur group by hr) h),
    'slowest', (select coalesce(jsonb_agg(jsonb_build_object(
        'name', name, 'count', cnt, 'prep_secs', p, 'sla_secs', ss, 'over_pct', op
      ) order by op desc nulls last, p desc nulls last), '[]'::jsonb)
      from (
        select name, count(*) cnt,
          round(avg(prep_s) filter (where prep_s is not null)) p,
          round(avg(thr_prep_s)) ss,
          case when avg(thr_prep_s) > 0 and avg(prep_s) filter (where prep_s is not null) is not null
               then round((avg(prep_s) filter (where prep_s is not null) - avg(thr_prep_s)) / avg(thr_prep_s) * 100)
               else null end op
        from cur group by name
        having count(*) filter (where prep_s is not null) > 0
        order by op desc nulls last, p desc nulls last
        limit 5
      ) t)
  ) into v_result;

  return v_result;
end
$function$;
revoke all on function public.pos_kds_metrics_v2(uuid, timestamptz, timestamptz, text, uuid, text) from public, anon;
grant execute on function public.pos_kds_metrics_v2(uuid, timestamptz, timestamptz, text, uuid, text) to authenticated;
