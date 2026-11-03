-- match_join_venue (256): the ONLY entry to Match. The heartbeat (match_check_in) never creates the opt-in again after "Leave Match" (audit B5-1).
do $t$
declare
  biz constant uuid := pg_temp.seed_venue();
  u2 uuid := pg_temp.seed_user(2); u3 uuid := pg_temp.seed_user(3); u4 uuid := pg_temp.seed_user(4);
  r jsonb; n int; n_presence int; readings_before int; readings_after int; inserters text[];
begin
  if to_regprocedure('public.match_join_venue(uuid,double precision,double precision,text,boolean)') is null then
    perform pg_temp.t_skip('match_join_venue', 'migration 256 not applied in this database');
    return;
  end if;
  if not exists (select 1 from public.games where key = 'match') then
    perform pg_temp.t_skip('match_join_venue', 'the games catalog has no "match" row in this database');
    return;
  end if;

  -- Match is on at the venue and the people are adults who are inside the venue
  update public.games set is_active = true where key = 'match';
  insert into public.business_games (business_id, game_key, enabled) values (biz, 'match', true)
    on conflict (business_id, game_key) do update set enabled = true;
  update public.users set age_confirmed_at = now() where id in (u2, u3, u4);
  perform pg_temp.present(u2); perform pg_temp.present(u4);   -- u3 is NOT in the venue

  -- 1. The heartbeat without an opt-in: denied/not_joined and NOTHING is written
  perform pg_temp.as_user(u2);
  r := public.match_check_in(biz, 40.0, -74.0, null, false);
  perform pg_temp.as_service();
  select count(*) into n from public.game_optins where user_id = u2 and business_id = biz;
  select count(*) into n_presence from public.match_presence where user_id = u2 and business_id = biz;
  perform pg_temp.t_ok(r->>'status' = 'denied' and r->>'reason' = 'not_joined', 'match_check_in without opt-in → denied / not_joined', r::text);
  perform pg_temp.t_ok(n = 0, 'match_check_in never creates the opt-in');
  perform pg_temp.t_ok(n_presence = 0, 'match_check_in without opt-in writes no presence either');

  -- 2. The explicit entry creates the opt-in and the presence
  perform pg_temp.as_user(u2);
  r := public.match_join_venue(biz);
  perform pg_temp.as_service();
  select count(*) into n from public.game_optins where user_id = u2 and business_id = biz and game_key = 'match';
  select count(*), coalesce(max(readings), 0) into n_presence, readings_before from public.match_presence where user_id = u2 and business_id = biz;
  perform pg_temp.t_ok(r->>'status' = 'active', 'match_join_venue → active', r::text);
  perform pg_temp.t_ok(n = 1, 'match_join_venue creates the opt-in');
  perform pg_temp.t_ok(n_presence = 1, 'match_join_venue writes the presence');

  -- 3. Joining twice is harmless (one row)
  perform pg_temp.as_user(u2);
  perform public.match_join_venue(biz);
  perform pg_temp.as_service();
  select count(*) into n from public.game_optins where user_id = u2 and business_id = biz;
  perform pg_temp.t_ok(n = 1, 'joining twice keeps ONE opt-in row');

  -- 4. With the opt-in, the heartbeat renews the presence
  perform pg_temp.as_user(u2);
  r := public.match_check_in(biz, 40.0, -74.0, null, false);
  perform pg_temp.as_service();
  select readings into readings_after from public.match_presence where user_id = u2 and business_id = biz;
  perform pg_temp.t_ok(r->>'status' = 'active', 'the heartbeat of a person who joined → active', r::text);
  perform pg_temp.t_ok(readings_after > readings_before, 'the heartbeat renews the presence (readings go up)', readings_before || ' → ' || readings_after);

  -- 5. B5-1: leave, then the heartbeat runs again → the opt-in is NOT recreated
  perform pg_temp.as_user(u2);
  perform public.match_leave_venue(biz);
  perform pg_temp.as_service();
  select count(*) into n from public.game_optins where user_id = u2 and business_id = biz;
  perform pg_temp.t_ok(n = 0, 'match_leave_venue removes the opt-in');
  perform pg_temp.as_user(u2);
  r := public.match_check_in(biz, 40.0, -74.0, null, false);      -- the chat heartbeat after leaving
  r := public.match_check_in(biz, 40.0, -74.0, null, false);      -- and the next one
  perform pg_temp.as_service();
  select count(*) into n from public.game_optins where user_id = u2 and business_id = biz;
  select count(*) into n_presence from public.match_presence where user_id = u2 and business_id = biz;
  perform pg_temp.t_ok(r->>'reason' = 'not_joined', 'after leaving the heartbeat answers not_joined', r::text);
  perform pg_temp.t_ok(n = 0, 'after leaving, match_check_in does NOT recreate the opt-in (B5-1)');
  perform pg_temp.t_ok(n_presence = 0, 'after leaving, the heartbeat writes no presence');

  -- 6. Only an explicit entry brings the person back
  perform pg_temp.as_user(u2);
  r := public.match_join_venue(biz);
  perform pg_temp.as_service();
  select count(*) into n from public.game_optins where user_id = u2 and business_id = biz;
  perform pg_temp.t_ok(n = 1 and r->>'status' = 'active', 'an explicit join after leaving works');

  -- 7. Without presence in the venue the join fails and nothing is created
  perform pg_temp.as_user(u3);
  r := public.match_join_venue(biz);
  perform pg_temp.as_service();
  select count(*) into n from public.game_optins where user_id = u3 and business_id = biz;
  perform pg_temp.t_ok(r->>'status' = 'denied' and r->>'reason' = 'not_in_venue', 'join without presence in the venue → denied / not_in_venue', r::text);
  perform pg_temp.t_ok(n = 0, 'a denied join creates no opt-in');

  -- 8. "Take part in games" off → denied, no opt-in
  update public.users set settings = coalesce(settings, '{}'::jsonb) || '{"gamesEnabled": false}'::jsonb where id = u4;
  perform pg_temp.as_user(u4);
  r := public.match_join_venue(biz);
  perform pg_temp.as_service();
  select count(*) into n from public.game_optins where user_id = u4 and business_id = biz;
  perform pg_temp.t_ok(r->>'reason' = 'games_disabled' and n = 0, 'join with games turned off → denied / games_disabled, no opt-in', r::text);

  -- 9. Not signed in
  perform pg_temp.as_service();
  perform pg_temp.t_raises(format('select public.match_join_venue(%L)', biz), 'not_authenticated', 'join without a session raises not_authenticated');

  -- 10. The internal function is not callable by a client; a client cannot insert the opt-in by itself either
  perform pg_temp.as_user(u2);
  perform pg_temp.t_raises(format('select public.match_presence_core(%L, null, null, null, false, false)', biz), 'permission denied', 'a client cannot call match_presence_core');
  perform pg_temp.t_raises(format('insert into public.game_optins (user_id, business_id, game_key) values (%L, %L, ''match'')', u4, biz), 'row-level security', 'a client cannot insert into game_optins');
  perform pg_temp.as_service();

  -- 11. match_join_venue is the ONLY function that inserts into game_optins
  select array_agg(p.proname::text order by p.proname) into inserters
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.prosrc ilike '%insert into%game_optins%';
  perform pg_temp.t_ok(inserters = array['match_join_venue'], 'match_join_venue is the only function that inserts into game_optins', inserters::text);
end
$t$;
