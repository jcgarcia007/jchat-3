-- Fase 4B: Add paid_by = auth.uid() to pos_create_check.
-- The only change from the live body is adding `paid_by` to the INSERT column list.
-- auth.uid() resolves correctly inside SECURITY DEFINER functions via the caller's JWT.

CREATE OR REPLACE FUNCTION public.pos_create_check(
  p_business_id uuid,
  p_table_id    uuid,
  p_order_item_ids uuid[]
)
RETURNS TABLE(payment_id uuid, amount_cents integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare v_amount bigint; v_seat integer; v_kind text; v_pid uuid;
begin
  if not public.pos_can_access(p_business_id) then raise exception 'no pos access'; end if;
  if p_order_item_ids is null or array_length(p_order_item_ids, 1) is null then raise exception 'no items'; end if;

  -- Todos los items deben ser del tab: de esta mesa, orden no cancelada/no cerrada, y NO pagados.
  if exists (
    select 1 from unnest(p_order_item_ids) x
    where not exists (
      select 1 from public.orders o join public.order_items oi on oi.order_id = o.id
      where oi.id = x and o.business_id = p_business_id and o.table_id = p_table_id
        and o.canceled_at is null and o.paid_at is null and oi.paid_at is null
    )
  ) then raise exception 'invalid or already-paid item'; end if;

  select coalesce(sum(oi.price_cents * oi.qty), 0) into v_amount
  from public.order_items oi where oi.id = any(p_order_item_ids);
  if v_amount <= 0 then raise exception 'zero amount'; end if;

  -- seat si todos comparten un mismo seat no nulo; si no, custom
  select case when count(distinct oi.seat) = 1 and count(*) = count(oi.seat) then min(oi.seat) else null end
  into v_seat
  from public.order_items oi where oi.id = any(p_order_item_ids);
  v_kind := case when v_seat is not null then 'seat' else 'custom' end;

  -- paid_by = auth.uid() — server-side only, never from client (Fase 4B).
  insert into public.pos_payments (business_id, table_id, amount_cents, kind, seat, order_item_ids, status, paid_by)
  values (p_business_id, p_table_id, v_amount::integer, v_kind, v_seat, p_order_item_ids, 'pending', auth.uid())
  returning id into v_pid;

  return query select v_pid, v_amount::integer;
end;
$$;
