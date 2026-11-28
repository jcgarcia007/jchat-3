-- ROLLBACK de 278_chat_media_purge_offers (destructivo: borra la cola, las funciones nuevas, el trigger de ofertas y el cron). Juan lo aplica a mano en el SQL Editor.
-- Restaura el cuerpo de producción de purge_expired_messages() tal como estaba el 2026-11-27 (con el paso de Storage que Supabase bloquea).
-- NO revierte la parte C (cuentas 'acct_STUB_…' puestas a NULL): ese valor falso no se guardó en ningún sitio. NO recupera archivos ya borrados de Storage.
-- Si queda gente en la cola, los archivos de esas filas se quedan en Storage (como antes de la 278).

select cron.unschedule('chat-media-purge') where exists (select 1 from cron.job where jobname = 'chat-media-purge');

drop trigger if exists offers_sync_is_active on public.offers;
drop function if exists public.offers_sync_is_active();

drop function if exists public.chat_media_backlog_enqueue();
drop function if exists public.chat_media_backlog_preview();
drop function if exists public.chat_media_backlog_candidates();
drop function if exists public.chat_media_purge_retry();
drop function if exists public.chat_media_paths_in_use(text, text[]);
drop function if exists public.chat_message_media_object(text, text);

create or replace function public.purge_expired_messages() returns void
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_media_count int := -1;  -- -1 = storage cleanup skipped
  v_msg_count   int;
begin
  -- 1. Best-effort photo cleanup (Option C — deferred). Supabase blocks direct
  --    DELETE FROM storage.objects (protect_delete trigger), so wrap it: if it
  --    raises, log and continue — the message purge below must always run.
  --    Orphaned post-media binaries (unreferenced) remain until a future
  --    Storage-API mechanism cleans them.
  --    Evidence hold: a message with a pending report, or a child-safety / sexual-content /
  --    NCMEC-escalated report younger than 365 days, keeps its file (message_under_retention_hold).
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
          and not public.message_under_retention_hold(m.id)
      );
    get diagnostics v_media_count = row_count;
  exception when others then
    raise log '[purge_expired_messages] storage cleanup skipped: %', sqlerrm;
    v_media_count := -1;
  end;

  -- 2. Purge expired message rows (except pinned and the ones under an evidence hold). reply_to → SET NULL.
  delete from public.messages
  where created_at < now() - interval '24 hours'
    and id not in (select message_id from public.pinned_messages)
    and not public.message_under_retention_hold(id);
  get diagnostics v_msg_count = row_count;

  raise log '[purge_expired_messages] deleted % messages, % media objects (-1 = storage skipped)',
    v_msg_count, v_media_count;
end;
$function$;

drop table if exists public.chat_media_purge_queue;
