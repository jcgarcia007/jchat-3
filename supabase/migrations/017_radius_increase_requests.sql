-- ============================================================
-- JChat 3.0 — Radius increase requests
-- Owners can request a larger geofence radius than the default cap; a platform
-- admin approves/denies. Approval applies the new radius to the business (or
-- event) and notifies the owner.
-- ============================================================

create table if not exists public.radius_increase_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses(id) on delete cascade,
  event_id uuid references public.events(id) on delete cascade,
  requested_by uuid references public.users(id),
  current_radius_m integer,
  requested_radius_m integer,
  reason text not null,
  status text not null default 'pending', -- pending | approved | denied
  reviewed_by uuid references public.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.radius_increase_requests enable row level security;

create policy "rir owner insert" on public.radius_increase_requests
  for insert to authenticated
  with check (
    requested_by = auth.uid()
    and exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid())
  );

create policy "rir owner read" on public.radius_increase_requests
  for select to authenticated
  using (
    requested_by = auth.uid()
    or exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid())
    or public.is_platform_admin()
  );

create policy "rir admin update" on public.radius_increase_requests
  for update to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- Admins apply the approved radius to the business…
create policy "businesses admin update" on public.businesses
  for update to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- …and notify the owner of the decision.
create policy "notifications admin insert" on public.notifications
  for insert to authenticated
  with check (public.is_platform_admin());
