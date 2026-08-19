-- 133_purchase_suggestion.sql
-- Fase B2: sugerencia de compra (lista de compras). Modelo min/max:
-- reordenar cuando stock <= umbral; sugerir hasta el par. Solo lectura.
-- YA APLICADO A PRODUCCIÓN por Planning Claude (MCP, 2026-08-19). Idempotente. NO re-aplicar.
create or replace function public.purchase_suggestion(p_business_id uuid)
returns table(
  menu_item_id uuid,
  item_name text,
  stock_count integer,
  low_stock_threshold integer,
  par_level integer,
  suggested_qty integer,
  unit_cost_cents integer,
  suggested_cost_cents bigint
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
    mi.stock_count,
    mi.low_stock_threshold,
    mi.par_level,
    (mi.par_level - mi.stock_count) as suggested_qty,
    mic.cost_cents,
    ((mi.par_level - mi.stock_count)::bigint * mic.cost_cents) as suggested_cost_cents
  from menu_items mi
  left join menu_item_costs mic on mic.menu_item_id = mi.id
  where mi.business_id = p_business_id
    and mi.stock_count is not null
    and mi.par_level is not null
    and mi.stock_count <= mi.low_stock_threshold
    and (mi.par_level - mi.stock_count) > 0
  order by (mi.par_level - mi.stock_count) desc, mi.name;
end
$function$;
revoke all on function public.purchase_suggestion(uuid) from public, anon;
grant execute on function public.purchase_suggestion(uuid) to authenticated;
