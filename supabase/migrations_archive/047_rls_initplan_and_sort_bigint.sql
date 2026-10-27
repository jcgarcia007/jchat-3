-- 047_rls_initplan_and_sort_bigint.sql
-- Auditoría senior 2026-07-09 — escalabilidad E1 + E5.
--
-- E1: las 6 policies SELECT del sistema social llamaban auth.uid() SIN envolver, así
--     que Postgres lo re-evaluaba POR FILA (junto con los helpers SECURITY DEFINER que
--     hacen subqueries → O(n) de subqueries en listados grandes). Envolver en
--     (select auth.uid()) fuerza initPlan: se evalúa UNA vez por statement. La LÓGICA
--     es idéntica — verificado contra el qual real antes de reescribir; la única
--     diferencia es el wrap.
--
-- E5: menu_item_photos.sort ya contiene 1,783,286,940 (un Date.now()) — cerca de
--     desbordar int4 (máx 2,147,483,647). Se migran las columnas sort de menú (+ rooms)
--     a bigint por consistencia y para prevenir el mismo bug.
--
-- NO se tocan los helpers STABLE (is_blocked, can_view_profile, can_view_user_content,
-- can_access_room) ni la policy "messages: authenticated read": esa usa
-- can_access_room(room_id), que llama auth.uid() INTERNAMENTE (no en el texto de la
-- policy) y ya es STABLE → el wrap no aplica ahí.

-- ─────────────────────────────────────────────────────────────────────────────
-- E1 — initPlan wrap en las 6 policies SELECT (lógica idéntica, solo el wrap).
-- ─────────────────────────────────────────────────────────────────────────────

drop policy if exists posts_read on public.posts;
create policy posts_read on public.posts
  for select to authenticated
  using (
    can_view_user_content((select auth.uid()), user_id, 'whoSeesMyPosts')
    and not is_blocked((select auth.uid()), user_id)
  );

drop policy if exists comments_read on public.comments;
create policy comments_read on public.comments
  for select to authenticated
  using (
    exists (
      select 1 from posts p
      where p.id = comments.post_id
        and can_view_user_content((select auth.uid()), p.user_id, 'whoSeesMyPosts')
        and not is_blocked((select auth.uid()), p.user_id)
    )
  );

drop policy if exists post_likes_read on public.post_likes;
create policy post_likes_read on public.post_likes
  for select to authenticated
  using (
    exists (
      select 1 from posts p
      where p.id = post_likes.post_id
        and can_view_user_content((select auth.uid()), p.user_id, 'whoSeesMyPosts')
        and not is_blocked((select auth.uid()), p.user_id)
    )
  );

drop policy if exists follows_read on public.follows;
create policy follows_read on public.follows
  for select to authenticated
  using (
    can_view_profile((select auth.uid()), follower_id)
    or can_view_profile((select auth.uid()), following_id)
  );

drop policy if exists dm_conv_read on public.dm_conversations;
create policy dm_conv_read on public.dm_conversations
  for select to authenticated
  using (
    ((user_a = (select auth.uid())) or (user_b = (select auth.uid())))
    and not is_blocked(
      (select auth.uid()),
      case when user_a = (select auth.uid()) then user_b else user_a end
    )
  );

drop policy if exists dm_msg_read on public.dm_messages;
create policy dm_msg_read on public.dm_messages
  for select to authenticated
  using (
    exists (
      select 1 from dm_conversations c
      where c.id = dm_messages.conversation_id
        and ((c.user_a = (select auth.uid())) or (c.user_b = (select auth.uid())))
        and not is_blocked(
          (select auth.uid()),
          case when c.user_a = (select auth.uid()) then c.user_b else c.user_a end
        )
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- E5 — columnas sort a bigint (default 0 se conserva; valores existentes caben).
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.menu_item_photos          alter column sort type bigint;
alter table public.menu_items                 alter column sort type bigint;
alter table public.menu_categories            alter column sort type bigint;
alter table public.modifier_groups            alter column sort type bigint;
alter table public.menu_item_modifier_groups  alter column sort type bigint;
alter table public.rooms                       alter column sort type bigint;
