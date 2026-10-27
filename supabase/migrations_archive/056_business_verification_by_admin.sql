-- 056: manual super-admin business verification (2026-07-12).
-- FIX #1 (commit f4aa2ac) correctly removed the owner's ability to self-approve, but
-- left NO path to businesses.status='verified' (the flag that enables payments). This
-- adds the chosen solution (option A): manual approval by a platform admin.
--
-- NOTE: a separate admin_set_business_status(uuid, text) RPC already exists (used by the
-- /super-admin/verification queue). This adds a purpose-built verification RPC with
-- provenance tracking (verified_by/verified_at) for the /dashboard/admin flow.

-- a) Provenance columns ------------------------------------------------------------
alter table public.businesses
  add column if not exists verified_by uuid references auth.users(id),
  add column if not exists verified_at timestamptz;

comment on column public.businesses.verified_by is
  'Platform admin (auth.users.id) who manually approved this business. NULL for LEGACY '
  'rows: status=''verified'' was set by the pre-2026-07 /api/verify bug (self-approval), '
  'so their provenance is NOT trustworthy. A real approval always stamps verified_by + '
  'verified_at via admin_set_business_verification().';
comment on column public.businesses.verified_at is
  'When a platform admin approved this business. NULL = never manually approved (see verified_by).';

-- b) Approval RPC ------------------------------------------------------------------
-- The is_platform_admin() gate is the ENTIRE point: without it any authenticated user
-- could flip their own status='verified' and enable payments (the original hole).
create or replace function public.admin_set_business_verification(
  p_business_id uuid,
  p_approve boolean
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;

  if p_approve then
    update public.businesses
      set status = 'verified', verified_by = auth.uid(), verified_at = now()
      where id = p_business_id;
  else
    -- Revoke: back to the unverified default (a valid businesses.status value; there is
    -- no CHECK constraint, and admin_set_business_status accepts 'pending_verification').
    -- Clears provenance so the row reads as never-approved.
    update public.businesses
      set status = 'pending_verification', verified_by = null, verified_at = null
      where id = p_business_id;
  end if;
end;
$$;

-- Only authenticated may call it; the real gate is is_platform_admin() inside.
revoke execute on function public.admin_set_business_verification(uuid, boolean) from public;
grant execute on function public.admin_set_business_verification(uuid, boolean) to authenticated;
