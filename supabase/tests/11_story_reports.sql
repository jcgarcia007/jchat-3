-- 250 (draft): stories can be reported and hidden. LOCAL ONLY. One rolled-back transaction (see _helpers.sql).
-- Phase BEFORE shows today's behaviour (report_content refuses 'story'); AFTER applies 250 and shows the new one.
select pg_temp.seed_user(1);  -- public author
select pg_temp.seed_user(2);  -- viewer
select pg_temp.seed_user(3);  -- private author (not followed by 2)
select pg_temp.seed_user(4);  -- author who blocked 2
select pg_temp.seed_user(5);  -- platform admin

do $$
begin
  update public.users set is_private = true where id = pg_temp.uid(3);
  insert into public.blocks (blocker_id, blocked_id) values (pg_temp.uid(4), pg_temp.uid(2));
  insert into public.admin_roles (user_id, role) values (pg_temp.uid(5), 'super_admin');
  insert into public.stories (id, user_id, media_url) values
    ('a1000000-0000-4000-8000-000000000001', pg_temp.uid(1), 'x/public.jpg'),
    ('a1000000-0000-4000-8000-000000000003', pg_temp.uid(3), 'x/private.jpg'),
    ('a1000000-0000-4000-8000-000000000004', pg_temp.uid(4), 'x/blocker.jpg');
end $$;

-- BEFORE
select pg_temp.as_user(pg_temp.uid(2));
select pg_temp.t_raises($$select public.report_content('story', 'a1000000-0000-4000-8000-000000000001', 'spam')$$, 'invalid_content_type',
  'BEFORE · a story cannot be reported yet (flaw present today)');
select pg_temp.as_service();

-- @apply 250_story_reports.sql

-- AFTER
select pg_temp.as_user(pg_temp.uid(2));
select pg_temp.t_ok((select public.report_content('story', 'a1000000-0000-4000-8000-000000000001', 'spam')) is not null,
  'AFTER · a viewer can report a public story');
select pg_temp.t_ok(
  (select public.report_content('story', 'a1000000-0000-4000-8000-000000000001', 'spam'))
  = (select id from public.reports where content_type = 'story' and content_id = 'a1000000-0000-4000-8000-000000000001' and reporter_id = pg_temp.uid(2)),
  'AFTER · reporting twice returns the same report (no duplicate)');
select pg_temp.t_raises($$select public.report_content('story', 'a1000000-0000-4000-8000-000000000003', 'spam')$$, 'not_found',
  'AFTER · a story of a PRIVATE account you do not follow cannot be reported (you cannot see it)');
select pg_temp.t_raises($$select public.report_content('story', 'a1000000-0000-4000-8000-000000000004', 'spam')$$, 'not_found',
  'AFTER · a story of someone who blocked you cannot be reported');
select pg_temp.t_raises($$select public.report_content('story', 'a1000000-0000-4000-8000-000000000001', 'bogus')$$, 'invalid_reason',
  'AFTER · invalid reason still refused');
select pg_temp.t_ok((select count(*) from public.stories where id = 'a1000000-0000-4000-8000-000000000001') = 1,
  'AFTER · the viewer still sees the public story');
select pg_temp.as_user(pg_temp.uid(1));
select pg_temp.t_raises($$select public.report_content('story', 'a1000000-0000-4000-8000-000000000001', 'spam')$$, 'invalid_target',
  'AFTER · you cannot report your own story');

-- moderation hides it: the viewer stops seeing it, the author still does
select pg_temp.as_user(pg_temp.uid(5));
select pg_temp.t_ok((select public.admin_report_content_exists('story', 'a1000000-0000-4000-8000-000000000001')),
  'AFTER · admin_report_content_exists knows stories');
select public.admin_hide_content('story', 'a1000000-0000-4000-8000-000000000001');
select pg_temp.as_user(pg_temp.uid(2));
select pg_temp.t_ok((select count(*) from public.stories where id = 'a1000000-0000-4000-8000-000000000001') = 0,
  'AFTER · a hidden story disappears for other people');
select pg_temp.as_user(pg_temp.uid(1));
select pg_temp.t_ok((select count(*) from public.stories where id = 'a1000000-0000-4000-8000-000000000001') = 1,
  'AFTER · its author still sees it');
select pg_temp.as_service();
