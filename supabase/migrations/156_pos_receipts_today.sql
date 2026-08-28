-- Fase 4B: pos_receipts_today RPC.
-- Returns today's succeeded payments for a business.
-- Gating: owner sees all; employee sees only their own (paid_by = auth.uid()).
-- "Today" is anchored to America/New_York — the business timezone for V1.
-- TODO: when multi-timezone businesses exist, add businesses.timezone and use it here.

CREATE OR REPLACE FUNCTION public.pos_receipts_today(p_business_id uuid)
RETURNS TABLE(
  id           uuid,
  receipt_code text,
  table_label  text,
  amount_cents  integer,
  tip_cents     integer,
  status        text,
  paid_by       uuid,
  created_at    timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_is_owner    boolean;
  v_is_employee boolean;
BEGIN
  v_is_owner := EXISTS (
    SELECT 1 FROM public.businesses b
    WHERE b.id = p_business_id AND b.owner_id = auth.uid()
  );
  v_is_employee := public.is_employee_of_business(p_business_id);

  IF NOT v_is_owner AND NOT v_is_employee THEN
    RAISE EXCEPTION 'no access';
  END IF;

  RETURN QUERY
    SELECT
      pp.id,
      pp.receipt_code,
      t.label                      AS table_label,
      pp.amount_cents,
      COALESCE(pp.tip_cents, 0)    AS tip_cents,
      pp.status,
      pp.paid_by,
      pp.created_at
    FROM   public.pos_payments pp
    LEFT JOIN public.tables t ON t.id = pp.table_id
    WHERE  pp.business_id = p_business_id
      AND  pp.status = 'succeeded'
      AND  pp.created_at >= (
             date_trunc('day', now() AT TIME ZONE 'America/New_York')
             AT TIME ZONE 'America/New_York'
           )
      -- Owner sees everything; employee only sees their own.
      AND  (v_is_owner OR pp.paid_by = auth.uid())
    ORDER BY pp.created_at DESC;
END;
$$;
