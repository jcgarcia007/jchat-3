-- ============================================================
-- JChat 3.0 — Migration 118: fix affiliate_summary RPC
--
-- Recreates (or creates) the affiliate_summary() function with
-- explicit table aliases on every column reference, eliminating
-- the "column reference id is ambiguous" error that was raised
-- when the function was applied directly to the DB without
-- fully-qualified column names in the GROUP BY / SELECT.
--
-- Also creates assign_affiliate_to_user() if it does not exist,
-- since both RPCs were applied outside the migration history.
-- ============================================================

-- ── 1. affiliate_summary() ────────────────────────────────────────────────────
-- Returns one row per affiliate with aggregated commission stats.
-- Uses DROP + CREATE because the function was previously applied directly to
-- the DB with a different OUT-column signature, so CREATE OR REPLACE fails
-- with "cannot change return type of existing function".
-- All column references are fully qualified to prevent ambiguity.

DROP FUNCTION IF EXISTS public.affiliate_summary();

CREATE FUNCTION public.affiliate_summary()
RETURNS TABLE (
  id                 uuid,
  affiliate_number   text,
  name               text,
  email              text,
  phone              text,
  commission_pct     numeric,
  status             text,
  payouts_held       boolean,
  referred_users     bigint,
  waiting_cents      bigint,   -- commissions in status 'pending' (clawback window open)
  ready_cents        bigint,   -- commissions in status 'approved' (ready to pay out)
  paid_cents         bigint,   -- commissions in status 'paid'
  reversed_cents     bigint,   -- commissions in status 'reversed' (refunds / disputes)
  last_payout_at     timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    a.id,
    a.affiliate_number,
    a.name,
    a.email,
    a.phone,
    a.commission_pct,
    a.status::text,
    a.payouts_held,

    -- Referred users: distinct users whose referred_by_affiliate_id = a.id
    COUNT(DISTINCT u.id)                                                                        AS referred_users,

    -- Commission buckets (cents)
    COALESCE(SUM(ac.commission_amount_cents) FILTER (WHERE ac.status = 'pending'),   0)::bigint AS waiting_cents,
    COALESCE(SUM(ac.commission_amount_cents) FILTER (WHERE ac.status = 'approved'),  0)::bigint AS ready_cents,
    COALESCE(SUM(ac.commission_amount_cents) FILTER (WHERE ac.status = 'paid'),      0)::bigint AS paid_cents,
    COALESCE(SUM(ac.commission_amount_cents) FILTER (WHERE ac.status = 'reversed'),  0)::bigint AS reversed_cents,

    -- Last payout: most recent paid commission date (proxy for last payout timestamp)
    MAX(ac.updated_at) FILTER (WHERE ac.status = 'paid')                                        AS last_payout_at

  FROM public.affiliates          AS a
  LEFT JOIN public.users          AS u  ON u.referred_by_affiliate_id = a.id
  LEFT JOIN public.affiliate_commissions AS ac ON ac.affiliate_id = a.id

  GROUP BY
    a.id,
    a.affiliate_number,
    a.name,
    a.email,
    a.phone,
    a.commission_pct,
    a.status,
    a.payouts_held

  ORDER BY a.affiliate_number;
$$;

-- Grant to authenticated users so the super-admin client can call it.
-- RLS on affiliates already restricts who can read what; the function
-- uses SECURITY DEFINER to bypass row-level security on the aggregation
-- side (same pattern as other admin RPCs in this project).
REVOKE ALL ON FUNCTION public.affiliate_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.affiliate_summary() TO authenticated;


-- ── 2. assign_affiliate_to_user() ────────────────────────────────────────────
-- Sets (or clears) referred_by_affiliate_id on a user row.
-- p_affiliate_id = NULL removes the assignment.
-- Uses SECURITY DEFINER so the super-admin call bypasses RLS.

CREATE OR REPLACE FUNCTION public.assign_affiliate_to_user(
  p_user_id      uuid,
  p_affiliate_id uuid
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.users
  SET    referred_by_affiliate_id = p_affiliate_id
  WHERE  users.id = p_user_id;
$$;

REVOKE ALL ON FUNCTION public.assign_affiliate_to_user(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_affiliate_to_user(uuid, uuid) TO authenticated;
