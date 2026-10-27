-- 053: explicit deny_all on pending_order_carts (security audit 2026-07-12, FIX #2).
-- RLS was ON but with ZERO policies — safe today only by ABSENCE (a future permissive
-- policy added by mistake would silently expose server-resolved cart prices, exactly
-- the class of bug that bit order_items in migration 051). Make the intent explicit.
-- The stripe webhook uses service_role (bypasses RLS) → nothing legitimate breaks.
create policy deny_all on public.pending_order_carts
  as permissive for all to anon, authenticated
  using (false) with check (false);
