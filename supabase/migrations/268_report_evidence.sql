-- JChat 3.0 — D7 (2026-11-08): la evidencia de un reporte sobrevive en archivos y DMs. NO APLICADA (la aplica Juan Carlos / el asistente por MCP; nunca `supabase db push`).
-- Spec aprobada: docs/handoff/SPEC_D7_evidencia_archivos.md (decisiones A, B y C aprobadas por Juan el 2026-11-08).
-- Reversión: supabase/rollbacks/268_report_evidence_rollback.sql · Pruebas locales: supabase/scripts/test_268_local.sh
-- Idempotente y no destructiva (CREATE OR REPLACE, IF NOT EXISTS, ON CONFLICT DO NOTHING).
--
-- Problema: con la 267 el REPORTE sobrevive al borrado de la cuenta, pero el ARCHIVO reportado (foto, audio) y los mensajes directos no
-- (la purga de Storage de delete-account borra todo; las purgas efímeras borran dm_conversations → dm_messages). La REPORT Act (18 U.S.C. 2258A(h))
-- exige conservar un año los contenidos del reporte.
--
-- Qué hace:
--   A. content_under_retention_hold(type, id): la misma regla que message_under_retention_hold, para cualquier content_type (user, post, comment, message,
--      dm_message, story). El hold: reporte pending, o motivo child_safety/minor/sexual_content o resolución escalated_ncmec con menos de 365 días desde la
--      resolución (coalesce(resolved_at, created_at)). Para 'user' el reporte no tiene content_id: se busca por reported_user_id.
--      message_under_retention_hold(id) pasa a ser un envoltorio con 'message'. report_in_hold(...) es la regla en una sola función.
--   B. reports.evidence jsonb (default '[]': {bucket, path, src_bucket, src_path, copied_at}) y reports.evidence_copied_at.
--   C. Bucket PRIVADO `report-evidence` (sin políticas: solo service_role).
--   D. user_held_evidence(p_user): service_role. Para cada reporte en hold cuyo reported_user_id = p_user, saca de `snapshot` los archivos
--      (media_url, media_urls, voice_url, avatar_url) y devuelve (report_id, content_type, src_bucket, src_path) SOLO si el objeto existe en storage.objects,
--      es de esa persona (el mismo criterio que storage_user_object_paths: lo que delete-account va a purgar) y aún no figura en reports.evidence.
--        · URL de Storage de este proyecto:  https://<ref>.supabase.co/storage/v1/object/(public|sign|authenticated)/<bucket>/<ruta>[?…]  → bucket y ruta.
--        · Ruta relativa (así guarda la app los archivos privados), el bucket sale del tipo: user→avatars · post→profile-media · story→story-media ·
--          dm_message (media_url y voice_url)→dm-media · message→voice-notes si empieza por «room/», si no post-media.
--        · Solo buckets de la lista (avatars, covers, profile-media, post-media, story-media, dm-media, voice-notes): nunca match-photos ni verification-selfies.
--        · Las rutas no se decodifican (%20): las de la app son ASCII (marca de tiempo + sufijo).
--   E. Purgas efímeras: venue_exits_purge, match_wipe_user_venue y match_remove_pair NO borran una conversación con algún dm_message en hold
--      (dm_conversation_has_held_message). match_wipe_user_venue_keep_dms no borra conversaciones (solo matches): sin cambio.
--   F. evidence_purge_queue(id, bucket, path, created_at, attempts, last_attempt_at, last_error) + retention_purge() encola las copias de los reportes que
--      va a borrar (cuerpo de la 267 + ese bloque) + evidence_purge_retry() (cron cada 10 min, patrón de outbound_emails_retry: vault push_webhook_secret,
--      50 por lote, backoff 10 min × 2^attempts con tope 6 h, 6 intentos; al llegar a 6 una fila security_logs 'evidence_purge_gave_up') que llama a la
--      edge function evidence-purge con {ids}.
--
-- Despliegue (Juan): 268 → `supabase functions deploy evidence-purge --no-verify-jwt`, `report-evidence`, `delete-account` → merge + push (web).

-- ───────── A. Hold por tipo ─────────
create or replace function public.report_in_hold(p_status text, p_reason text, p_resolution text, p_resolved_at timestamptz, p_created_at timestamptz)
returns boolean
language sql stable set search_path to 'public'
as $$
  select p_status = 'pending'
      or ((lower(split_part(coalesce(p_reason, ''), ':', 1)) in ('child_safety', 'minor', 'sexual_content') or p_resolution = 'escalated_ncmec')
          and coalesce(p_resolved_at, p_created_at) > now() - interval '365 days');
$$;

revoke all on function public.report_in_hold(text, text, text, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.report_in_hold(text, text, text, timestamptz, timestamptz) to service_role;

create or replace function public.content_under_retention_hold(p_type text, p_id uuid) returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select exists (
    select 1
    from public.reports r
    where r.content_type = p_type
      and (r.content_id = p_id or (p_type = 'user' and r.reported_user_id = p_id))
      and public.report_in_hold(r.status, r.reason, r.resolution, r.resolved_at, r.created_at)
  );
$$;

create or replace function public.message_under_retention_hold(p_message_id uuid) returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select public.content_under_retention_hold('message', p_message_id);
$$;

-- ¿alguna conversación con un mensaje directo en hold? (las purgas efímeras la dejan viva)
create or replace function public.dm_conversation_has_held_message(p_conversation_id uuid) returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select exists (
    select 1 from public.dm_messages d
    where d.conversation_id = p_conversation_id
      and public.content_under_retention_hold('dm_message', d.id)
  );
$$;

-- Solo las usan funciones SECURITY DEFINER y service_role: un cliente no debe poder preguntar qué contenido tiene un reporte en hold.
-- (message_under_retention_hold conserva los permisos que ya tenía.)
revoke all on function public.content_under_retention_hold(text, uuid) from public, anon, authenticated;
grant execute on function public.content_under_retention_hold(text, uuid) to service_role;
revoke all on function public.dm_conversation_has_held_message(uuid) from public, anon, authenticated;
grant execute on function public.dm_conversation_has_held_message(uuid) to service_role;

-- ───────── B. Columnas de evidencia ─────────
alter table public.reports add column if not exists evidence jsonb not null default '[]'::jsonb;
alter table public.reports add column if not exists evidence_copied_at timestamptz;

-- ───────── C. Bucket privado ─────────
insert into storage.buckets (id, name, public) values ('report-evidence', 'report-evidence', false) on conflict (id) do nothing;

-- ───────── D. Archivos en hold de una persona ─────────
create or replace function public.user_held_evidence(p_user uuid)
returns table (report_id uuid, content_type text, src_bucket text, src_path text)
language sql stable security definer set search_path = public, storage
as $$
  with held as (
    select r.id, r.content_type, r.snapshot, r.evidence
    from public.reports r
    where r.reported_user_id = p_user
      and r.snapshot is not null
      and public.report_in_hold(r.status, r.reason, r.resolution, r.resolved_at, r.created_at)
  ), refs as (
    select h.id, h.content_type, h.evidence, f.val
    from held h
    cross join lateral (
      select h.snapshot ->> 'media_url' as val
      union all select h.snapshot ->> 'voice_url'
      union all select h.snapshot ->> 'avatar_url'
      union all select e from jsonb_array_elements_text(
        case when jsonb_typeof(h.snapshot -> 'media_urls') = 'array' then h.snapshot -> 'media_urls' else '[]'::jsonb end) e
    ) f
    where f.val is not null and f.val <> ''
  ), parsed as (
    select refs.*, regexp_match(refs.val, '^https?://[^/]+/storage/v1/object/(?:public|sign|authenticated)/([^/?#]+)/([^?#]+)') as m
    from refs
  ), resolved as (
    select p.id, p.content_type, p.evidence,
           case when p.m is not null then p.m[1]
                when p.content_type = 'user' then 'avatars'
                when p.content_type = 'post' then 'profile-media'
                when p.content_type = 'story' then 'story-media'
                when p.content_type = 'dm_message' then 'dm-media'
                when p.content_type = 'message' then case when p.val like 'room/%' then 'voice-notes' else 'post-media' end
           end as b,
           case when p.m is not null then p.m[2] else p.val end as pth
    from parsed p
  )
  select distinct x.id, x.content_type, x.b, x.pth
  from resolved x
  where x.b in ('avatars', 'covers', 'profile-media', 'post-media', 'story-media', 'dm-media', 'voice-notes')
    and exists (select 1 from storage.objects o where o.bucket_id = x.b and o.name = x.pth)
    and exists (select 1 from public.storage_user_object_paths(p_user) s where s.bucket_id = x.b and s.name = x.pth)
    and not exists (select 1 from jsonb_array_elements(x.evidence) ev where ev ->> 'src_bucket' = x.b and ev ->> 'src_path' = x.pth)
  order by 1, 3, 4;
$$;

revoke all on function public.user_held_evidence(uuid) from public, anon, authenticated;
grant execute on function public.user_held_evidence(uuid) to service_role;

-- ───────── E. Purgas efímeras: una conversación con un mensaje en hold no se borra ─────────
create or replace function public.match_remove_pair(p_business_id uuid, p_u1 uuid, p_u2 uuid) returns void
language plpgsql security definer set search_path to 'public'
as $$
declare v_conv uuid;
begin
  delete from public.matches m where m.business_id = p_business_id and m.user_a = least(p_u1,p_u2) and m.user_b = greatest(p_u1,p_u2)
  returning m.conversation_id into v_conv;
  if v_conv is not null then
    delete from public.dm_conversations c where c.id = v_conv and c.ephemeral_business_id = p_business_id  -- las permanentes no se tocan
      and not public.dm_conversation_has_held_message(c.id);  -- ni las que tienen un mensaje en hold (evidencia de un reporte)
  end if;
  delete from public.notifications n where n.type = 'match_match' and n.user_id in (p_u1, p_u2)
    and (n.payload->>'business_id')::uuid = p_business_id and (n.payload->>'other_user_id')::uuid in (p_u1, p_u2);
end;
$$;

create or replace function public.match_wipe_user_venue(p_user_id uuid, p_business_id uuid) returns void
language plpgsql security definer set search_path to 'public'
as $$
declare r record;
begin
  -- matches y sus chats efímeros (sobreviven si hay solicitud de follow pendiente entre los dos)
  for r in select m.* from public.matches m where m.business_id = p_business_id and p_user_id in (m.user_a, m.user_b) loop
    if exists (select 1 from public.follow_requests fr where fr.status = 'pending'
               and ((fr.requester_id = r.user_a and fr.target_id = r.user_b) or (fr.requester_id = r.user_b and fr.target_id = r.user_a))) then
      continue;  -- la conversación espera la decisión del follow
    end if;
    perform public.match_remove_pair(p_business_id, r.user_a, r.user_b);
  end loop;
  -- conversaciones efímeras del local sin match (p. ej. match ya borrado) donde participa
  delete from public.dm_conversations c where c.ephemeral_business_id = p_business_id and p_user_id in (c.user_a, c.user_b)
    and not exists (select 1 from public.follow_requests fr where fr.status = 'pending'
                    and ((fr.requester_id = c.user_a and fr.target_id = c.user_b) or (fr.requester_id = c.user_b and fr.target_id = c.user_a)))
    and not public.dm_conversation_has_held_message(c.id);  -- evidencia de un reporte: se queda hasta que venza el hold
  -- swipes dados y recibidos, notificaciones de Match (propias y sobre él), opt-in y presencia
  delete from public.notifications n where n.type in ('match_like','match_super','match_match','match_new_people')
    and (n.payload->>'business_id')::uuid = p_business_id
    and (n.user_id = p_user_id or (n.payload->>'from_user_id')::uuid = p_user_id or (n.payload->>'other_user_id')::uuid = p_user_id);
  delete from public.match_swipes s where s.business_id = p_business_id and p_user_id in (s.swiper_id, s.target_id);
  delete from public.game_optins o where o.user_id = p_user_id and o.business_id = p_business_id;
  delete from public.match_presence p where p.user_id = p_user_id and p.business_id = p_business_id;
end;
$$;

create or replace function public.venue_exits_purge() returns integer
language plpgsql security definer set search_path to 'public'
as $$
declare r record; n int := 0;
begin
  for r in select user_id, business_id from public.venue_exits where purge_at <= now() loop
    delete from public.dm_conversations c
      where c.ephemeral_business_id = r.business_id
        and (c.user_a = r.user_id or c.user_b = r.user_id)
        and c.exit_hidden_at_a is not null and c.exit_hidden_at_b is not null
        and not exists (select 1 from public.follow_requests fr where fr.status = 'pending'
          and ((fr.requester_id = c.user_a and fr.target_id = c.user_b) or (fr.requester_id = c.user_b and fr.target_id = c.user_a)))
        and not public.dm_conversation_has_held_message(c.id);  -- evidencia de un reporte: se queda hasta que venza el hold
    perform public.match_wipe_user_venue_keep_dms(r.user_id, r.business_id);
    delete from public.venue_exits where user_id = r.user_id and business_id = r.business_id;
    n := n + 1;
  end loop;
  return n;
end $$;

-- ───────── F. Cola de borrado de copias ─────────
create table if not exists public.evidence_purge_queue (
  id              uuid primary key default gen_random_uuid(),
  bucket          text not null,
  path            text not null,
  created_at      timestamptz not null default now(),
  attempts        integer not null default 0,
  last_attempt_at timestamptz,
  last_error      text,
  unique (bucket, path)
);
create index if not exists evidence_purge_queue_attempt_idx on public.evidence_purge_queue (attempts, last_attempt_at);
alter table public.evidence_purge_queue enable row level security;
revoke all on public.evidence_purge_queue from anon, authenticated;
grant select, insert, update, delete on public.evidence_purge_queue to service_role;

-- retention_purge: igual que la 267 + las copias de evidencia de los reportes que borra se encolan ANTES de borrarlos.
create or replace function public.retention_purge() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v jsonb := '{}'::jsonb;
  n integer;
  v_report_ids uuid[];
begin
  -- cola de correos: enviados 30 días; fallidos u omitidos 90 días (pending nunca)
  with d as (
    delete from public.outbound_emails where id in (
      select id from public.outbound_emails
       where (status = 'sent' and sent_at < now() - interval '30 days')
          or (status in ('failed', 'skipped') and created_at < now() - interval '90 days')
       limit 5000) returning 1
  ) select count(*) into n from d;
  if n > 0 then v := v || jsonb_build_object('outbound_emails', n); end if;

  -- moderación de fotos: 90 días desde la última fecha que tenga la fila (sin ninguna fecha, no se toca)
  with d as (
    delete from public.photo_moderation_log where (kind, ref_id) in (
      select kind, ref_id from public.photo_moderation_log
       where greatest(last_attempt_at, alerted_at, notified_at) < now() - interval '90 days'
       limit 5000) returning 1
  ) select count(*) into n from d;
  if n > 0 then v := v || jsonb_build_object('photo_moderation_log', n); end if;

  with d as (
    delete from public.review_bypass_log where id in (
      select id from public.review_bypass_log where at < now() - interval '90 days' limit 5000) returning 1
  ) select count(*) into n from d;
  if n > 0 then v := v || jsonb_build_object('review_bypass_log', n); end if;

  -- registros de seguridad: 90 días; 365 días el historial de moderación y del propio borrado
  with d as (
    delete from public.security_logs where id in (
      select id from public.security_logs
       where created_at < now() - case
         when action like 'report\_%' or action in ('user_suspended', 'user_unsuspended', 'retention_purge', 'email_unbanned') then interval '365 days'
         else interval '90 days' end
       limit 5000) returning 1
  ) select count(*) into n from d;
  if n > 0 then v := v || jsonb_build_object('security_logs', n); end if;

  with d as (
    delete from public.moderation_logs where id in (
      select id from public.moderation_logs where created_at < now() - interval '365 days' limit 5000) returning 1
  ) select count(*) into n from d;
  if n > 0 then v := v || jsonb_build_object('moderation_logs', n); end if;

  with d as (
    delete from public.tod_moderation_log where id in (
      select id from public.tod_moderation_log where created_at < now() - interval '365 days' limit 5000) returning 1
  ) select count(*) into n from d;
  if n > 0 then v := v || jsonb_build_object('tod_moderation_log', n); end if;

  with d as (
    delete from public.table_reservation_log where id in (
      select id from public.table_reservation_log where created_at < now() - interval '365 days' limit 5000) returning 1
  ) select count(*) into n from d;
  if n > 0 then v := v || jsonb_build_object('table_reservation_log', n); end if;

  -- reportes cerrados: 1 año desde la resolución; seguridad infantil o escalados a NCMEC: 2 años; los pendientes no se borran nunca.
  -- Sus copias de evidencia (bucket report-evidence) se encolan antes: la edge function evidence-purge las borra de Storage.
  select coalesce(array_agg(id), '{}') into v_report_ids from (
    select id from public.reports
     where status in ('dismissed', 'resolved')
       and resolved_at is not null
       and resolved_at < now() - case
         when lower(split_part(coalesce(reason, ''), ':', 1)) in ('child_safety', 'minor', 'sexual_content') or resolution = 'escalated_ncmec'
           then interval '730 days'
         else interval '365 days' end
     limit 5000
  ) s;
  insert into public.evidence_purge_queue (bucket, path)
    select distinct e ->> 'bucket', e ->> 'path'
      from public.reports r, jsonb_array_elements(r.evidence) e
     where r.id = any (v_report_ids) and e ->> 'bucket' is not null and e ->> 'path' is not null
    on conflict (bucket, path) do nothing;
  with d as (
    delete from public.reports where id = any (v_report_ids) returning 1
  ) select count(*) into n from d;
  if n > 0 then v := v || jsonb_build_object('reports', n); end if;

  with d as (
    delete from public.banned_emails where fingerprint in (
      select fingerprint from public.banned_emails where expires_at < now() limit 5000) returning 1
  ) select count(*) into n from d;
  if n > 0 then v := v || jsonb_build_object('banned_emails', n); end if;

  if v <> '{}'::jsonb then
    insert into public.security_logs (actor_id, action, target_type, target_id, detail)
    values (null, 'retention_purge', 'retention', null, v::text);
  end if;
  return v;
end;
$$;

revoke all on function public.retention_purge() from public, anon, authenticated;
grant execute on function public.retention_purge() to service_role;

-- Reintento del borrado de copias (patrón de outbound_emails_retry, 266): 50 por lote, backoff 10 min × 2^attempts (tope 6 h), 6 intentos.
-- La edge function evidence-purge borra el objeto y la fila de la cola; si falla deja last_error genérico.
create or replace function public.evidence_purge_retry() returns integer
language plpgsql security definer set search_path = public, extensions
as $$
declare v_secret text; v_ids uuid[]; v_gave_up record;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_webhook_secret' limit 1;
  if v_secret is null then return 0; end if;

  -- 6 intentos y sigue sin borrarse: queda en la cola (terminal) y se registra UNA vez
  for v_gave_up in
    select q.id, q.bucket from public.evidence_purge_queue q
     where q.attempts >= 6
       and coalesce(q.last_attempt_at, q.created_at) < now() - interval '10 minutes'
       and not exists (select 1 from public.security_logs l where l.action = 'evidence_purge_gave_up' and l.target_id = q.id)
  loop
    insert into public.security_logs (actor_id, action, target_type, target_id, detail)
    values (null, 'evidence_purge_gave_up', 'evidence_purge_queue', v_gave_up.id, v_gave_up.bucket);
  end loop;

  with picked as (
    select id from public.evidence_purge_queue
     where attempts < 6
       and (last_attempt_at is null
            or last_attempt_at <= now() - least(interval '6 hours', interval '10 minutes' * power(2, attempts)))
     order by created_at
     limit 50
     for update skip locked
  ), bumped as (
    update public.evidence_purge_queue q
       set attempts = q.attempts + 1, last_attempt_at = now()
      from picked where q.id = picked.id
    returning q.id
  )
  select coalesce(array_agg(id), '{}') into v_ids from bumped;

  if cardinality(v_ids) = 0 then return 0; end if;
  perform net.http_post(
    url := 'https://klfsgcfoahdtkojyqspd.supabase.co/functions/v1/evidence-purge',
    body := jsonb_build_object('ids', to_jsonb(v_ids)),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    timeout_milliseconds := 20000);
  return cardinality(v_ids);
end;
$$;

revoke all on function public.evidence_purge_retry() from public, anon, authenticated;
grant execute on function public.evidence_purge_retry() to service_role;

-- ───────── Cron ─────────
-- cron.schedule con un nombre existente actualiza ese job (pg_cron 1.6): idempotente sin cron.unschedule previo.
select cron.schedule('evidence-purge-retry', '*/10 * * * *', $$select public.evidence_purge_retry()$$);
