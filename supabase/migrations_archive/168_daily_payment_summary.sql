-- 168: Z-report diario de pagos por método + payment_method en get_public_receipt — Tab POS · F8.
begin;

-- ─── pos_daily_payment_summary ────────────────────────────────────────────────
-- Agregado de caja del día por método de pago.
-- Solo dueño/staff con acceso al negocio (NOT_ALLOWED si no).
-- p_day: fecha local YYYY-MM-DD en la zona del negocio; null = hoy.
-- Zona: America/New_York hardcodeado (igual que pos_receipts_today; businesses.timezone no existe aún).
create or replace function public.pos_daily_payment_summary(
  p_business_id uuid,
  p_day         date default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_tz    text    := 'America/New_York';
  v_is_owner boolean;
  v_day   date;
  v_start timestamptz;
  v_end   timestamptz;
  v_out   jsonb;
begin
  v_is_owner := exists (
    select 1 from public.businesses b
    where b.id = p_business_id and b.owner_id = auth.uid()
  );
  if not (v_is_owner or public.is_employee_of_business(p_business_id)) then
    raise exception 'NOT_ALLOWED';
  end if;

  v_day   := coalesce(p_day, (now() at time zone v_tz)::date);
  v_start := (v_day::text || ' 00:00:00')::timestamp at time zone v_tz;
  v_end   := ((v_day + 1)::text || ' 00:00:00')::timestamp at time zone v_tz;

  select jsonb_build_object(
    'day',      v_day,
    'timezone', v_tz,
    'by_method', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'payment_method', m.payment_method,
          'count',          m.cnt,
          'sales_cents',    m.sales,
          'tips_cents',     m.tips,
          'total_cents',    m.sales + m.tips
        ) order by m.payment_method
      )
      from (
        select
          coalesce(pp.payment_method, 'unknown') as payment_method,
          count(*)                               as cnt,
          sum(pp.amount_cents)                   as sales,
          sum(coalesce(pp.tip_cents, 0))         as tips
        from public.pos_payments pp
        where pp.business_id = p_business_id
          and pp.status      = 'succeeded'
          and pp.created_at >= v_start
          and pp.created_at  < v_end
        group by coalesce(pp.payment_method, 'unknown')
      ) m
    ), '[]'::jsonb),
    'totals', (
      select jsonb_build_object(
        'count',       coalesce(count(*), 0),
        'sales_cents', coalesce(sum(pp.amount_cents), 0),
        'tips_cents',  coalesce(sum(coalesce(pp.tip_cents, 0)), 0),
        'total_cents', coalesce(sum(pp.amount_cents + coalesce(pp.tip_cents, 0)), 0)
      )
      from public.pos_payments pp
      where pp.business_id = p_business_id
        and pp.status      = 'succeeded'
        and pp.created_at >= v_start
        and pp.created_at  < v_end
    )
  ) into v_out;

  return v_out;
end $$;

revoke all on function public.pos_daily_payment_summary(uuid, date) from public, anon;
grant execute on function public.pos_daily_payment_summary(uuid, date) to authenticated;

-- ─── get_public_receipt: añadir payment_method al objeto payment ──────────────
-- Cuerpo completo de la migración 157 (última versión en producción) + payment_method.

create or replace function public.get_public_receipt(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_pay         record;
  v_biz         record;
  v_items       jsonb;
  v_table_label text;
  v_subtotal    bigint;
  v_tax         bigint;
  v_server_name text;
begin
  -- 1. Payment (includes payment_method — added F8)
  select id, business_id, table_id, amount_cents, tip_cents, kind, seat,
         order_item_ids, status, created_at, card_brand, card_last4, paid_by,
         payment_method
    into v_pay
  from pos_payments
  where receipt_code = p_code and status = 'succeeded'
  limit 1;

  if v_pay.id is null then
    return null;
  end if;

  -- 2. Business
  select name, logo_url, address, city, state, phone, slug,
         receipt_brand_color, receipt_template_id
    into v_biz
  from businesses where id = v_pay.business_id;

  -- 3. Table label
  select table_label into v_table_label
  from orders
  where table_id = v_pay.table_id and business_id = v_pay.business_id
  order by paid_at desc nulls last, created_at desc
  limit 1;

  -- 4. Items
  if v_pay.order_item_ids is not null and array_length(v_pay.order_item_ids, 1) > 0 then
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
      and o.canceled_at is null and o.paid_at is not null
      and o.paid_at between v_pay.created_at - interval '120 seconds'
                        and v_pay.created_at + interval '120 seconds';
  else
    v_items := '[]'::jsonb;
  end if;

  -- 5. Subtotal + Tax
  if v_pay.order_item_ids is not null and array_length(v_pay.order_item_ids, 1) > 0 then
    select coalesce(sum(oi.price_cents * oi.qty), 0)
      into v_subtotal
    from order_items oi
    where oi.id = any(v_pay.order_item_ids);

    select coalesce(sum(
      o.tax_cents::numeric * per_order.item_total / nullif(o.subtotal_cents, 0)
    ), 0)::bigint
      into v_tax
    from (
      select oi.order_id, sum(oi.price_cents * oi.qty) as item_total
      from order_items oi
      where oi.id = any(v_pay.order_item_ids)
      group by oi.order_id
    ) per_order
    join orders o on o.id = per_order.order_id;
  else
    select coalesce(sum(o.subtotal_cents), 0), coalesce(sum(o.tax_cents), 0)
      into v_subtotal, v_tax
    from orders o
    where o.table_id = v_pay.table_id and o.business_id = v_pay.business_id
      and o.canceled_at is null and o.paid_at is not null
      and o.paid_at between v_pay.created_at - interval '120 seconds'
                        and v_pay.created_at + interval '120 seconds';
  end if;

  -- 6. Server name
  if v_pay.paid_by is not null then
    select coalesce(e.receipt_display_name, u.display_name)
      into v_server_name
    from employees e
    join users u on u.id = e.user_id
    where e.user_id = v_pay.paid_by
      and e.business_id = v_pay.business_id
    limit 1;
  end if;

  -- 7. Result (payment_method added F8)
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
      'subtotal_cents', v_subtotal, 'tax_cents', v_tax,
      'payment_method', v_pay.payment_method
    ),
    'table_label', v_table_label,
    'items', coalesce(v_items, '[]'::jsonb),
    'server_name', v_server_name
  );
end;
$$;

revoke all on function public.get_public_receipt(text) from public;
grant execute on function public.get_public_receipt(text) to anon, authenticated;

commit;
