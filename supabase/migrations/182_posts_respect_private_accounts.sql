-- 182: las publicaciones personales de una cuenta PRIVADA solo las ven el dueño y sus seguidores
-- (además de la preferencia whoSeesMyPosts y el bloqueo, que ya se aplicaban)

drop policy if exists posts_read on public.posts;
create policy posts_read on public.posts
  for select to authenticated
  using (
    public.can_view_user_content((select auth.uid()), user_id, 'whoSeesMyPosts'::text)
    and not public.is_blocked((select auth.uid()), user_id)
    and (
      user_id = (select auth.uid())
      or not public.is_private_account(user_id)
      or exists (
        select 1 from public.follows f
        where f.follower_id = (select auth.uid()) and f.following_id = posts.user_id
      )
    )
  );
-- posts_read_business (publicaciones de negocio verificadas) no cambia: siguen siendo públicas.
