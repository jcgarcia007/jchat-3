-- 098_social_revoke_update_append_tables
-- D-54 Batch 2 (Grupo B1): tablas append/insert-delete del bloque social. Revocar UPDATE sin
-- re-grant. INSERT/DELETE intactos. Verificado por grep global + políticas por Supabase MCP (2026-07-25).
--
-- Se aplican SOLO las 4 tablas cuyo código NO hace ningún UPDATE de authenticated:
--   blocks (solo SELECT en la app), post_likes (insert/delete), stock_movements (ledger, insert),
--   stories (select/insert; el upsert de stories.ts es a story_views, no a stories).
--
-- EXCLUIDAS a propósito (NO revocar aquí — necesitan allow-list, reportadas al autor):
--   bans      → moderation.ts banUser() hace .upsert(onConflict room_id,user_id): el re-ban toma
--               la rama ON CONFLICT DO UPDATE (columnas banned_by, reason). Política bans_owner_write
--               [ALL authenticated] la permite → es un UPDATE que HOY funciona. Revocar lo rompería.
--   room_mutes → moderation.ts muteUser() hace .upsert(onConflict room_id,user_id) para "refrescar la
--               expiración" (UPDATE de muted_by, expires_at). Política room_mutes_owner_write [ALL] la
--               permite → UPDATE que HOY funciona. Va en una migración de allow-list aparte.
revoke update on public.blocks from authenticated;
revoke update on public.post_likes from authenticated;
revoke update on public.stock_movements from authenticated;
revoke update on public.stories from authenticated;
