-- 180: contadores de perfil visibles (como IG, aun en cuentas privadas), rechazar solicitudes y blindar su creación

-- Contadores públicos: seguidores, seguidos y publicaciones personales (sin las de negocio).
-- Si hay bloqueo entre quien mira y el perfil, devuelve ceros.
create or replace function public.profile_counts(p_user uuid)
returns table (followers bigint, following bigint, posts bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    case when public.is_blocked((select auth.uid()), p_user) then 0
         else (select count(*) from public.follows f where f.following_id = p_user) end,
    case when public.is_blocked((select auth.uid()), p_user) then 0
         else (select count(*) from public.follows f where f.follower_id = p_user) end,
    case when public.is_blocked((select auth.uid()), p_user) then 0
         else (select count(*) from public.posts p where p.user_id = p_user and p.business_id is null) end;
$$;
revoke all on function public.profile_counts(uuid) from public, anon;
grant execute on function public.profile_counts(uuid) to authenticated;

-- Rechazar una solicitud: la borra quien la RECIBIÓ (antes solo podía borrarla quien la envió)
create or replace function public.reject_follow_request(p_requester uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.follow_requests
  where target_id = (select auth.uid()) and requester_id = p_requester;
$$;
revoke all on function public.reject_follow_request(uuid) from public, anon;
grant execute on function public.reject_follow_request(uuid) to authenticated;

-- Crear solicitud: nunca a uno mismo ni con bloqueo de por medio
drop policy if exists follow_requests_create on public.follow_requests;
create policy follow_requests_create on public.follow_requests
  for insert to authenticated
  with check (
    requester_id = (select auth.uid())
    and requester_id <> target_id
    and not public.is_blocked((select auth.uid()), target_id)
  );
