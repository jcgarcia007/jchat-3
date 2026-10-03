-- 181: request_or_follow no crea solicitud si YA sigues a la cuenta (privada o no)

create or replace function public.request_or_follow(p_target uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_me uuid := auth.uid(); v_private boolean;
begin
  if v_me is null then raise exception 'not authenticated'; end if;
  if v_me = p_target then raise exception 'cannot follow yourself'; end if;
  if public.is_blocked(v_me, p_target) then raise exception 'blocked'; end if;
  select is_private into v_private from public.users where id = p_target;
  if not found then raise exception 'target not found'; end if;

  -- Ya lo sigo: no hacer nada más
  if exists (select 1 from public.follows where follower_id = v_me and following_id = p_target) then
    return 'following';
  end if;

  if v_private then
    insert into public.follow_requests (requester_id, target_id)
      values (v_me, p_target) on conflict (requester_id, target_id) do nothing;
    return 'requested';
  else
    insert into public.follows (follower_id, following_id)
      values (v_me, p_target) on conflict (follower_id, following_id) do nothing;
    return 'following';
  end if;
end; $function$;
