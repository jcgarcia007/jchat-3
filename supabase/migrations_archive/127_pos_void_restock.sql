-- 127_pos_void_restock.sql
-- Inventario perpetuo (Fase A1): pos_void_order REPONE el stock al anular una ronda.
-- YA APLICADO A PRODUCCIÓN por Planning Claude (MCP, 2026-08-17). Solo control de versiones.
-- CREATE OR REPLACE = idempotente. NO re-aplicar manualmente a prod.

CREATE OR REPLACE FUNCTION public.pos_void_order(p_business_id uuid, p_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_biz uuid; v_table uuid; v_paid timestamptz; v_canceled timestamptz; v_status text;
  v_nonpending integer; v_pending_split integer;
begin
  if not public.pos_can_access(p_business_id) then raise exception 'no pos access'; end if;

  select o.business_id, o.table_id, o.paid_at, o.canceled_at, o.status
    into v_biz, v_table, v_paid, v_canceled, v_status
  from public.orders o where o.id = p_order_id;

  if v_biz is null then raise exception 'order not found'; end if;
  if v_biz <> p_business_id then raise exception 'order not in this business'; end if;
  if v_paid is not null then raise exception 'order already paid'; end if;
  if v_canceled is not null then return; end if;  -- idempotente

  -- Gating 1: la ORDEN no debe haber sido tomada por la cocina
  if v_status in ('preparing', 'ready') then raise exception 'order in preparation'; end if;

  -- Gating 2: ningún ITEM debe haber avanzado
  select count(*) into v_nonpending
  from public.order_items oi
  where oi.order_id = p_order_id and oi.item_status <> 'pending';
  if v_nonpending > 0 then raise exception 'order in preparation'; end if;

  -- Bloquear si hay un split en curso en la mesa
  select count(*) into v_pending_split
  from public.pos_payments pp
  where pp.table_id = v_table and pp.status = 'pending';
  if v_pending_split > 0 then raise exception 'split in progress'; end if;

  -- Inventario perpetuo: al ANULAR la ronda, reponer el stock que se descontó al enviar a cocina.
  -- Solo productos rastreados (stock_count no nulo). Simetrico al descuento de pos_create_order.
  update public.menu_items mi
     set stock_count = coalesce(mi.stock_count, 0) + agg.qty
    from (
      select oi.menu_item_id, sum(oi.qty)::int as qty
      from public.order_items oi
      where oi.order_id = p_order_id
      group by oi.menu_item_id
    ) agg
   where mi.id = agg.menu_item_id
     and mi.business_id = p_business_id
     and mi.stock_count is not null;

  insert into public.stock_movements (menu_item_id, business_id, delta, reason, created_by)
  select oi.menu_item_id, p_business_id, sum(oi.qty)::int, 'void', auth.uid()
  from public.order_items oi
  join public.menu_items mi on mi.id = oi.menu_item_id
  where oi.order_id = p_order_id
    and mi.business_id = p_business_id
    and mi.stock_count is not null
  group by oi.menu_item_id;

  update public.orders set canceled_at = now() where id = p_order_id;
end;
$function$;
