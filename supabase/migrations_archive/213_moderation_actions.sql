-- 213: acciones de moderación + bloqueo mutuo en el chat del local (Lote D parte 2, D2-A).
-- Qué hace
--   1. Bloqueo mutuo en el chat del local: política RESTRICTIVA de SELECT en messages → no ves mensajes de alguien
--      con quien hay bloqueo (en cualquier sentido). Misma función is_blocked que ya usan los DMs. Aplica también a Realtime.
--   2. Contenido oculto: hidden_at/hidden_by en posts, comments, messages, dm_messages + política RESTRICTIVA de SELECT:
--      un contenido oculto solo lo ve su autor y los admins de plataforma (se conserva como evidencia, no se borra).
--   3. Suspensión: users.suspended_until/suspended_reason; admin_suspend_user marca auth.users.banned_until y cierra
--      las sesiones (la cuenta deja de poder entrar; un token ya emitido expira solo en ≤1 h).
--   4. RPCs de admin (solo is_platform_admin()): admin_hide_content, admin_suspend_user, admin_unsuspend_user,
--      admin_resolve_report. Todas dejan registro en security_logs.
-- Rollback: drop policy "messages: hide blocked" on public.messages; drop policy "<tabla>: hide hidden" en las 4 tablas;
--   drop function public.admin_hide_content(text,uuid,uuid,boolean); drop function public.admin_suspend_user(uuid,integer,text,uuid);
--   drop function public.admin_unsuspend_user(uuid); drop function public.admin_resolve_report(uuid,text,text);
--   alter table ... drop column hidden_at, drop column hidden_by (4 tablas); alter table public.users drop column suspended_until, drop column suspended_reason;

-- 1. Bloqueo mutuo en el chat del local
drop policy if exists "messages: hide blocked" on public.messages;
create policy "messages: hide blocked" on public.messages as restrictive for select to authenticated
  using (user_id is null or user_id = (select auth.uid()) or not public.is_blocked((select auth.uid()), user_id));

-- 2. Contenido oculto por moderación
alter table public.posts       add column if not exists hidden_at timestamptz, add column if not exists hidden_by uuid;
alter table public.comments    add column if not exists hidden_at timestamptz, add column if not exists hidden_by uuid;
alter table public.messages    add column if not exists hidden_at timestamptz, add column if not exists hidden_by uuid;
alter table public.dm_messages add column if not exists hidden_at timestamptz, add column if not exists hidden_by uuid;

drop policy if exists "posts: hide hidden" on public.posts;
create policy "posts: hide hidden" on public.posts as restrictive for select to authenticated
  using (hidden_at is null or user_id = (select auth.uid()) or public.is_platform_admin());
drop policy if exists "comments: hide hidden" on public.comments;
create policy "comments: hide hidden" on public.comments as restrictive for select to authenticated
  using (hidden_at is null or user_id = (select auth.uid()) or public.is_platform_admin());
drop policy if exists "messages: hide hidden" on public.messages;
create policy "messages: hide hidden" on public.messages as restrictive for select to authenticated
  using (hidden_at is null or user_id = (select auth.uid()) or public.is_platform_admin());
drop policy if exists "dm_messages: hide hidden" on public.dm_messages;
create policy "dm_messages: hide hidden" on public.dm_messages as restrictive for select to authenticated
  using (hidden_at is null or sender_id = (select auth.uid()) or public.is_platform_admin());

-- 3. Suspensión
alter table public.users add column if not exists suspended_until timestamptz, add column if not exists suspended_reason text;

-- 4. RPCs de admin
create or replace function public.admin_hide_content(p_content_type text, p_content_id uuid, p_report_id uuid default null, p_unhide boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_at timestamptz := case when p_unhide then null else now() end; v_by uuid := case when p_unhide then null else auth.uid() end; n int;
begin
  if not public.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_content_type = 'post' then update public.posts set hidden_at = v_at, hidden_by = v_by where id = p_content_id;
  elsif p_content_type = 'comment' then update public.comments set hidden_at = v_at, hidden_by = v_by where id = p_content_id;
  elsif p_content_type = 'message' then update public.messages set hidden_at = v_at, hidden_by = v_by where id = p_content_id;
  elsif p_content_type = 'dm_message' then update public.dm_messages set hidden_at = v_at, hidden_by = v_by where id = p_content_id;
  else raise exception 'invalid_content_type' using errcode = '22023';
  end if;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into public.security_logs (actor_id, action, target_type, target_id, detail)
  values (v_uid, case when p_unhide then 'content_unhidden' else 'content_hidden' end, p_content_type, p_content_id,
          case when p_report_id is not null then 'report ' || p_report_id end);
end;
$$;

create or replace function public.admin_suspend_user(p_user_id uuid, p_days integer default null, p_reason text default null, p_report_id uuid default null)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_until timestamptz;
begin
  if not public.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_user_id = v_uid then raise exception 'invalid_target' using errcode = '22023'; end if;
  if exists (select 1 from public.users where id = p_user_id and role = 'super_admin') then
    raise exception 'invalid_target' using errcode = '22023';
  end if;
  if p_days is not null and (p_days < 1 or p_days > 3650) then raise exception 'invalid_days' using errcode = '22023'; end if;
  v_until := case when p_days is null then now() + interval '100 years' else now() + make_interval(days => p_days) end;
  update public.users set suspended_until = v_until, suspended_reason = nullif(left(trim(coalesce(p_reason, '')), 500), '')
   where id = p_user_id;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  update auth.users set banned_until = v_until where id = p_user_id;
  delete from auth.sessions where user_id = p_user_id;
  insert into public.security_logs (actor_id, action, target_type, target_id, detail)
  values (v_uid, 'user_suspended', 'user', p_user_id,
          coalesce(p_days::text || ' days', 'permanent') || coalesce(' · report ' || p_report_id, '') || coalesce(' · ' || left(p_reason, 200), ''));
  return v_until;
end;
$$;

create or replace function public.admin_unsuspend_user(p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if not public.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.users set suspended_until = null, suspended_reason = null where id = p_user_id;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  update auth.users set banned_until = null where id = p_user_id;
  insert into public.security_logs (actor_id, action, target_type, target_id, detail)
  values (v_uid, 'user_unsuspended', 'user', p_user_id, null);
end;
$$;

create or replace function public.admin_resolve_report(p_report_id uuid, p_resolution text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if not public.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_resolution not in ('dismissed','no_action','content_removed','user_suspended','escalated_ncmec') then
    raise exception 'invalid_resolution' using errcode = '22023';
  end if;
  update public.reports
     set status = case when p_resolution = 'dismissed' then 'dismissed' else 'resolved' end,
         resolution = p_resolution, admin_note = nullif(left(trim(coalesce(p_note, '')), 2000), ''),
         resolved_at = now(), resolved_by = v_uid
   where id = p_report_id;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into public.security_logs (actor_id, action, target_type, target_id, detail)
  values (v_uid, 'report_resolved', 'report', p_report_id, p_resolution);
end;
$$;

revoke all on function public.admin_hide_content(text, uuid, uuid, boolean) from public, anon;
revoke all on function public.admin_suspend_user(uuid, integer, text, uuid) from public, anon;
revoke all on function public.admin_unsuspend_user(uuid) from public, anon;
revoke all on function public.admin_resolve_report(uuid, text, text) from public, anon;
grant execute on function public.admin_hide_content(text, uuid, uuid, boolean) to authenticated;
grant execute on function public.admin_suspend_user(uuid, integer, text, uuid) to authenticated;
grant execute on function public.admin_unsuspend_user(uuid) to authenticated;
grant execute on function public.admin_resolve_report(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
