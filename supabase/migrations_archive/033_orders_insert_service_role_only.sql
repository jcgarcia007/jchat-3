-- 033 — FIX #1 (P0-2): only service_role (the Stripe webhook) may create orders.
-- The real payment flow creates orders in stripe-webhook with service_role, which
-- is NOT subject to these grants. The only client-side insert was a demo-only path.
-- Order status UPDATE (KDS/staff) is a separate policy and is NOT touched here.

drop policy if exists "orders: customer insert" on public.orders;

revoke insert on public.orders from authenticated, anon;
revoke insert on public.order_items from authenticated, anon;
