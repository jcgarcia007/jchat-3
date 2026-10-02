-- 173a: generar notificaciones sociales (follower / like / comment) por trigger

create or replace function public.social_actor_name(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(display_name, ''), nullif(username, ''))
  from public.users where id = p_user_id;
$$;
revoke all on function public.social_actor_name(uuid) from public, anon, authenticated;

-- Seguir a alguien
create or replace function public.notify_on_follow()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.follower_id = new.following_id then return new; end if;
  if public.is_blocked(new.follower_id, new.following_id) then return new; end if;

  insert into public.notifications (user_id, type, payload)
  values (
    new.following_id,
    'follower',
    jsonb_build_object(
      'from_user_id', new.follower_id,
      'actor_name', public.social_actor_name(new.follower_id)
    )
  );
  return new;
end;
$$;
revoke all on function public.notify_on_follow() from public, anon, authenticated;

drop trigger if exists trg_notify_on_follow on public.follows;
create trigger trg_notify_on_follow
  after insert on public.follows
  for each row execute function public.notify_on_follow();

-- Solicitud de seguimiento (cuentas privadas)
create or replace function public.notify_on_follow_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.requester_id = new.target_id then return new; end if;
  if public.is_blocked(new.requester_id, new.target_id) then return new; end if;

  insert into public.notifications (user_id, type, payload)
  values (
    new.target_id,
    'follower',
    jsonb_build_object(
      'from_user_id', new.requester_id,
      'actor_name', public.social_actor_name(new.requester_id),
      'request', true
    )
  );
  return new;
end;
$$;
revoke all on function public.notify_on_follow_request() from public, anon, authenticated;

drop trigger if exists trg_notify_on_follow_request on public.follow_requests;
create trigger trg_notify_on_follow_request
  after insert on public.follow_requests
  for each row execute function public.notify_on_follow_request();

-- Like a una publicación
create or replace function public.notify_on_post_like()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  select user_id into v_owner from public.posts where id = new.post_id;
  if v_owner is null or v_owner = new.user_id then return new; end if;
  if public.is_blocked(new.user_id, v_owner) then return new; end if;

  -- evitar duplicados si quita y vuelve a poner el like
  if exists (
    select 1 from public.notifications
    where user_id = v_owner and type = 'like'
      and payload->>'post_id' = new.post_id::text
      and payload->>'from_user_id' = new.user_id::text
      and created_at > now() - interval '1 day'
  ) then return new; end if;

  insert into public.notifications (user_id, type, payload)
  values (
    v_owner,
    'like',
    jsonb_build_object(
      'post_id', new.post_id,
      'from_user_id', new.user_id,
      'actor_name', public.social_actor_name(new.user_id)
    )
  );
  return new;
end;
$$;
revoke all on function public.notify_on_post_like() from public, anon, authenticated;

drop trigger if exists trg_notify_on_post_like on public.post_likes;
create trigger trg_notify_on_post_like
  after insert on public.post_likes
  for each row execute function public.notify_on_post_like();

-- Comentario en una publicación
create or replace function public.notify_on_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  select user_id into v_owner from public.posts where id = new.post_id;
  if v_owner is null or v_owner = new.user_id then return new; end if;
  if public.is_blocked(new.user_id, v_owner) then return new; end if;

  insert into public.notifications (user_id, type, payload)
  values (
    v_owner,
    'comment',
    jsonb_build_object(
      'post_id', new.post_id,
      'comment_id', new.id,
      'from_user_id', new.user_id,
      'actor_name', public.social_actor_name(new.user_id),
      'preview', left(coalesce(new.body, ''), 80)
    )
  );
  return new;
end;
$$;
revoke all on function public.notify_on_comment() from public, anon, authenticated;

drop trigger if exists trg_notify_on_comment on public.comments;
create trigger trg_notify_on_comment
  after insert on public.comments
  for each row execute function public.notify_on_comment();
