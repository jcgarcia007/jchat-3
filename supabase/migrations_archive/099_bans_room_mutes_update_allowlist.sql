-- 099_bans_room_mutes_update_allowlist
-- D-54 Batch 2 (B1 stragglers). Tras el commit d61fd96 (banUser/muteInRoom usan UPDATE...WHERE + INSERT
-- fallback, keys en WHERE), el UPDATE de authenticated solo necesita las columnas de negocio. Restringir a esas;
-- room_id/user_id/business_id/id/created_at quedan bloqueadas.
revoke update on public.bans from authenticated;
grant update (banned_by, reason) on public.bans to authenticated;

revoke update on public.room_mutes from authenticated;
grant update (muted_by, expires_at) on public.room_mutes to authenticated;
