-- 103_room_access_attempts_lockdown
-- El lockout de contraseña de sala lo gobierna SOLO la RPC verify_room_password (SECURITY DEFINER, owner
-- postgres → ignora RLS/grants). Tras 9cacf79 el cliente ya no escribe la tabla; getLockState solo la LEE.
-- Cerrar la puerta de atrás (el lockout era auto-reseteable por PostgREST crudo): revocar escritura a
-- authenticated y dejar la política en SELECT-only (leer la propia fila). La RPC definer no se ve afectada.
revoke insert, update, delete on public.room_access_attempts from authenticated;

drop policy if exists "room_access_attempts_own" on public.room_access_attempts;

create policy "room_access_attempts: select own"
  on public.room_access_attempts
  for select
  to authenticated
  using (user_id = auth.uid());
