-- 051: remove the client-side INSERT on order_items.
-- A customer could insert extra items into their OWN (already paid) order — the kitchen
-- (KDS) would prepare them for free. Orders are created by the stripe-webhook using
-- service_role, which bypasses RLS, so no client insert is needed.
-- (orders already has no INSERT policy — see 033_orders_insert_service_role_only.sql.)
drop policy if exists "order_items: insert via order" on public.order_items;
