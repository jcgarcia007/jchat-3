-- 212: reportes v2 (Lote D parte 2, D2-A).
-- Qué hace
--   1. reports: columnas details, snapshot (copia del contenido tomada por el servidor), priority, resolución.
--   2. Prioridad automática (trigger BEFORE INSERT): child_safety / Match 'minor' → urgent; threat_violence → high.
--      Cubre report_content, match_report y los clientes viejos que insertan directo en reports.
--   3. RPC report_content(tipo, id, motivo, detalle): valida, evita duplicados (24 h), límite 20/día, snapshot.
--   4. Aviso urgente: AFTER INSERT con priority='urgent' → pg_net → Edge Function safety-alert (correo a
--      safety@jchat.cloud). Si la función aún no existe, la llamada falla en segundo plano sin afectar el reporte.
-- Compatibilidad: no cambia la política de INSERT existente ni match_report.
-- Rollback: drop function public.report_content(text,uuid,text,text); drop trigger trg_reports_priority on public.reports;
--   drop trigger trg_reports_urgent_alert on public.reports; drop function public.reports_set_priority();
--   drop function public.reports_urgent_alert(); alter table public.reports drop constraint reports_status_chk,
--   drop constraint reports_priority_chk, drop column details, drop column snapshot, drop column priority,
--   drop column resolved_at, drop column resolved_by, drop column resolution, drop column admin_note;

alter table public.reports
  add column if not exists details     text,
  add column if not exists snapshot    jsonb,
  add column if not exists priority    text not null default 'normal',
  add column if not exists resolved_at timestamptz,
  add column if not exists resolved_by uuid references public.users(id) on delete set null,
  add column if not exists resolution  text,
  add column if not exists admin_note  text;

alter table public.reports drop constraint if exists reports_priority_chk;
alter table public.reports add constraint reports_priority_chk check (priority in ('normal','high','urgent'));
alter table public.reports drop constraint if exists reports_status_chk;
alter table public.reports add constraint reports_status_chk check (status in ('pending','dismissed','resolved'));

create index if not exists reports_pending_priority_idx on public.reports (priority, created_at desc) where status = 'pending';
create index if not exists reports_reporter_day_idx on public.reports (reporter_id, created_at desc);

-- Prioridad automática (el motivo puede venir como 'minor: detalle' desde match_report)
create or replace function public.reports_set_priority()
returns trigger language plpgsql set search_path = public as $$
declare v_reason text := lower(split_part(coalesce(new.reason, ''), ':', 1));
begin
  if v_reason in ('child_safety', 'minor') then
    new.priority := 'urgent';
  elsif v_reason in ('threat_violence') and new.priority = 'normal' then
    new.priority := 'high';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_reports_priority on public.reports;
create trigger trg_reports_priority before insert on public.reports
  for each row execute function public.reports_set_priority();

-- Aviso urgente → Edge Function safety-alert (mismo secreto x-push-secret que moderate-match-photo)
create or replace function public.reports_urgent_alert()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare v_secret text;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_webhook_secret' limit 1;
  if v_secret is null then return new; end if;
  perform net.http_post(
    url := 'https://klfsgcfoahdtkojyqspd.supabase.co/functions/v1/safety-alert',
    body := jsonb_build_object('report_id', new.id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    timeout_milliseconds := 10000);
  return new;
exception when others then
  return new;  -- el reporte nunca falla por el aviso
end;
$$;
drop trigger if exists trg_reports_urgent_alert on public.reports;
create trigger trg_reports_urgent_alert after insert on public.reports
  for each row when (new.priority = 'urgent') execute function public.reports_urgent_alert();

-- RPC principal de reporte
create or replace function public.report_content(p_content_type text, p_content_id uuid, p_reason text, p_details text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_reported uuid;
  v_business uuid;
  v_snapshot jsonb;
  v_existing uuid;
  v_id uuid;
  v_details text := nullif(left(trim(coalesce(p_details, '')), 1000), '');
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_content_type not in ('user','post','comment','message','dm_message') then
    raise exception 'invalid_content_type' using errcode = '22023';
  end if;
  if p_reason not in ('spam','harassment','hate','threat_violence','sexual_content','child_safety','impersonation','copyright','other') then
    raise exception 'invalid_reason' using errcode = '22023';
  end if;
  if p_reason = 'other' and v_details is null then raise exception 'details_required' using errcode = '22023'; end if;
  if p_content_id is null then raise exception 'not_found' using errcode = 'P0002'; end if;

  if p_content_type = 'user' then
    select u.id, jsonb_build_object('display_name', u.display_name, 'username', u.username, 'avatar_url', u.avatar_url)
      into v_reported, v_snapshot from public.users u where u.id = p_content_id;
  elsif p_content_type = 'post' then
    select p.user_id, p.business_id, jsonb_build_object('caption', p.caption, 'media_urls', p.media_urls, 'created_at', p.created_at)
      into v_reported, v_business, v_snapshot from public.posts p where p.id = p_content_id;
  elsif p_content_type = 'comment' then
    select c.user_id, jsonb_build_object('body', c.body, 'post_id', c.post_id, 'created_at', c.created_at)
      into v_reported, v_snapshot from public.comments c where c.id = p_content_id;
  elsif p_content_type = 'message' then
    select m.user_id, r.business_id,
           jsonb_build_object('body', m.body, 'media_url', m.media_url, 'type', m.type, 'room_id', m.room_id, 'created_at', m.created_at)
      into v_reported, v_business, v_snapshot
      from public.messages m join public.rooms r on r.id = m.room_id
     where m.id = p_content_id and public.can_access_room(m.room_id);
  elsif p_content_type = 'dm_message' then
    select d.sender_id,
           jsonb_build_object('body', d.body, 'media_url', d.media_url, 'voice_url', d.voice_url, 'conversation_id', d.conversation_id, 'created_at', d.created_at)
      into v_reported, v_snapshot
      from public.dm_messages d join public.dm_conversations c on c.id = d.conversation_id
     where d.id = p_content_id and (c.user_a = v_uid or c.user_b = v_uid);
  end if;

  if v_snapshot is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_reported = v_uid then raise exception 'invalid_target' using errcode = '22023'; end if;

  -- mismo reportero + mismo contenido en 24 h → devuelve el existente (sin duplicar)
  select id into v_existing from public.reports
   where reporter_id = v_uid and content_type = p_content_type
     and coalesce(content_id, reported_user_id) = p_content_id
     and created_at > now() - interval '24 hours'
   order by created_at desc limit 1;
  if v_existing is not null then return v_existing; end if;

  if (select count(*) from public.reports where reporter_id = v_uid and created_at > now() - interval '24 hours') >= 20 then
    raise exception 'report_limit' using errcode = '42501';
  end if;

  insert into public.reports (reporter_id, reported_user_id, content_type, content_id, reason, details, snapshot, status, business_id)
  values (v_uid, v_reported, p_content_type, case when p_content_type = 'user' then null else p_content_id end,
          p_reason, v_details, v_snapshot, 'pending', v_business)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.report_content(text, uuid, text, text) from public, anon;
grant execute on function public.report_content(text, uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
