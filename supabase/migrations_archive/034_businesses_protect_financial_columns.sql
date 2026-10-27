-- 034 — FIX #2 (P0-3): protect financial/authority columns on businesses + admin RPC.
-- NOTE: the column-level REVOKE below is a NO-OP on its own because a table-level
-- UPDATE grant implies all columns — it is corrected in migration 036. The RPC
-- created here is the real deliverable of this file and IS effective.
-- Protected columns change only via service_role Edge Functions:
--   plan → subscriptions webhook · stripe_account_id → stripe-connect · status → /api/verify.

revoke update (plan, tax_rate, stripe_account_id, status, owner_id)
  on public.businesses from authenticated, anon;

-- Super-admin path to change business status (client UPDATE on status is removed).
create or replace function public.admin_set_business_status(p_business_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;
  if p_status not in ('pending_verification','verified','rejected','active','suspended','closed') then
    raise exception 'invalid status: %', p_status;
  end if;
  update public.businesses set status = p_status where id = p_business_id;
end;
$$;

revoke execute on function public.admin_set_business_status(uuid, text) from public, anon;
grant execute on function public.admin_set_business_status(uuid, text) to authenticated;
