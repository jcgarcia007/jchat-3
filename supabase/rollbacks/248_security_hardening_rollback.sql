-- 248 — REVERSIÓN de supabase/migrations/248_security_hardening.sql: vuelve a dejar las políticas y permisos como estaban (con sus fallos).
-- La aplica Juan Carlos por MCP solo si hay que deshacer la 248.

grant execute on function public.venue_presence_ok(uuid, uuid) to authenticated;

alter policy stories_read on public.stories using (true);
alter policy story_views_read_own_story on public.story_views using (true);
alter policy map_reactions_read on public.map_reactions using (true);
alter policy "reviews: author update" on public.reviews using (auth.uid() = user_id);

grant truncate, references, trigger on all tables in schema public to anon, authenticated;
alter default privileges in schema public grant truncate, references, trigger on tables to anon, authenticated;
