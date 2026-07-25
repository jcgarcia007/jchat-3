-- 100_social_b2_update_allowlists
-- D-54 Batch 2 (B2): allow-lists de una columna en el bloque social. Verificado por MCP + grep global (.update/.upsert).
--
-- OMITIDA a propósito: comments. El allow-list propuesto era (body), pero no existe NINGÚN .update()
-- ni .upsert() sobre comments en todo el repo — no hay función de editar comentario, solo addComment
-- (insert) y getComments (select). Aplicar grant update (body) concedería un permiso que la app nunca
-- usa. Se deja sin tocar (ni revoke ni grant) para que el autor decida; reportado aparte.
revoke update on public.notifications from authenticated;
grant update (is_read) on public.notifications to authenticated;

revoke update on public.follow_requests from authenticated;
grant update (status) on public.follow_requests to authenticated;

revoke update on public.dm_messages from authenticated;
grant update (read_at) on public.dm_messages to authenticated;

revoke update on public.dm_conversations from authenticated;
grant update (last_message_at) on public.dm_conversations to authenticated;

revoke update on public.service_calls from authenticated;
grant update (status) on public.service_calls to authenticated;
