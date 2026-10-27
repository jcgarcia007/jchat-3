create or replace function public.get_public_receipt(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_pay record;
  v_biz record;
  v_items jsonb;
  v_table_label text;
  v_subtotal bigint;
  v_tax bigint;
begin
  select id, business_id, table_id, amount_cents, tip_cents, kind, seat,
         order_item_ids, status, created_at, card_brand, card_last4
    into v_pay
  from pos_payments
  where receipt_code = p_code and status = 'succeeded'
  limit 1;

  if v_pay.id is null then
    return null;
  end if;

  select name, logo_url, address, city, state, phone, slug,
         receipt_brand_color, receipt_template_id
    into v_biz
  from businesses where id = v_pay.business_id;

  select table_label into v_table_label
  from orders
  where table_id = v_pay.table_id and business_id = v_pay.business_id
  order by paid_at desc nulls last, created_at desc
  limit 1;

  if v_pay.order_item_ids is not null and array_length(v_pay.order_item_ids,1) > 0 then
    select jsonb_agg(jsonb_build_object(
             'name', mi.name, 'qty', oi.qty, 'price_cents', oi.price_cents,
             'options', oi.options, 'special_instructions', oi.special_instructions
           ) order by oi.created_at)
      into v_items
    from order_items oi
    join menu_items mi on mi.id = oi.menu_item_id
    where oi.id = any(v_pay.order_item_ids);
  elsif v_pay.kind = 'full' then
    select jsonb_agg(jsonb_build_object(
             'name', mi.name, 'qty', oi.qty, 'price_cents', oi.price_cents,
             'options', oi.options, 'special_instructions', oi.special_instructions
           ) order by oi.created_at)
      into v_items
    from order_items oi
    join menu_items mi on mi.id = oi.menu_item_id
    join orders o on o.id = oi.order_id
    where o.table_id = v_pay.table_id
      and o.business_id = v_pay.business_id
      and o.canceled_at is null
      and o.paid_at is not null
      and o.paid_at between v_pay.created_at - interval '120 seconds'
                       and v_pay.created_at + interval '120 seconds';
  else
    v_items := '[]'::jsonb;
  end if;

  select coalesce(sum(o.subtotal_cents),0), coalesce(sum(o.tax_cents),0)
    into v_subtotal, v_tax
  from orders o
  where o.table_id = v_pay.table_id and o.business_id = v_pay.business_id
    and o.canceled_at is null and o.paid_at is not null
    and o.paid_at between v_pay.created_at - interval '120 seconds'
                     and v_pay.created_at + interval '120 seconds';

  return jsonb_build_object(
    'business', jsonb_build_object(
      'name', v_biz.name, 'logo_url', v_biz.logo_url,
      'address', v_biz.address, 'city', v_biz.city, 'state', v_biz.state,
      'phone', v_biz.phone, 'slug', v_biz.slug,
      'receipt_brand_color', v_biz.receipt_brand_color,
      'receipt_template_id', v_biz.receipt_template_id
    ),
    'payment', jsonb_build_object(
      'amount_cents', v_pay.amount_cents, 'tip_cents', v_pay.tip_cents,
      'kind', v_pay.kind, 'seat', v_pay.seat, 'status', v_pay.status,
      'created_at', v_pay.created_at,
      'card_brand', v_pay.card_brand, 'card_last4', v_pay.card_last4,
      'subtotal_cents', v_subtotal, 'tax_cents', v_tax
    ),
    'table_label', v_table_label,
    'items', coalesce(v_items, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_public_receipt(text) from public;
grant execute on function public.get_public_receipt(text) to anon, authenticated;
