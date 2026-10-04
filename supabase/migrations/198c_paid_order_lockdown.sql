-- 198c: (1) create_paid_order SOLO para el servidor (antes cualquiera, incluso sin cuenta, podía crear pedidos "pagados").
--       (2) Un pedido ya cobrado nunca se rechaza: la regla de oro se aplica ANTES de cobrar (payments / guest-pay con venue_order_access).
-- APLICADA EN PRODUCCIÓN POR PLANNING (2026-10-04). Este archivo solo la versiona.
create or replace function public.create_paid_order(p_order jsonb, p_items jsonb)
returns table (id uuid, order_number bigint) language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_number bigint;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'order_without_items' using errcode = '22023';
  end if;
  insert into public.orders (business_id, user_id, room_id, status, order_type, gift_recipient_id, subtotal_cents, tax_cents, tip_cents, discount_cents,
    total_cents, promo_code, special_instructions, table_label, table_id, taken_by, contact_email, contact_phone, contact_name, stripe_pi_id, source,
    status_updated_at, paid_at, guest_device_id)
  values ((p_order->>'business_id')::uuid, nullif(p_order->>'user_id','')::uuid, nullif(p_order->>'room_id','')::uuid, coalesce(p_order->>'status','confirmed'),
    coalesce(p_order->>'order_type','counter'), nullif(p_order->>'gift_recipient_id','')::uuid, coalesce((p_order->>'subtotal_cents')::integer,0),
    coalesce((p_order->>'tax_cents')::integer,0), coalesce((p_order->>'tip_cents')::integer,0), coalesce((p_order->>'discount_cents')::integer,0),
    coalesce((p_order->>'total_cents')::integer,0), p_order->>'promo_code', p_order->>'special_instructions', p_order->>'table_label',
    nullif(p_order->>'table_id','')::uuid, nullif(p_order->>'taken_by','')::uuid, p_order->>'contact_email', p_order->>'contact_phone', p_order->>'contact_name',
    p_order->>'stripe_pi_id', coalesce(p_order->>'source','customer_stripe'), now(), coalesce((p_order->>'paid_at')::timestamptz, now()), p_order->>'guest_device_id')
  returning orders.id, orders.order_number into v_id, v_number;
  insert into public.order_items (order_id, menu_item_id, qty, price_cents, options, special_instructions, item_status)
  select v_id, (i->>'menu_item_id')::uuid, greatest(coalesce((i->>'qty')::integer,1),1), coalesce((i->>'price_cents')::integer,0),
         coalesce(i->'options','{}'::jsonb), i->>'special_instructions', 'pending'
  from jsonb_array_elements(p_items) i;
  return query select v_id, v_number;
end;
$$;
revoke all on function public.create_paid_order(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.create_paid_order(jsonb, jsonb) to service_role;
revoke all on function public.assert_venue_order_allowed(uuid, uuid, text, float8, float8, text, uuid) from public, anon, authenticated;
grant execute on function public.assert_venue_order_allowed(uuid, uuid, text, float8, float8, text, uuid) to service_role;
