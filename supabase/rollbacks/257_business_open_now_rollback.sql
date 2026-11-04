-- Reversión de 257_business_open_now.sql: vuelve assert_venue_order_allowed y create_paid_order a su cuerpo anterior (el de la línea base
-- 245 / migración 198c, sin el rechazo venue_closed) y quita business_is_open_now y sus dos ayudantes. No toca datos.
-- Efecto: los pedidos a locales cerrados dejan de rechazarse en la base. La Edge Function payments (la versión que llama a
-- business_is_open_now) fallaría al preguntar: despliega la versión anterior de payments ANTES de revertir, o su comprobación se
-- salta (la función trata un error de la consulta como "horario desconocido" y no bloquea).

create or replace function public.assert_venue_order_allowed(
  p_business_id uuid, p_user_id uuid, p_order_type text, p_lat double precision, p_lng double precision, p_source text, p_taken_by uuid
) returns void
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare v_inside boolean; v_pickup boolean;
begin
  -- Pedidos tomados por el personal (POS) no pasan por la regla
  if p_taken_by is not null or coalesce(p_source,'') like 'pos%' then return; end if;
  if p_user_id is not null and public.is_venue_staff(p_business_id, p_user_id) then return; end if;
  v_inside := (p_user_id is not null and public.venue_presence_ok(p_business_id, p_user_id)) or public.venue_inside(p_business_id, p_lat, p_lng);
  if v_inside then return; end if;
  if coalesce(p_order_type,'counter') = 'counter' then
    select pickup_enabled into v_pickup from public.businesses where id = p_business_id;
    if coalesce(v_pickup,false) then return; end if;
    raise exception 'pickup_disabled' using errcode = '42501';
  end if;
  raise exception 'outside_venue' using errcode = '42501';
end;
$$;

create or replace function public.create_paid_order(p_order jsonb, p_items jsonb)
returns table (id uuid, order_number bigint)
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_id uuid; v_number bigint;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'order_without_items' using errcode = '22023';
  end if;
  insert into public.orders (business_id, user_id, room_id, status, order_type, gift_recipient_id, subtotal_cents, tax_cents, tip_cents, discount_cents,
    total_cents, promo_code, special_instructions, table_label, table_id, taken_by, contact_email, contact_phone, contact_name, stripe_pi_id, source,
    status_updated_at, paid_at, guest_device_id, guest_tracking_code)
  values ((p_order->>'business_id')::uuid, nullif(p_order->>'user_id','')::uuid, nullif(p_order->>'room_id','')::uuid, coalesce(p_order->>'status','confirmed'),
    coalesce(p_order->>'order_type','counter'), nullif(p_order->>'gift_recipient_id','')::uuid, coalesce((p_order->>'subtotal_cents')::integer,0),
    coalesce((p_order->>'tax_cents')::integer,0), coalesce((p_order->>'tip_cents')::integer,0), coalesce((p_order->>'discount_cents')::integer,0),
    coalesce((p_order->>'total_cents')::integer,0), p_order->>'promo_code', p_order->>'special_instructions', p_order->>'table_label',
    nullif(p_order->>'table_id','')::uuid, nullif(p_order->>'taken_by','')::uuid, p_order->>'contact_email', p_order->>'contact_phone', p_order->>'contact_name',
    p_order->>'stripe_pi_id', coalesce(p_order->>'source','customer_stripe'), now(), coalesce((p_order->>'paid_at')::timestamptz, now()), p_order->>'guest_device_id',
    nullif(p_order->>'guest_tracking_code',''))
  returning orders.id, orders.order_number into v_id, v_number;
  insert into public.order_items (order_id, menu_item_id, qty, price_cents, options, special_instructions, item_status)
  select v_id, (i->>'menu_item_id')::uuid, greatest(coalesce((i->>'qty')::integer,1),1), coalesce((i->>'price_cents')::integer,0),
         coalesce(i->'options','{}'::jsonb), i->>'special_instructions', 'pending'
  from jsonb_array_elements(p_items) i;
  return query select v_id, v_number;
end;
$$;

revoke all on function public.assert_venue_order_allowed(uuid, uuid, text, double precision, double precision, text, uuid) from public, anon, authenticated;
grant execute on function public.assert_venue_order_allowed(uuid, uuid, text, double precision, double precision, text, uuid) to service_role;
revoke all on function public.create_paid_order(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.create_paid_order(jsonb, jsonb) to service_role;

drop function if exists public.business_is_open_now(uuid, timestamptz);
drop function if exists public.business_hours_day(jsonb);
drop function if exists public.business_hours_minutes(text);
