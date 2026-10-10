-- 218: la purga de 24 h del chat del local ya no borra la evidencia de mensajes reportados. APLICADA 2026-10-10.
-- Aplicada por Juan desde el SQL Editor (contiene un DELETE dentro de la función de purga), así que NO está registrada en
-- supabase_migrations.schema_migrations. Versionada tal cual estaba en pending/: purge_expired_messages() y message_under_retention_hold()
-- se compararon con pg_get_functiondef de producción y coinciden.
--
-- Problema
--   purge_expired_messages() (pg_cron 'purge-expired-messages', cada 15 min, migración 043) borra los mensajes de sala de más de 24 h
--   y, a mejor esfuerzo, sus fotos de post-media, TENGAN O NO reportes. Un mensaje reportado (p. ej. por material de abuso sexual
--   infantil) desaparece antes de que alguien lo revise y se pierde la evidencia; la ley de EE. UU. exige conservar 1 año el material
--   reportado a NCMEC. (Los pinned_messages ya se salvaban de la purga; los reportados no.)
--
-- Qué hace
--   1. Nueva función interna message_under_retention_hold(message_id) → true si el mensaje tiene un reporte (reports.content_type =
--      'message' y content_id = id del mensaje) que:
--        a) está en status 'pending' (mientras nadie lo resuelva, el mensaje se conserva), o
--        b) tiene motivo child_safety / sexual_content, o resolution 'escalated_ncmec', y su reports.created_at tiene menos de 365 días.
--      El motivo se normaliza como lo hace el trigger reports_set_priority (minúsculas, sin el sufijo tras ':'); por la misma razón
--      se incluye el motivo heredado 'minor', que ese trigger también trata como urgente.
--   2. purge_expired_messages() se reescribe (create or replace) con la MISMA lógica de antes, más esa condición en los dos pasos:
--      NO borra el archivo de post-media NI la fila del mensaje si message_under_retention_hold(id). Al pasar los 365 días (y sin
--      reporte pendiente) el mensaje vuelve a ser purgable en el siguiente ciclo.
--   3. Los mensajes conservados siguen invisibles si están ocultos (hidden_at): no se toca ninguna política ni columna.
--
-- Qué NO cubre (ver el informe de la rama)
--   · DMs: no existe ninguna purga por TTL de dm_messages ni de objetos de dm-media. Las filas de dm_messages SÍ se borran por cascada
--     cuando se elimina una conversación efímera de Match (match_wipe_user_venue / match_remove_pair) o la cuenta de la persona;
--     los archivos de dm-media quedan en Storage y la copia del reporte (reports.snapshot) conserva texto y ruta. No se ha cambiado.
--   · Borrado de cuenta (delete-account / cleanup_anonymous_users): messages.user_id → SET NULL conserva el mensaje, pero no se revisó
--     la retención de otras tablas.
--
-- Cómo probarlo (todo dentro de una transacción que se deshace; no usa el motivo child_safety para no disparar safety-alert):
--   begin;
--   create temp table _t (label text, id uuid);
--   with ins as (
--     insert into public.messages (room_id, user_id, body, created_at)
--     select (select id from public.rooms limit 1), (select id from public.users limit 1), l, now() - interval '3 days'
--     from unnest(array['sin_reporte','pendiente','sexual_reciente','sexual_vieja','ncmec','descartado','sin_accion']) as l
--     returning id, body)
--   insert into _t select body, id from ins;
--   insert into public.reports (reporter_id, content_type, content_id, reason, status, resolution, created_at)
--   select null, 'message', t.id, v.reason, v.status, v.resolution, now() - v.age
--   from _t t join (values
--     ('pendiente',       'spam',           'pending',   null,              interval '1 day'),
--     ('sexual_reciente', 'sexual_content', 'resolved',  'content_removed', interval '30 days'),
--     ('sexual_vieja',    'sexual_content', 'resolved',  'content_removed', interval '400 days'),
--     ('ncmec',           'spam',           'resolved',  'escalated_ncmec', interval '100 days'),
--     ('descartado',      'spam',           'dismissed', 'dismissed',       interval '5 days'),
--     ('sin_accion',      'spam',           'resolved',  'no_action',       interval '5 days')
--   ) as v(label, reason, status, resolution, age) on v.label = t.label;
--   select public.purge_expired_messages();
--   select t.label, exists (select 1 from public.messages m where m.id = t.id) as sigue from _t t order by 1;
--   -- esperado: pendiente, sexual_reciente y ncmec = true (se conservan); sin_reporte, sexual_vieja, descartado y sin_accion = false
--   rollback;
--   (La purga corre también sobre los mensajes reales vencidos dentro de la transacción, pero el rollback lo deshace todo.)
--
-- Rollback (la definición anterior COMPLETA de purge_expired_messages, leída de producción el 2026-10-10, y quitar la función nueva):
--   create or replace function public.purge_expired_messages()
--    returns void
--    language plpgsql
--    security definer
--    set search_path to 'public'
--   as $function$
--   declare
--     v_media_count int := -1;  -- -1 = storage cleanup skipped
--     v_msg_count   int;
--   begin
--     -- 1. Best-effort photo cleanup (Option C — deferred). Supabase blocks direct
--     --    DELETE FROM storage.objects (protect_delete trigger), so wrap it: if it
--     --    raises, log and continue — the message purge below must always run.
--     --    Orphaned post-media binaries (unreferenced) remain until a future
--     --    Storage-API mechanism cleans them.
--     begin
--       delete from storage.objects
--       where bucket_id = 'post-media'
--         and name in (
--           select substring(m.media_url from '/post-media/(.+)$')
--           from public.messages m
--           where m.created_at < now() - interval '24 hours'
--             and m.media_url is not null
--             and m.media_url like '%/post-media/%'
--             and m.id not in (select pm.message_id from public.pinned_messages pm)
--         );
--       get diagnostics v_media_count = row_count;
--     exception when others then
--       raise log '[purge_expired_messages] storage cleanup skipped: %', sqlerrm;
--       v_media_count := -1;
--     end;
--
--     -- 2. Purge expired message rows (except pinned). reply_to → SET NULL.
--     delete from public.messages
--     where created_at < now() - interval '24 hours'
--       and id not in (select message_id from public.pinned_messages);
--     get diagnostics v_msg_count = row_count;
--
--     raise log '[purge_expired_messages] deleted % messages, % media objects (-1 = storage skipped)',
--       v_msg_count, v_media_count;
--   end;
--   $function$;
--   drop function public.message_under_retention_hold(uuid);

-- 1. ¿Está el mensaje bajo retención por un reporte?
create or replace function public.message_under_retention_hold(p_message_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.reports r
    where r.content_type = 'message'
      and r.content_id = p_message_id
      and (
        r.status = 'pending'
        or (
          (lower(split_part(coalesce(r.reason, ''), ':', 1)) in ('child_safety', 'minor', 'sexual_content')
            or r.resolution = 'escalated_ncmec')
          and r.created_at > now() - interval '365 days'
        )
      )
  );
$$;
revoke all on function public.message_under_retention_hold(uuid) from public, anon, authenticated;

-- 2. Purga TTL 24 h (misma lógica que la 043 y que producción) sin tocar los mensajes con reporte que deben conservarse
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
$$;
