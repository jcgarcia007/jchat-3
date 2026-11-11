-- ROLLBACK de 272_report_evidence (destructivo: borra la cola de copias, las columnas de evidencia y el cron). Juan lo aplica a mano en el SQL Editor.
-- Antes: vaciar el bucket report-evidence desde Storage si tiene copias (una evidencia aún dentro del plazo se pierde si se hace sin copiarla antes).
-- Restaura los cuerpos anteriores (producción 2026-11-08): message_under_retention_hold y retention_purge (267), match_remove_pair, match_wipe_user_venue y venue_exits_purge (245).
select cron.unschedule('evidence-purge-retry');
drop function if exists public.evidence_purge_retry();

create or replace function public.message_under_retention_hold(p_message_id uuid) returns boolean
language sql stable security definer set search_path to 'public'
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
          and coalesce(r.resolved_at, r.created_at) > now() - interval '365 days'
        )
      )
  );
$$;

create or replace function public.retention_purge() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v jsonb := '{}'::jsonb;
  n integer;
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

  -- reportes cerrados: 1 año desde la resolución; seguridad infantil o escalados a NCMEC: 2 años; los pendientes no se borran nunca
  with d as (
    delete from public.reports where id in (
      select id from public.reports
       where status in ('dismissed', 'resolved')
         and resolved_at is not null
         and resolved_at < now() - case
           when lower(split_part(coalesce(reason, ''), ':', 1)) in ('child_safety', 'minor', 'sexual_content') or resolution = 'escalated_ncmec'
             then interval '730 days'
           else interval '365 days' end
       limit 5000) returning 1
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

CREATE OR REPLACE FUNCTION public.match_remove_pair(p_business_id uuid, p_u1 uuid, p_u2 uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_conv uuid;
begin
  delete from public.matches m where m.business_id = p_business_id and m.user_a = least(p_u1,p_u2) and m.user_b = greatest(p_u1,p_u2)
  returning m.conversation_id into v_conv;
  if v_conv is not null then
    delete from public.dm_conversations c where c.id = v_conv and c.ephemeral_business_id = p_business_id;  -- las permanentes no se tocan
  end if;
  delete from public.notifications n where n.type = 'match_match' and n.user_id in (p_u1, p_u2)
    and (n.payload->>'business_id')::uuid = p_business_id and (n.payload->>'other_user_id')::uuid in (p_u1, p_u2);
end;
$function$;

CREATE OR REPLACE FUNCTION public.match_wipe_user_venue(p_user_id uuid, p_business_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r record;
begin
  for r in select m.* from public.matches m where m.business_id = p_business_id and p_user_id in (m.user_a, m.user_b) loop
    if exists (select 1 from public.follow_requests fr where fr.status = 'pending'
               and ((fr.requester_id = r.user_a and fr.target_id = r.user_b) or (fr.requester_id = r.user_b and fr.target_id = r.user_a))) then
      continue;
    end if;
    perform public.match_remove_pair(p_business_id, r.user_a, r.user_b);
  end loop;
  delete from public.dm_conversations c where c.ephemeral_business_id = p_business_id and p_user_id in (c.user_a, c.user_b)
    and not exists (select 1 from public.follow_requests fr where fr.status = 'pending'
                    and ((fr.requester_id = c.user_a and fr.target_id = c.user_b) or (fr.requester_id = c.user_b and fr.target_id = c.user_a)));
  delete from public.notifications n where n.type in ('match_like','match_super','match_match','match_new_people')
    and (n.payload->>'business_id')::uuid = p_business_id
    and (n.user_id = p_user_id or (n.payload->>'from_user_id')::uuid = p_user_id or (n.payload->>'other_user_id')::uuid = p_user_id);
  delete from public.match_swipes s where s.business_id = p_business_id and p_user_id in (s.swiper_id, s.target_id);
  delete from public.game_optins o where o.user_id = p_user_id and o.business_id = p_business_id;
  delete from public.match_presence p where p.user_id = p_user_id and p.business_id = p_business_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.venue_exits_purge()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r record; n int := 0;
begin
  for r in select user_id, business_id from public.venue_exits where purge_at <= now() loop
    delete from public.dm_conversations c
      where c.ephemeral_business_id = r.business_id
        and (c.user_a = r.user_id or c.user_b = r.user_id)
        and c.exit_hidden_at_a is not null and c.exit_hidden_at_b is not null
        and not exists (select 1 from public.follow_requests fr where fr.status = 'pending'
          and ((fr.requester_id = c.user_a and fr.target_id = c.user_b) or (fr.requester_id = c.user_b and fr.target_id = c.user_a)));
    perform public.match_wipe_user_venue_keep_dms(r.user_id, r.business_id);
    delete from public.venue_exits where user_id = r.user_id and business_id = r.business_id;
    n := n + 1;
  end loop;
  return n;
end $function$;

drop function if exists public.user_held_evidence(uuid);
drop function if exists public.dm_conversation_has_held_message(uuid);
drop function if exists public.content_under_retention_hold(text, uuid);
drop function if exists public.report_in_hold(text, text, text, timestamptz, timestamptz);
drop table if exists public.evidence_purge_queue;
alter table public.reports drop column if exists evidence;
alter table public.reports drop column if exists evidence_copied_at;
-- el bucket report-evidence: vaciarlo y borrarlo desde el panel de Storage (SQL no borra archivos de forma fiable).
