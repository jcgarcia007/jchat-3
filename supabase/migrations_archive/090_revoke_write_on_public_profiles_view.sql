-- 090_revoke_write_on_public_profiles_view
-- public_profiles es una vista auto-actualizable sobre users, dueño postgres (bypassrls),
-- sin security_invoker. Un grant de escritura a anon/authenticated permite escribir a users
-- saltándose su RLS. Verificado (Supabase MCP, 2026-07-25) que la app NUNCA escribe por la
-- vista (lee de ella; escribe a users por la tabla base con el allow-list de migr 066).
-- Revocar la escritura cierra el vector. NO se toca SELECT ni security_invoker (D-15: la vista
-- es SECURITY DEFINER by-design para el descubrimiento social; cambiarlo lo rompería).
revoke insert, update, delete on public.public_profiles from anon;
revoke insert, update, delete on public.public_profiles from authenticated;
