-- 105_reports_admin_update
-- Reconciliación de drift: aplicada en producción por una task bajo "102_reports_admin_update"
-- (schema_migrations v20260725212912); archivo nunca commiteado. Renumerada a 105 (colisión con
-- 102_pinned_messages) e idempotente. dismiss-report necesita que un platform admin cambie solo status.
drop policy if exists "admin update reports" on public.reports;
create policy "admin update reports" on public.reports for update to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

grant update (status) on public.reports to authenticated;
