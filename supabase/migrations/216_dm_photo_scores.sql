-- 216: scores de SafeSearch de las fotos de DM (Lote D2-D) — APLICADA 2026-10-09
-- Versionada tal cual está en producción (supabase_migrations.schema_migrations, versión 20261009233340).
--
-- Qué hace
--   1. dm_messages.media_moderation_scores (jsonb): los scores de Vision que decidieron el veredicto, también en 'clear'.
--   2. dm_messages_media_guard(): un cliente tampoco puede tocar media_moderation_scores (solo service_role / servidor).
--   3. dm_photo_set_verdict(): guarda p_scores en la fila al fijar el veredicto (una sola vez, solo sobre 'pending').
--
-- Rollback (comentado; ver la regla de migraciones en AGENTS.md):
--   restaurar dm_messages_media_guard() y dm_photo_set_verdict() de la 214 con create or replace;
--   alter table public.dm_messages drop column media_moderation_scores;

alter table public.dm_messages add column if not exists media_moderation_scores jsonb;

create or replace function public.dm_messages_media_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null
     and (new.media_moderation is distinct from old.media_moderation
          or new.media_moderated_at is distinct from old.media_moderated_at
          or new.media_moderation_scores is distinct from old.media_moderation_scores
          or new.media_url is distinct from old.media_url) then
    raise exception 'dm_media_fields_readonly' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.dm_photo_set_verdict(p_message_id uuid, p_status text, p_scores jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_sender uuid; v_conv uuid; v_created timestamptz;
begin
  if p_status not in ('clear', 'blurred', 'rejected') then raise exception 'invalid_status' using errcode = '22023'; end if;
  update public.dm_messages
     set media_moderation = p_status, media_moderated_at = now(), media_moderation_scores = p_scores
   where id = p_message_id and media_moderation = 'pending'
   returning sender_id, conversation_id, created_at into v_sender, v_conv, v_created;
  if not found then return; end if;

  if p_status = 'rejected' then
    insert into public.reports (reporter_id, reported_user_id, content_type, content_id, reason, details, snapshot, priority, status)
    values (null, v_sender, 'dm_message', p_message_id, 'sexual_content',
            'Automatic report: explicit photo detected in a direct message.',
            jsonb_build_object('conversation_id', v_conv, 'created_at', v_created,
                               'media', 'dm-media (private bucket; no public URL is stored here)', 'scores', p_scores),
            'urgent', 'pending');
    insert into public.security_logs (actor_id, action, target_type, target_id, detail)
    values (null, 'dm_photo_rejected', 'dm_message', p_message_id, 'SafeSearch: explicit adult content');
  end if;
end;
$$;
revoke all on function public.dm_photo_set_verdict(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.dm_photo_set_verdict(uuid, text, jsonb) to service_role;

notify pgrst, 'reload schema';
