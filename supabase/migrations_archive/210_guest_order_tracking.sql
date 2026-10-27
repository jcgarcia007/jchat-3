-- 210 (PROPUESTA — NO APLICADA): seguimiento del pedido para invitados web (Lote C).
-- Un invitado que paga con guest-pay recibe un código aleatorio (32 chars base64url, 192 bits) que guest-pay
-- genera ANTES del PaymentIntent y stripe-webhook guarda en el pedido. Con ese código puede ver el estado
-- (/o/<código>) y avisar al local, sin cuenta.
--
-- Qué hace
--   1. orders.guest_tracking_code (nullable, ÚNICO, índice parcial).
--   2. create_paid_order guarda p_order->>'guest_tracking_code' (el resto es idéntico a 198c).
--   3. guest_order_view(p_code)  → estado del pedido SIN datos personales (ni nombre/correo/teléfono/ids).
--   4. guest_order_notify_staff(p_code, p_kind, p_note) → mismas reglas que order_notify_staff (200):
--      on_my_way | arrived | question (nota obligatoria), 1 cada 2 min, máx. 6, pedido de las últimas 12 h.
--   Ambas RPC son ejecutables por anon y solo funcionan para pedidos de las últimas 12 h.
--
-- Orden de despliegue: ESTE SQL → guest-pay y stripe-webhook → web.
-- Como probarlo (después de aplicar, con un pedido de invitado creado por guest-pay en modo test):
--   select * from public.guest_order_view('<código del pedido>');          -- devuelve jsonb con número, estado, artículos
--   select public.guest_order_view('codigo-inexistente-xxxxxxxxxxxx');      -- null
--   select public.guest_order_notify_staff('<código>', 'on_my_way', null);  -- crea un service_call type='order'
--   repetir de inmediato                                                    -- notice_cooldown
--   select public.guest_order_notify_staff('<código>', 'question', null);   -- note_required
--   update public.orders set created_at = now() - interval '13 hours' where guest_tracking_code = '<código>';
--   select public.guest_order_view('<código>');                              -- null (más de 12 h)
-- Rollback: drop function public.guest_order_view(text); drop function public.guest_order_notify_staff(text,text,text);
--           alter table public.orders drop column guest_tracking_code;  (y restaurar create_paid_order de 198c)

alter table public.orders add column if not exists guest_tracking_code text;
create unique index if not exists orders_guest_tracking_code_key on public.orders (guest_tracking_code) where guest_tracking_code is not null;

-- create_paid_order = 198c + guest_tracking_code (única diferencia).
create or replace function public.create_paid_order(p_order jsonb, p_items jsonb)
returns table (id uuid, order_number bigint) language plpgsql security definer set search_path = public as $$
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
revoke all on function public.create_paid_order(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.create_paid_order(jsonb, jsonb) to service_role;

-- Estado del pedido por código. NUNCA devuelve id del pedido, usuario, nombre, correo, teléfono ni totales de terceros.
create or replace function public.guest_order_view(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_o record;
begin
  if p_code is null or length(p_code) < 20 then return null; end if;
  select o.id, o.order_number, o.status, o.order_type, o.table_label, o.created_at, o.status_updated_at, o.business_id
    into v_o from public.orders o
   where o.guest_tracking_code = p_code and o.created_at > now() - interval '12 hours';
  if v_o.id is null then return null; end if;
  return jsonb_build_object(
    'order_number', v_o.order_number,
    'status', v_o.status,
    'order_type', v_o.order_type,
    'table_label', v_o.table_label,
    'created_at', v_o.created_at,
    'status_updated_at', v_o.status_updated_at,
    'business', (select jsonb_build_object('name', b.name, 'slug', b.slug) from public.businesses b where b.id = v_o.business_id),
    'items', coalesce((select jsonb_agg(jsonb_build_object('name', mi.name, 'qty', oi.qty, 'item_status', oi.item_status) order by oi.created_at, oi.id)
                         from public.order_items oi join public.menu_items mi on mi.id = oi.menu_item_id
                        where oi.order_id = v_o.id), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.guest_order_view(text) from public;
grant execute on function public.guest_order_view(text) to anon, authenticated;

-- Aviso al local desde el seguimiento. Mismas reglas que order_notify_staff (200).
create or replace function public.guest_order_notify_staff(p_code text, p_kind text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_o record; v_room uuid; v_id uuid; v_note text;
begin
  if p_code is null or length(p_code) < 20 then raise exception 'not_your_order' using errcode = '42501'; end if;
  if p_kind not in ('on_my_way','arrived','question') then raise exception 'invalid_kind' using errcode = '22023'; end if;
  select o.id, o.business_id, o.room_id, o.status, o.order_type, o.table_label, o.order_number, o.created_at, o.guest_device_id
    into v_o from public.orders o where o.guest_tracking_code = p_code;
  if v_o.id is null then raise exception 'not_your_order' using errcode = '42501'; end if;
  if v_o.status in ('cancelled') or v_o.created_at < now() - interval '12 hours' then
    raise exception 'order_closed' using errcode = '22023';
  end if;
  if exists (select 1 from public.service_calls sc where sc.order_id = v_o.id and sc.created_at > now() - interval '2 minutes') then
    raise exception 'notice_cooldown' using errcode = '42501';
  end if;
  if (select count(*) from public.service_calls sc where sc.order_id = v_o.id) >= 6 then
    raise exception 'notice_limit' using errcode = '42501';
  end if;
  v_room := coalesce(v_o.room_id, (select r.id from public.rooms r where r.business_id = v_o.business_id and r.parent_room_id is null and r.is_active order by r.created_at limit 1));
  if v_room is null then raise exception 'no_room' using errcode = '22023'; end if;
  v_note := nullif(left(trim(coalesce(p_note,'')), 200), '');
  if p_kind = 'question' and v_note is null then raise exception 'note_required' using errcode = '22023'; end if;
  perform set_config('app.order_notify', 'on', true);
  insert into public.service_calls (room_id, business_id, user_id, status, type, notes, table_label, order_id, guest_device_id)
  values (v_room, v_o.business_id, null, 'pending', 'order',
          '#' || v_o.order_number || ' · ' || p_kind || coalesce(' · ' || v_note, ''), v_o.table_label, v_o.id, v_o.guest_device_id)
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'order_number', v_o.order_number, 'kind', p_kind);
end;
$$;
revoke all on function public.guest_order_notify_staff(text, text, text) from public;
grant execute on function public.guest_order_notify_staff(text, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
