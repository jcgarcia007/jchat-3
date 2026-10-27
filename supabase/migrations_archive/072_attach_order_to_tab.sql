-- 072: RPC to attach/detach an order to a tab (Mesas/Taps B2).
--
-- orders.tab_id is deliberately NOT in the client UPDATE allow-list (060/070),
-- so clients cannot repoint an order to a foreign tap. This SECURITY DEFINER
-- RPC is the ONLY authenticated path to set tab_id, and it enforces:
--   - caller is waiter-of-table / owner / platform admin
--   - the order and the tab belong to the SAME business
-- service_role still writes tab_id directly (payment flow, B3). Style copies the
-- 070 helpers (security definer, set search_path = '', anon has no execute).

begin;

create or replace function public.attach_order_to_tab(p_order_id uuid, p_tab_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_table uuid;
  v_biz_tab uuid;
  v_biz_ord uuid;
begin
  if p_tab_id is null then
    -- DETACH: resolve the table from the order's CURRENT tab, to authorize.
    select t.table_id, t.business_id into v_table, v_biz_tab
    from public.table_tabs t
    join public.orders o on o.tab_id = t.id
    where o.id = p_order_id;
    if v_table is null then raise exception 'ORDER_NOT_ATTACHED'; end if;
  else
    select t.table_id, t.business_id into v_table, v_biz_tab
    from public.table_tabs t where t.id = p_tab_id;
    if v_table is null then raise exception 'TAB_NOT_FOUND'; end if;
  end if;

  if not (public.is_waiter_of_table(v_table)
          or public.owns_business_of_table(v_table)
          or public.is_platform_admin()) then
    raise exception 'NOT_ALLOWED';
  end if;

  -- The order must belong to the SAME business as the tab.
  select o.business_id into v_biz_ord from public.orders o where o.id = p_order_id;
  if v_biz_ord is null then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_biz_ord <> v_biz_tab then raise exception 'CROSS_BUSINESS'; end if;

  update public.orders set tab_id = p_tab_id where id = p_order_id;
end $$;

revoke execute on function public.attach_order_to_tab(uuid, uuid) from public, anon;
grant execute on function public.attach_order_to_tab(uuid, uuid) to authenticated;

commit;
