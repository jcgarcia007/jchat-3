-- 054: business_verifications is READ-ONLY for the owner (security audit 2026-07-12, FIX #3).
-- The original biz_verif_owner policy (migration 004) was cmd=ALL for authenticated, so
-- an owner could INSERT/UPDATE their OWN verification row from the client
-- (sms_verified=true, identity_status='approved'). The SUBJECT of a verification must
-- not control it. Owners keep SELECT (to see their status); all writes go through the
-- service-role-backed /api/verify route (FIX #1) or a super_admin. The
-- "admin read all verifications" policy is left intact.
drop policy if exists "biz_verif_owner" on public.business_verifications;

create policy "biz_verif_owner_read" on public.business_verifications
  for select to authenticated
  using (
    exists (
      select 1 from public.businesses b
      where b.id = business_verifications.business_id
        and b.owner_id = auth.uid()
    )
  );
