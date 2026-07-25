-- 091_custom_roles_update_allowlist
-- D-54 Batch 2 (tabla 1): custom_roles tenía UPDATE de tabla completa a authenticated (6 cols).
-- La app (web/app/dashboard/roles/page.tsx, handleSave) solo actualiza name, permissions y
-- base_template. Restringir el grant de UPDATE a esas 3 columnas → id, business_id y created_at
-- dejan de ser escribibles por PostgREST. La RLS (política "custom_roles: owner update",
-- USING+WITH CHECK = dueño del negocio) ya limita las filas afectadas.
revoke update on public.custom_roles from authenticated;
grant update (name, permissions, base_template) on public.custom_roles to authenticated;
