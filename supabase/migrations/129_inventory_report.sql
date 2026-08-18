-- 129_inventory_report.sql
-- Fase A3: reporte de mermas y variación (solo lectura). YA APLICADO A PRODUCCIÓN por
-- Planning Claude (MCP, 2026-08-19). Solo control de versiones. Idempotente. NO re-aplicar.
create or replace function public.inventory_report(
  p_business_id uuid,
  p_from timestamptz,
  p_to   timestamptz
)
returns table(
  menu_item_id uuid,
  item_name    text,
  sold         integer,
  received     integer,
  waste        integer,
  count_adj    integer,
  voided       integer,
  stock_now    integer
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_has_perm boolean;
begin
  if v_uid is null then raise exception 'forbidden' using errcode='42501'; end if;

  select exists (
    select 1 from employees e
    join custom_roles cr on cr.id = e.custom_role_id
    where e.business_id = p_business_id and e.user_id = v_uid and e.status = 'accepted'
      and coalesce((cr.permissions->>'inventory_manage')::boolean, false)
  ) or exists (
    select 1 from businesses b where b.id = p_business_id and b.owner_id = v_uid
  ) into v_has_perm;
  if not v_has_perm then raise exception 'forbidden' using errcode='42501'; end if;

  return query
  select
    mi.id,
    mi.name,
    coalesce(sum(case when sm.reason like 'sale%'     then abs(sm.delta) end), 0)::int,
    coalesce(sum(case when sm.reason like 'received%' then sm.delta      end), 0)::int,
    coalesce(sum(case when sm.reason like 'waste%'    then abs(sm.delta) end), 0)::int,
    coalesce(sum(case when sm.reason like 'count%'    then sm.delta      end), 0)::int,
    coalesce(sum(case when sm.reason like 'void%'     then sm.delta      end), 0)::int,
    mi.stock_count
  from menu_items mi
  left join stock_movements sm
    on sm.menu_item_id = mi.id
   and sm.business_id  = p_business_id
   and sm.created_at  >= p_from
   and sm.created_at  <  p_to
  where mi.business_id = p_business_id
    and mi.stock_count is not null
  group by mi.id, mi.name, mi.stock_count
  order by
    coalesce(sum(case when sm.reason like 'waste%' then abs(sm.delta) end), 0) desc,
    coalesce(sum(case when sm.reason like 'count%' then sm.delta end), 0) asc,
    mi.name asc;
end
$function$;
revoke all on function public.inventory_report(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.inventory_report(uuid, timestamptz, timestamptz) to authenticated;
