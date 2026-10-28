-- 248: security hardening found by the 2026-10-28 audit (docs/audits/2026-10-28/seguridad.md).
-- BORRADOR PARA REVISIÓN: NO está aplicada en Supabase. La aplica Juan Carlos por MCP.
-- Reversión: supabase/rollbacks/248_security_hardening_rollback.sql · Comprobación: supabase/scripts/248_check.sql
-- Demostración local (antes / después, dentro de una transacción que se revierte): supabase/tests/10_security_attacks.sql
--
-- Non-destructive and idempotent: only REVOKE, ALTER POLICY and ALTER DEFAULT PRIVILEGES (all repeatable). Nothing is dropped.
--
-- 1. venue_presence_ok(business, user) was callable by any signed-in user: "is THAT user at THAT venue right now?" for anyone. That breaks the
--    rule "never reveal anyone's real-time location". Every caller is a SECURITY DEFINER function (gift_available, venue_present_users,
--    check_in, venue_order_access, …), which runs it as its owner, so the grant to the API roles is not needed. No RLS policy uses it.
-- 2. Stories: stories_read was `true` — any signed-in user read EVERY story, including those of private accounts and of people who blocked
--    them (getActiveStories says "from users the viewer follows" but filters nothing: it relies on this policy). Now: your own, or the
--    author is not blocked with you and either not private or followed by you.
-- 3. story_views_read_own_story was `true` — anyone could see who viewed any story. Now: you are the viewer or the story's author.
-- 4. map_reactions_read was `true` — any signed-in user could read (user, venue, time) of every map reaction: a visit history. Now: your own,
--    the venue owner's, or people currently present at that venue (the reactions the map shows). The app only INSERTs reactions and broadcasts
--    the emoji over Realtime, it does not read the table.
-- 5. reviews: "author update" let the author write the column `response` (the venue's reply) of their own review. The authors have no
--    updatable column otherwise (the grant is response/responded_at only), so the policy has no legitimate use: it now matches nothing.
--    The venue owner's own policy ("business owner respond") is untouched.
-- 6. TRUNCATE / REFERENCES / TRIGGER were granted to anon and authenticated on every public table. RLS does not cover TRUNCATE, and the API
--    never uses these three; defence in depth, also for tables created later.

revoke execute on function public.venue_presence_ok(uuid, uuid) from public, anon, authenticated;

alter policy stories_read on public.stories using (
  user_id = (select auth.uid())
  or (
    not public.is_blocked((select auth.uid()), user_id)
    and (
      not public.is_private_account(user_id)
      or exists (select 1 from public.follows f where f.follower_id = (select auth.uid()) and f.following_id = stories.user_id)
    )
  )
);

alter policy story_views_read_own_story on public.story_views using (
  viewer_id = (select auth.uid())
  or exists (select 1 from public.stories s where s.id = story_views.story_id and s.user_id = (select auth.uid()))
);

alter policy map_reactions_read on public.map_reactions using (
  user_id = (select auth.uid())
  or exists (select 1 from public.businesses b where b.id = map_reactions.business_id and b.owner_id = (select auth.uid()))
  or exists (
    select 1 from public.room_geo_presence g join public.rooms r on r.id = g.room_id
    where r.business_id = map_reactions.business_id and g.user_id = (select auth.uid()) and g.expires_at > now()
  )
);

alter policy "reviews: author update" on public.reviews using (false);

revoke truncate, references, trigger on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke truncate, references, trigger on tables from anon, authenticated;
