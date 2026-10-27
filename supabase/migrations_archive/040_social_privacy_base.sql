-- ============================================================
-- JChat 3.0 — Social Fase A+B, sub-parte 1: BASE de privacidad
-- Ref: docs/PLAN_MAESTRO_SOCIAL.md (Módulos A + B).
--
-- El andamiaje social ya existe (002_social_schema, 003_schema_catchup) pero la
-- privacidad NO se aplica: las RLS de lectura están en `true`. Esta migración añade:
--   1. users.is_private (fuente de verdad top-level para RLS)
--   2. Helpers SECURITY DEFINER: is_blocked / can_view_profile / can_view_user_content
--   3. RPCs SECURITY DEFINER: request_or_follow, accept_follow_request,
--      remove_follower, block_user, unblock_user
--   4. Reescritura de la RLS de lectura de `follows` (aplica privacidad)
--
-- NO toca RLS de posts/comments/dm (eso es Fase C y D).
--
-- Por qué SECURITY DEFINER en los helpers: la policy follows_read llama a
-- can_view_profile(), que a su vez consulta `follows`. Si el helper corriera como
-- invoker con RLS, re-dispararía follows_read → recursión. SECURITY DEFINER lo
-- ejecuta como owner (bypass RLS) → sin recursión y ve todas las filas para
-- evaluar visibilidad correctamente.
-- ============================================================

-- ---------- 1. users.is_private ----------
alter table public.users add column if not exists is_private boolean not null default false;

-- Backfill desde el setting existente (hoy 0 filas con privacy_settings no vacío → no-op,
-- pero deja el estado consistente si más adelante se aplica antes de re-correr).
-- Valores confirmados de PrivacyScreen: accountVisibility ∈ {'public','private'}.
update public.users
   set is_private = (privacy_settings->>'accountVisibility' = 'private')
 where privacy_settings ? 'accountVisibility';

-- Nota: NO se crea índice sobre is_private. Es booleano (baja cardinalidad) y los
-- helpers lo leen por PK (where id = ?), no por is_private → un índice no ayudaría.

-- ---------- 2. Helpers SECURITY DEFINER ----------

-- is_blocked(a,b): true si existe un bloqueo en CUALQUIER sentido entre a y b.
create or replace function public.is_blocked(a uuid, b uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = a and blocked_id = b)
       or (blocker_id = b and blocked_id = a)
  );
$$;

-- can_view_profile(viewer,target): ¿viewer puede ver el perfil/relaciones de target?
--   bloqueo (cualquier sentido)      → false
--   viewer = target                  → true (uno siempre se ve a sí mismo)
--   target público                   → true
--   target privado                   → solo si viewer sigue a target (arista aceptada en follows)
create or replace function public.can_view_profile(viewer uuid, target uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select case
    when public.is_blocked(viewer, target) then false
    when viewer = target then true
    when not coalesce((select is_private from public.users where id = target), false) then true
    else exists (
      select 1 from public.follows
      where follower_id = viewer and following_id = target
    )
  end;
$$;

-- can_view_user_content(viewer,owner,dimension): resuelve un setting de contenido
-- (privacy_settings->>dimension ∈ {'everyone','followers','nobody'}, default 'everyone').
--   bloqueo        → false
--   viewer = owner → true (el dueño siempre ve su contenido)
--   everyone       → true
--   followers      → viewer sigue a owner (arista aceptada)
--   nobody         → false
create or replace function public.can_view_user_content(viewer uuid, owner uuid, dimension text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select case
    when public.is_blocked(viewer, owner) then false
    when viewer = owner then true
    else case coalesce((select privacy_settings->>dimension from public.users where id = owner), 'everyone')
      when 'everyone'  then true
      when 'followers' then exists (
        select 1 from public.follows where follower_id = viewer and following_id = owner
      )
      when 'nobody'    then false
      else true  -- valor desconocido → tratar como 'everyone'
    end
  end;
$$;

grant execute on function public.is_blocked(uuid, uuid) to authenticated;
grant execute on function public.can_view_profile(uuid, uuid) to authenticated;
grant execute on function public.can_view_user_content(uuid, uuid, text) to authenticated;

-- ---------- 3. RPCs SECURITY DEFINER (con guards de auth.uid()) ----------

-- request_or_follow: seguir (público → arista directa) o solicitar (privado → follow_requests).
create or replace function public.request_or_follow(p_target uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_private boolean;
begin
  if v_me is null then raise exception 'not authenticated'; end if;
  if v_me = p_target then raise exception 'cannot follow yourself'; end if;
  if public.is_blocked(v_me, p_target) then raise exception 'blocked'; end if;

  select is_private into v_private from public.users where id = p_target;
  if not found then raise exception 'target not found'; end if;

  if v_private then
    insert into public.follow_requests (requester_id, target_id)
      values (v_me, p_target)
      on conflict (requester_id, target_id) do nothing;
    return 'requested';
  else
    insert into public.follows (follower_id, following_id)
      values (v_me, p_target)
      on conflict (follower_id, following_id) do nothing;
    return 'following';
  end if;
end;
$$;

-- accept_follow_request: el target acepta → crea la arista follows (follower=requester)
-- + borra el request. Atómico. Necesaria porque la RLS de follows insert exige
-- follower_id = auth.uid(), pero aquí follower = requester ≠ target.
create or replace function public.accept_follow_request(p_requester uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'not authenticated'; end if;
  if not exists (
    select 1 from public.follow_requests
    where requester_id = p_requester and target_id = v_me
  ) then
    raise exception 'no such follow request';
  end if;

  insert into public.follows (follower_id, following_id)
    values (p_requester, v_me)
    on conflict (follower_id, following_id) do nothing;

  delete from public.follow_requests
    where requester_id = p_requester and target_id = v_me;
end;
$$;

-- remove_follower: quitar a alguien que ME sigue (borra la arista donde following = yo).
-- La RLS delete-own no lo permite (el que borra no es el follower).
create or replace function public.remove_follower(p_follower uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'not authenticated'; end if;
  delete from public.follows
    where follower_id = p_follower and following_id = v_me;
end;
$$;

-- block_user: bloquea + corta aristas follows en AMBOS sentidos + borra follow_requests
-- pendientes en ambos sentidos. Atómico.
create or replace function public.block_user(p_target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'not authenticated'; end if;
  if v_me = p_target then raise exception 'cannot block yourself'; end if;

  insert into public.blocks (blocker_id, blocked_id)
    values (v_me, p_target)
    on conflict (blocker_id, blocked_id) do nothing;

  delete from public.follows
    where (follower_id = v_me and following_id = p_target)
       or (follower_id = p_target and following_id = v_me);

  delete from public.follow_requests
    where (requester_id = v_me and target_id = p_target)
       or (requester_id = p_target and target_id = v_me);
end;
$$;

-- unblock_user: quita el bloqueo (no restaura aristas — el usuario re-sigue si quiere).
create or replace function public.unblock_user(p_target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'not authenticated'; end if;
  delete from public.blocks where blocker_id = v_me and blocked_id = p_target;
end;
$$;

grant execute on function public.request_or_follow(uuid)     to authenticated;
grant execute on function public.accept_follow_request(uuid) to authenticated;
grant execute on function public.remove_follower(uuid)       to authenticated;
grant execute on function public.block_user(uuid)            to authenticated;
grant execute on function public.unblock_user(uuid)          to authenticated;

-- ---------- 4. RLS de follows: aplicar privacidad en la lectura ----------
-- Lógica elegida: una arista (follower_id → following_id) es visible si puedo ver el
-- perfil de CUALQUIERA de sus dos extremos: can_view_profile(yo, follower_id) OR
-- can_view_profile(yo, following_id).
--   - Motivo del OR: una misma arista pertenece a DOS listas — la de "siguiendo" de
--     follower_id y la de "seguidores" de following_id. RLS es a nivel de fila y no sabe
--     qué lista está pintando el cliente, así que la fila se muestra si alguno de los dos
--     perfiles es visible para mí. Esto reproduce Instagram en el caso normal: una cuenta
--     privada A que sigue a una pública B SÍ aparece en la lista de seguidores (pública) de B.
--   - Limitación conocida (inherente a RLS de fila): al consultar por follower_id = A
--     (cuenta privada que no sigo), podrían aparecer las aristas A→(público) porque el
--     extremo público es visible. La ocultación estricta de "a quién sigue una cuenta
--     privada" se refuerza en la capa de app/query (no se abre el perfil de A si no puedo
--     verlo) + can_view_profile como piso. RLS aquí es el suelo de seguridad, no el gate
--     por-lista.
drop policy if exists "follows: authenticated read" on public.follows;
create policy "follows_read" on public.follows for select to authenticated
  using (
    public.can_view_profile(auth.uid(), follower_id)
    or public.can_view_profile(auth.uid(), following_id)
  );

-- follows insert/delete se dejan tal cual (insert own, delete own). Los índices
-- idx_follows_follower_id / idx_follows_following_id ya existen.
