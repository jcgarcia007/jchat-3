-- 102_pinned_messages_update_allowlist
-- D-54 Batch 2 (última de grants). Tras cfaa63d (PinMessageSheet usa UPDATE...WHERE(room_id,message_id) +
-- INSERT fallback, keys en WHERE), el UPDATE de authenticated solo necesita las columnas de negocio.
revoke update on public.pinned_messages from authenticated;
grant update (pinned_by, expires_at, notify) on public.pinned_messages to authenticated;
