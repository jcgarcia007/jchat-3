-- 175: publicaciones de negocios (Proyecto B, fase 1)

alter table public.posts
  add column if not exists business_id uuid references public.businesses(id) on delete cascade;

create index if not exists posts_business_created_idx
  on public.posts (business_id, created_at desc)
  where business_id is not null;

-- Límites solo para publicaciones de negocio
alter table public.posts drop constraint if exists posts_business_caption_len;
alter table public.posts add constraint posts_business_caption_len
  check (business_id is null or char_length(coalesce(caption, '')) <= 1000);

alter table public.posts drop constraint if exists posts_business_media_max;
alter table public.posts add constraint posts_business_media_max
  check (business_id is null or coalesce(cardinality(media_urls), 0) <= 4);

-- ¿Quién puede publicar a nombre de un negocio?
-- Fase 1: solo el dueño. Fase futura: sumar empleados con permiso aquí, sin tocar las políticas.
create or replace function public.can_publish_business_post(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.businesses b
    where b.id = p_business_id
      and b.owner_id = (select auth.uid())
  );
$$;
revoke all on function public.can_publish_business_post(uuid) from public, anon;
grant execute on function public.can_publish_business_post(uuid) to authenticated;

-- Insertar: propio, y si va a nombre de un negocio, solo si puede publicar por él
drop policy if exists posts_insert_own on public.posts;
create policy posts_insert_own on public.posts
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (business_id is null or public.can_publish_business_post(business_id))
  );

-- Editar: además valida el valor NUEVO (antes no había WITH CHECK)
drop policy if exists posts_update_own on public.posts;
create policy posts_update_own on public.posts
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (business_id is null or public.can_publish_business_post(business_id))
  );

-- Leer: las publicaciones de negocios verificados son públicas para cualquier usuario con sesión,
-- sin depender de la privacidad del perfil personal del dueño (salvo bloqueo entre personas)
drop policy if exists posts_read_business on public.posts;
create policy posts_read_business on public.posts
  for select to authenticated
  using (
    business_id is not null
    and exists (
      select 1 from public.businesses b
      where b.id = posts.business_id and b.status = 'verified'
    )
    and not public.is_blocked((select auth.uid()), user_id)
  );
