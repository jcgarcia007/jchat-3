-- 071: close the table_tabs INSERT hole (privacy). Follow-up to 070.
--
-- BUG: the 070 INSERT policy allowed a customer branch —
--   (kind='customer' AND owner_uid = auth.uid())
-- with NO check on table_id. Any authenticated user (including an anonymous
-- one) could insert a 'customer' tap on ANY table. That instantly makes
-- user_has_tab_at_table() true for them, which the SELECT policy trusts — so
-- they'd self-grant read access to EVERY tab of that table (names now; orders
-- and totals in B2). That breaks the privacy rule in docs/MESAS_Y_TAPS.md:
-- only participants/waiter/owner may see a table's tabs.
--
-- FIX: INSERT from the client is allowed ONLY for the assigned waiter. Customer
-- taps are created EXCLUSIVELY server-side (service_role) when the payment is
-- confirmed in B3 — the model says "the order enters the table when it's paid",
-- and payment is server-side. service_role bypasses RLS, so it needs no policy.
--
-- SELECT/UPDATE/DELETE on table_tabs and all of table_waiters are unchanged.
-- The SECURITY DEFINER helpers are untouched → still no recursion.

begin;

drop policy if exists "table_tabs: create own or as waiter" on public.table_tabs;

create policy "table_tabs: waiter insert only"
  on public.table_tabs for insert to authenticated
  with check (
    kind = 'waiter'
    and created_by = auth.uid()
    and public.is_waiter_of_table(table_id)
  );

commit;
