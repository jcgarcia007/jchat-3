-- ============================================================
-- JChat 3.0 — Social Fase C: posts/feed aplican visibilidad + bucket separado
-- Ref: docs/PLAN_MAESTRO_SOCIAL.md (Módulo C). Depende de 040 (helpers
-- can_view_user_content / is_blocked). NO toca insert/update/delete (ya son
-- user_id = auth.uid()). v1: SOLO el setting global whoSeesMyPosts (sin columna
-- posts.visibility por-post — decisión #5).
-- ============================================================

-- ---------- C.1: bucket 'profile-media' (posts PERMANENTES) ----------
-- Separado de 'post-media' (que queda exclusivo del chat efímero, TTL 24h) para
-- que la purga del chat nunca borre fotos de posts permanentes.
insert into storage.buckets (id, name, public)
  values ('profile-media', 'profile-media', true)
  on conflict (id) do nothing;

-- RLS de Storage — mismo patrón que avatars/covers/post-media:
--   lectura pública; subir por prefijo {auth.uid()}/...; update/delete por owner.
create policy "storage: public read profile-media" on storage.objects
  for select using (bucket_id = 'profile-media');

create policy "storage: user upload profile-media" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'profile-media' and (storage.foldername(name))[1] = (auth.uid())::text);

create policy "storage: user update profile-media" on storage.objects
  for update to authenticated
  using (bucket_id = 'profile-media' and owner = auth.uid());

create policy "storage: user delete profile-media" on storage.objects
  for delete to authenticated
  using (bucket_id = 'profile-media' and owner = auth.uid());

-- ---------- C.2 + C.4: aplicar visibilidad en las RLS de lectura ----------
-- posts_read: hoy `true`. Un post es visible si puedo ver el contenido del autor
-- según su setting whoSeesMyPosts (everyone/followers/nobody) y no hay bloqueo.
-- can_view_user_content ya incluye el chequeo de bloqueo; el AND NOT is_blocked
-- se deja explícito por claridad (redundante y barato).
drop policy if exists "posts_read" on public.posts;
create policy "posts_read" on public.posts for select to authenticated
  using (
    public.can_view_user_content(auth.uid(), user_id, 'whoSeesMyPosts')
    and not public.is_blocked(auth.uid(), user_id)
  );

-- comments_read: solo si puedo ver el post padre (mismo criterio). El EXISTS es
-- self-contained (no depende de que RLS filtre la subconsulta).
drop policy if exists "comments_read" on public.comments;
create policy "comments_read" on public.comments for select to authenticated
  using (
    exists (
      select 1 from public.posts p
      where p.id = comments.post_id
        and public.can_view_user_content(auth.uid(), p.user_id, 'whoSeesMyPosts')
        and not public.is_blocked(auth.uid(), p.user_id)
    )
  );

-- post_likes_read: mismo patrón sobre el post padre.
drop policy if exists "post_likes_read" on public.post_likes;
create policy "post_likes_read" on public.post_likes for select to authenticated
  using (
    exists (
      select 1 from public.posts p
      where p.id = post_likes.post_id
        and public.can_view_user_content(auth.uid(), p.user_id, 'whoSeesMyPosts')
        and not public.is_blocked(auth.uid(), p.user_id)
    )
  );

-- NOTA C.3 (feed): sin cambios de esquema. FeedScreen ya arma followingIds desde
-- `follows` (= aristas ACEPTADAS tras Fase A) y posts_read es ahora la autoridad
-- de visibilidad. El muro personal (getUserPosts) hereda la misma RLS.
-- NOTA (saved_posts / tab Saved): diferido a cuando se construya la UI del tab.
