-- ============================================================
-- JChat 3.0 — Chat Fase 2: purga TTL 24h de mensajes de sala
-- Ref: docs/DIAGNOSTICO_TTL_CHAT.md. Los mensajes de sala son efímeros: se borran
-- 24h tras SU created_at. Los DMs NO tienen TTL (Fase D). Los mensajes anclados
-- (pinned_messages) SOBREVIVEN → se excluyen de la purga.
--
-- Bucket post-media es EXCLUSIVO del chat efímero (perfil/posts → profile-media,
-- DMs → dm-media). Mecanismo: pg_cron + función SQL pura (sin Edge Function, sin pg_net).
--
-- ⚠️ FOTOS — DIFERIDO (decisión "Option C", 2026-07-08): Supabase bloquea el
--    DELETE directo sobre storage.objects (trigger storage.protect_delete →
--    "Use the Storage API instead"). El borrado de objetos se deja como
--    best-effort dentro de un bloque EXCEPTION: si el trigger lo bloquea, se
--    registra en el log y se CONTINÚA con la purga de filas (que es lo que
--    importa). Los binarios huérfanos de post-media (ya sin fila que los
--    referencie) quedan hasta que se implemente una limpieza vía Storage API.
--
-- Facts verificados en vivo (2026-07-08):
--   pinned_messages.message_id: NOT NULL, FK → messages ON DELETE CASCADE (excluido).
--   messages.reply_to: FK → messages ON DELETE SET NULL (las respuestas sobreviven).
--   media_url http: https://<ref>.../storage/v1/object/public/post-media/{uid}/{ts}.{ext}
--     → substring(... from '/post-media/(.+)$') = {uid}/{ts}.{ext} = storage.objects.name.
-- ============================================================

-- ---------- Paso 1: habilitar pg_cron ----------
create extension if not exists pg_cron;

-- ---------- Paso 2: función de purga ----------
create or replace function public.purge_expired_messages()
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_media_count int := -1;  -- -1 = storage cleanup skipped
  v_msg_count   int;
begin
  -- 1. Best-effort photo cleanup (Option C — diferido). Supabase bloquea el
  --    DELETE directo sobre storage.objects (trigger protect_delete). Se envuelve
  --    en un bloque EXCEPTION: si falla, se loguea y se continúa — la purga de
  --    mensajes de abajo SIEMPRE debe correr. Borra EXACTAMENTE los objetos cuyo
  --    path sale del media_url expirado (nunca por carpeta de usuario).
  begin
    delete from storage.objects
    where bucket_id = 'post-media'
      and name in (
        select substring(m.media_url from '/post-media/(.+)$')
        from public.messages m
        where m.created_at < now() - interval '24 hours'
          and m.media_url is not null
          and m.media_url like '%/post-media/%'
          and m.id not in (select pm.message_id from public.pinned_messages pm)
      );
    get diagnostics v_media_count = row_count;
  exception when others then
    raise log '[purge_expired_messages] storage cleanup skipped: %', sqlerrm;
    v_media_count := -1;
  end;

  -- 2. Purga de filas expiradas (excepto ancladas). reply_to → SET NULL.
  delete from public.messages
  where created_at < now() - interval '24 hours'
    and id not in (select message_id from public.pinned_messages);
  get diagnostics v_msg_count = row_count;

  raise log '[purge_expired_messages] deleted % messages, % media objects (-1 = storage skipped)',
    v_msg_count, v_media_count;
end;
$$;

-- ---------- Paso 3: programar el job (cada 15 min) ----------
select cron.schedule(
  'purge-expired-messages',
  '*/15 * * * *',
  $$select public.purge_expired_messages()$$
);
