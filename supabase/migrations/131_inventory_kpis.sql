-- 131_inventory_kpis.sql
-- Fase B1: panel de KPIs de inventario (solo lectura). YA APLICADO A PRODUCCIÓN por
-- Planning Claude (MCP, 2026-08-19). Solo control de versiones. Idempotente. NO re-aplicar.
create or replace function public.inventory_kpis(
  p_business_id uuid,
  p_from timestamptz,
  p_to   timestamptz
)
returns table(
  total_revenue_cents   bigint,
  costed_revenue_cents  bigint,
  cogs_cents            bigint,
  pour_cost_pct         numeric,
  coverage_pct          numeric,
  inventory_value_cents bigint,
  turnover              numeric,
  days_on_hand          numeric
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_has_perm boolean;
  v_total bigint; v_costed bigint; v_cogs bigint; v_inv bigint;
  v_days numeric;
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

  select
    coalesce(sum(oi.qty * oi.price_cents), 0),
    coalesce(sum(case when mic.cost_cents is not null then oi.qty * oi.price_cents end), 0),
    coalesce(sum(case when mic.cost_cents is not null then oi.qty * mic.cost_cents end), 0)
  into v_total, v_costed, v_cogs
  from order_items oi
  join orders o on o.id = oi.order_id
  left join menu_item_costs mic on mic.menu_item_id = oi.menu_item_id
  where o.business_id = p_business_id
    and o.canceled_at is null
    and o.created_at >= p_from
    and o.created_at <  p_to;

  select coalesce(sum(mi.stock_count * mic.cost_cents), 0)
  into v_inv
  from menu_items mi
  join menu_item_costs mic on mic.menu_item_id = mi.id
  where mi.business_id = p_business_id
    and mi.stock_count is not null
    and mic.cost_cents is not null;

  v_days := greatest(extract(epoch from (p_to - p_from)) / 86400.0, 0);

  return query select
    v_total,
    v_costed,
    v_cogs,
    case when v_costed > 0 then round(100.0 * v_cogs / v_costed, 1) else null end,
    case when v_total  > 0 then round(100.0 * v_costed / v_total, 1) else null end,
    v_inv,
    case when v_inv  > 0 then round(v_cogs::numeric / v_inv, 2) else null end,
    case when v_cogs > 0 and v_days > 0 then round(v_inv * v_days / v_cogs, 1) else null end;
end
$function$;
revoke all on function public.inventory_kpis(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.inventory_kpis(uuid, timestamptz, timestamptz) to authenticated;
