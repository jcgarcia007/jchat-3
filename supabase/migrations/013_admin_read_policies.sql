-- ============================================================
-- JChat 3.0 — Platform admin read access (Super Admin panel)
-- Lets users with an admin_roles row (or users.role='super_admin') read the
-- admin-only tables across ALL businesses (verification queue, metrics, etc.).
-- Uses a SECURITY DEFINER helper to avoid RLS recursion on admin_roles.
-- ============================================================

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (select 1 from public.admin_roles ar where ar.user_id = auth.uid())
    or exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.role = 'super_admin'
    );
$$;

-- Read-all policies for admins (permissive — added alongside existing owner policies).
create policy "admin read all verifications" on public.business_verifications
  for select to authenticated using (public.is_platform_admin());

create policy "admin read all subscriptions" on public.subscriptions
  for select to authenticated using (public.is_platform_admin());

create policy "admin read security logs" on public.security_logs
  for select to authenticated using (public.is_platform_admin());

create policy "admin read reports" on public.reports
  for select to authenticated using (public.is_platform_admin());

-- admin_roles: an admin can read all rows; everyone can read their own.
create policy "admin read admin_roles" on public.admin_roles
  for select to authenticated
  using (public.is_platform_admin() or user_id = auth.uid());

create policy "admin read announcements" on public.announcements
  for select to authenticated using (public.is_platform_admin());
