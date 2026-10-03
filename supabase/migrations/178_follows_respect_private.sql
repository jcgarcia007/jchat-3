-- 178: impedir seguir directamente a cuentas privadas (antes se saltaba la solicitud y daba acceso a contenido "solo seguidores")

create or replace function public.is_private_account(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select u.is_private from public.users u where u.id = p_user), false);
$$;
revoke all on function public.is_private_account(uuid) from public, anon;
grant execute on function public.is_private_account(uuid) to authenticated;

drop policy if exists "follows: authenticated insert own" on public.follows;
create policy "follows: authenticated insert own" on public.follows
  for insert to authenticated
  with check (
    (select auth.uid()) = follower_id
    and follower_id <> following_id
    and not public.is_private_account(following_id)
    and not public.is_blocked((select auth.uid()), following_id)
  );
-- Las cuentas privadas se siguen solo vía request_or_follow / accept_follow_request (SECURITY DEFINER).
