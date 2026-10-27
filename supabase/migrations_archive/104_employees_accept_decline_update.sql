-- 104_employees_accept_decline_update
-- Reconciliación de drift: aplicada en producción por una task bajo el nombre
-- "101_employees_accept_decline_update" (schema_migrations v20260725212317); su archivo nunca se commiteó.
-- Renumerada a 104 (colisión con 101_social_b3) e idempotente. La migr 097 revocó el grant UPDATE de
-- employees; acceptInvite/declineInvite necesitan que el invitado toque SOLO status en su propia fila.
drop policy if exists "employees: invited user update own status" on public.employees;
create policy "employees: invited user update own status"
  on public.employees
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant update (status) on public.employees to authenticated;
