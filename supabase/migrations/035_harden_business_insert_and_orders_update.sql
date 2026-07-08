-- 035 — Hardening.
-- 1) A client registering a business cannot self-grant verified/pro. register always
--    sends status='pending_verification' and plan='free', so this WITH CHECK does not
--    break it. stripe_account_id is NOT constrained (the register wizard may connect Stripe).
drop policy if exists "businesses: owner insert" on public.businesses;
create policy "businesses: owner insert" on public.businesses
  for insert to authenticated
  with check (
    auth.uid() = owner_id
    and status = 'pending_verification'
    and plan = 'free'
  );

-- 2) Customers cannot modify their orders (amounts/status). The customer never updates
--    orders in the app; the only legitimate UPDATE is the business owner via the KDS.
--    Restrict UPDATE to the owner (with matching WITH CHECK).
drop policy if exists "orders: business owner or customer update" on public.orders;
create policy "orders: business owner update" on public.orders
  for update to authenticated
  using (
    exists (select 1 from public.businesses b
            where b.id = orders.business_id and b.owner_id = auth.uid())
  )
  with check (
    exists (select 1 from public.businesses b
            where b.id = orders.business_id and b.owner_id = auth.uid())
  );
