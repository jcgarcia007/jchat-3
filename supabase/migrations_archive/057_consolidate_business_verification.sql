-- 057: consolidate business verification onto ONE RPC (2026-07-12).
-- Migration 056 introduced admin_set_business_verification(uuid, boolean) not knowing
-- admin_set_business_status(uuid, text) already existed and was in use. Keep the
-- general one, move the provenance stamping into it, lock it down, drop the duplicate.

-- 1. admin_set_business_status: add verified_by/verified_at stamping.
--    CREATE OR REPLACE preserves existing grants; the REVOKE/GRANT below is applied
--    explicitly regardless (FIX A: a GRANT without a REVOKE leaves anon with the
--    PUBLIC default — the SECURITY DEFINER-callable-by-anon class we cleaned in the
--    audit's FIX #4).
create or replace function public.admin_set_business_status(p_business_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;
  if p_status not in ('pending_verification','verified','rejected','active','suspended','closed') then
    raise exception 'invalid status: %', p_status;
  end if;

  if p_status = 'verified' then
    -- Stamp who approved and when — this is what marks a REAL approval (vs LEGACY
    -- rows left verified with verified_by NULL by the old /api/verify bug).
    update public.businesses
      set status = p_status, verified_by = auth.uid(), verified_at = now()
      where id = p_business_id;
  else
    -- Leaving 'verified' clears provenance: a non-verified business has no approver.
    update public.businesses
      set status = p_status, verified_by = null, verified_at = null
      where id = p_business_id;
  end if;
end;
$$;

-- Lock down EXECUTE. Rule: admin RPCs REVOKE from public+anon, then GRANT to
-- authenticated (the real gate is is_platform_admin() inside).
revoke execute on function public.admin_set_business_status(uuid, text) from public, anon;
grant execute on function public.admin_set_business_status(uuid, text) to authenticated;

-- 2. Drop the duplicate RPC from migration 056 (also removes its anon EXECUTE — FIX A).
drop function if exists public.admin_set_business_verification(uuid, boolean);
