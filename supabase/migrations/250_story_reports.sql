-- 250: reportar historias (stories). BORRADOR PARA REVISIÓN: NO está aplicada en Supabase. La aplica Juan Carlos por MCP, DESPUÉS de la 248.
-- Reversión: supabase/rollbacks/250_story_reports_rollback.sql · Comprobación: supabase/scripts/250_check.sql · Prueba local: supabase/tests/11_story_reports.sql
--
-- Apple 1.2 / Google UGC: las historias no se podían reportar (report_content solo aceptaba user/post/comment/message/dm_message) ni ocultar
-- (stories no tenía hidden_at). Esta migración:
--  1. stories.hidden_at / hidden_by (como posts, comments, messages y dm_messages).
--  2. report_content, admin_hide_content y admin_report_content_exists aceptan 'story' (create or replace; el resto igual que el baseline).
--  3. stories_read: todas las condiciones de la 248 (propia, o autor sin bloqueo y (cuenta pública o seguida)) + "hidden_at is null" para quien no
--     es el autor. Es un ALTER POLICY completo, así que funciona igual si la 248 ya está aplicada (el orden previsto) o no.
-- No borra nada. Idempotente.

alter table public.stories add column if not exists hidden_at timestamptz;
alter table public.stories add column if not exists hidden_by uuid references public.users(id) on delete set null;

CREATE OR REPLACE FUNCTION "public"."report_content"("p_content_type" "text", "p_content_id" "uuid", "p_reason" "text", "p_details" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
  if p_content_type not in ('user','post','comment','message','dm_message','story') then
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
  elsif p_content_type = 'story' then
    -- only a story the reporter could see: same visibility as the stories_read policy (not blocked, public or followed), alive, not hidden yet
    select s.user_id, jsonb_build_object('media_url', s.media_url, 'text_overlay', s.text_overlay, 'created_at', s.created_at)
      into v_reported, v_snapshot
      from public.stories s
     where s.id = p_content_id and s.expires_at > now() and s.hidden_at is null
       and (s.user_id = v_uid
            or (not public.is_blocked(v_uid, s.user_id)
                and (not public.is_private_account(s.user_id)
                     or exists (select 1 from public.follows f where f.follower_id = v_uid and f.following_id = s.user_id))));
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

CREATE OR REPLACE FUNCTION "public"."admin_hide_content"("p_content_type" "text", "p_content_id" "uuid", "p_report_id" "uuid" DEFAULT NULL::"uuid", "p_unhide" boolean DEFAULT false) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_uid uuid := auth.uid(); v_at timestamptz := case when p_unhide then null else now() end; v_by uuid := case when p_unhide then null else auth.uid() end; n int;
begin
  if not public.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_content_type = 'post' then update public.posts set hidden_at = v_at, hidden_by = v_by where id = p_content_id;
  elsif p_content_type = 'comment' then update public.comments set hidden_at = v_at, hidden_by = v_by where id = p_content_id;
  elsif p_content_type = 'message' then update public.messages set hidden_at = v_at, hidden_by = v_by where id = p_content_id;
  elsif p_content_type = 'dm_message' then update public.dm_messages set hidden_at = v_at, hidden_by = v_by where id = p_content_id;
  elsif p_content_type = 'story' then update public.stories set hidden_at = v_at, hidden_by = v_by where id = p_content_id;
  else raise exception 'invalid_content_type' using errcode = '22023';
  end if;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into public.security_logs (actor_id, action, target_type, target_id, detail)
  values (v_uid, case when p_unhide then 'content_unhidden' else 'content_hidden' end, p_content_type, p_content_id,
          case when p_report_id is not null then 'report ' || p_report_id end);
end;
$$;

CREATE OR REPLACE FUNCTION "public"."admin_report_content_exists"("p_content_type" "text", "p_content_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_content_id is null then return false; end if;
  return case p_content_type
    when 'post'       then exists (select 1 from public.posts       where id = p_content_id)
    when 'comment'    then exists (select 1 from public.comments    where id = p_content_id)
    when 'message'    then exists (select 1 from public.messages    where id = p_content_id)
    when 'dm_message' then exists (select 1 from public.dm_messages where id = p_content_id)
    when 'story'      then exists (select 1 from public.stories     where id = p_content_id)
    else true
  end;
end;
$$;

alter policy stories_read on public.stories using (
  user_id = (select auth.uid())
  or (
    hidden_at is null
    and not public.is_blocked((select auth.uid()), user_id)
    and (
      not public.is_private_account(user_id)
      or exists (select 1 from public.follows f where f.follower_id = (select auth.uid()) and f.following_id = stories.user_id)
    )
  )
);
