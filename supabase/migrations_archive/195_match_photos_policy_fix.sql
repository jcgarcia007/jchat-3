-- 195: corrige la política de match_photos: reordenar fotos ya aprobadas fallaba porque el WITH CHECK
-- exigía status='pending' también en UPDATE. Se separan insertar / editar / borrar / leer propias.
-- El estado y los campos de moderación siguen protegidos por el trigger match_photos_guard (193).
-- APLICADA EN PRODUCCIÓN POR PLANNING (2026-10-04). Este archivo solo la versiona.

drop policy if exists match_photos_own on public.match_photos;

create policy match_photos_own_select on public.match_photos for select to authenticated
  using (user_id = auth.uid());

create policy match_photos_own_insert on public.match_photos for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending' and path like auth.uid()::text || '/%');

create policy match_photos_own_update on public.match_photos for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy match_photos_own_delete on public.match_photos for delete to authenticated
  using (user_id = auth.uid());
