-- 157_receipt_server_name.sql
-- Two changes:
-- 1. ADD COLUMN employees.receipt_display_name — short name shown on receipts
-- 2. CREATE OR REPLACE FUNCTION get_public_receipt with:
--    a. server_name field (paid_by → employees.receipt_display_name → users.display_name → null)
--    b. Corrected subtotal/tax for seat/custom payments (from order_items, not orders window)

-- ── DDL ────────────────────────────────────────────────────────────────────────

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS receipt_display_name TEXT;

COMMENT ON COLUMN public.employees.receipt_display_name IS
  'Short name shown on printed and digital receipts as "Atendido por: ...". '
  'Falls back to users.display_name when NULL. Nothing is shown if pos_payments.paid_by is NULL.';

-- ── Function ──────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_public_receipt(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_pay         RECORD;
  v_biz         RECORD;
  v_items       JSONB;
  v_table_label TEXT;
  v_subtotal    BIGINT;
  v_tax         BIGINT;
  v_server_name TEXT;
BEGIN
  -- 1. Payment — now includes paid_by
  SELECT id, business_id, table_id, amount_cents, tip_cents, kind, seat,
         order_item_ids, status, created_at, card_brand, card_last4, paid_by
    INTO v_pay
  FROM pos_payments
  WHERE receipt_code = p_code AND status = 'succeeded'
  LIMIT 1;

  IF v_pay.id IS NULL THEN
    RETURN NULL;
  END IF;

  -- 2. Business (unchanged)
  SELECT name, logo_url, address, city, state, phone, slug,
         receipt_brand_color, receipt_template_id
    INTO v_biz
  FROM businesses WHERE id = v_pay.business_id;

  -- 3. Table label (unchanged)
  SELECT table_label INTO v_table_label
  FROM orders
  WHERE table_id = v_pay.table_id AND business_id = v_pay.business_id
  ORDER BY paid_at DESC NULLS LAST, created_at DESC
  LIMIT 1;

  -- 4. Items (unchanged)
  IF v_pay.order_item_ids IS NOT NULL AND array_length(v_pay.order_item_ids, 1) > 0 THEN
    SELECT jsonb_agg(jsonb_build_object(
             'name', mi.name, 'qty', oi.qty, 'price_cents', oi.price_cents,
             'options', oi.options, 'special_instructions', oi.special_instructions
           ) ORDER BY oi.created_at)
      INTO v_items
    FROM order_items oi
    JOIN menu_items mi ON mi.id = oi.menu_item_id
    WHERE oi.id = ANY(v_pay.order_item_ids);
  ELSIF v_pay.kind = 'full' THEN
    SELECT jsonb_agg(jsonb_build_object(
             'name', mi.name, 'qty', oi.qty, 'price_cents', oi.price_cents,
             'options', oi.options, 'special_instructions', oi.special_instructions
           ) ORDER BY oi.created_at)
      INTO v_items
    FROM order_items oi
    JOIN menu_items mi ON mi.id = oi.menu_item_id
    JOIN orders o ON o.id = oi.order_id
    WHERE o.table_id = v_pay.table_id
      AND o.business_id = v_pay.business_id
      AND o.canceled_at IS NULL AND o.paid_at IS NOT NULL
      AND o.paid_at BETWEEN v_pay.created_at - INTERVAL '120 seconds'
                        AND v_pay.created_at + INTERVAL '120 seconds';
  ELSE
    v_items := '[]'::JSONB;
  END IF;

  -- 5. Subtotal + Tax — FIXED for seat/custom
  IF v_pay.order_item_ids IS NOT NULL AND array_length(v_pay.order_item_ids, 1) > 0 THEN
    -- seat / custom: exact subtotal from order_items, proportional tax per order
    SELECT COALESCE(SUM(oi.price_cents * oi.qty), 0)
      INTO v_subtotal
    FROM order_items oi
    WHERE oi.id = ANY(v_pay.order_item_ids);

    SELECT COALESCE(SUM(
      o.tax_cents::NUMERIC * per_order.item_total / NULLIF(o.subtotal_cents, 0)
    ), 0)::BIGINT
      INTO v_tax
    FROM (
      SELECT oi.order_id, SUM(oi.price_cents * oi.qty) AS item_total
      FROM order_items oi
      WHERE oi.id = ANY(v_pay.order_item_ids)
      GROUP BY oi.order_id
    ) per_order
    JOIN orders o ON o.id = per_order.order_id;
  ELSE
    -- full: sum all orders in ±120s window (correct for full-table checkout)
    SELECT COALESCE(SUM(o.subtotal_cents), 0), COALESCE(SUM(o.tax_cents), 0)
      INTO v_subtotal, v_tax
    FROM orders o
    WHERE o.table_id = v_pay.table_id AND o.business_id = v_pay.business_id
      AND o.canceled_at IS NULL AND o.paid_at IS NOT NULL
      AND o.paid_at BETWEEN v_pay.created_at - INTERVAL '120 seconds'
                        AND v_pay.created_at + INTERVAL '120 seconds';
  END IF;

  -- 6. Server name — NEW
  -- paid_by → employees.receipt_display_name → users.display_name → NULL
  IF v_pay.paid_by IS NOT NULL THEN
    SELECT COALESCE(e.receipt_display_name, u.display_name)
      INTO v_server_name
    FROM employees e
    JOIN users u ON u.id = e.user_id
    WHERE e.user_id = v_pay.paid_by
      AND e.business_id = v_pay.business_id
    LIMIT 1;
  END IF;

  -- 7. Result
  RETURN jsonb_build_object(
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
    'items', COALESCE(v_items, '[]'::JSONB),
    'server_name', v_server_name
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_receipt(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_receipt(TEXT) TO anon, authenticated;
