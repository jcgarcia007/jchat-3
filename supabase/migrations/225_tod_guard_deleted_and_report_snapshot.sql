-- 225_tod_guard_deleted_and_report_snapshot.sql
-- Truth or Dare:
-- 1) messages_type_guard (221) también bloquea cambios de is_deleted en mensajes tod_* desde clientes.
-- 2) report_content: el snapshot de reportes sobre mensajes incluye type, metadata y, para tod_draw,
--    el texto de la carta (ES/EN) desde tod_cards, para que el super-admin vea qué se reportó
--    aunque el mensaje expire. Sin DROP; idempotente.

create or replace function public.messages_type_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if auth.uid() is null or coalesce(current_setting('jchat.trusted_message', true), '') = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if coalesce(new.is_system, false) or new.type = 'system' or new.type like 'tod\_%' then
      raise exception 'message_type_not_allowed' using errcode = '42501';
    end if;
  else
    if new.type is distinct from old.type or new.is_system is distinct from old.is_system then
      raise exception 'message_type_readonly' using errcode = '42501';
    end if;
    if old.type like 'tod\_%' and (new.body is distinct from old.body or new.metadata is distinct from old.metadata
        or new.room_id is distinct from old.room_id or new.user_id is distinct from old.user_id
        or new.is_deleted is distinct from old.is_deleted) then
      raise exception 'message_type_readonly' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

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
           jsonb_build_object('body', m.body, 'media_url', m.media_url, 'type', m.type, 'metadata', m.metadata, 'room_id', m.room_id, 'created_at', m.created_at,
                              'card_text', case when m.type = 'tod_draw' then
                                 (select jsonb_object_agg(c.locale, c.body) from public.tod_cards c where c.concept_id = m.metadata->>'concept_id') end)
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
