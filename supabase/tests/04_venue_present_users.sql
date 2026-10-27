-- venue_present_users (243): privacy filter of the room's header list.
do $t$
declare
  biz constant uuid := pg_temp.seed_venue();
  u1 uuid := pg_temp.uid(1); u2 uuid := pg_temp.seed_user(2); u3 uuid := pg_temp.seed_user(3); u4 uuid := pg_temp.seed_user(4); u5 uuid := pg_temp.seed_user(5);
  res uuid[]; ids uuid[]; i int; other_biz uuid := '20000000-0000-4000-8000-000000000001';
begin
  if to_regprocedure('public.venue_present_users(uuid,uuid[])') is null then
    perform pg_temp.t_skip('venue_present_users', 'migration 243 not applied in this database');
    return;
  end if;
  perform pg_temp.present(u1); perform pg_temp.present(u2); perform pg_temp.present(u3);
  insert into public.room_geo_presence (room_id, user_id, expires_at) values ('10000000-0000-4000-8000-0000000000a1', u4, now() - interval '1 minute');  -- expired

  -- the asker (u2) is in the venue: confirmed people come back, absent / expired ones do not
  perform pg_temp.as_user(u2);
  res := public.venue_present_users(biz, array[u1, u2, u3, u4, u5]);
  perform pg_temp.as_service();
  perform pg_temp.t_ok(res @> array[u1, u2, u3] and cardinality(res) = 3, 'returns exactly the people with live presence (me included)', res::text);
  perform pg_temp.t_ok(not (u4 = any(res)), 'expired presence is removed');
  perform pg_temp.t_ok(not (u5 = any(res)), 'a person with no presence at all is removed');

  -- never invents ids
  perform pg_temp.as_user(u2);
  res := public.venue_present_users(biz, array[u2]);
  perform pg_temp.as_service();
  perform pg_temp.t_ok(res = array[u2], 'only the ids that were asked come back', res::text);

  -- duplicates and nulls
  perform pg_temp.as_user(u2);
  res := public.venue_present_users(biz, array[u1, u1, null, u1, u2]::uuid[]);
  perform pg_temp.as_service();
  perform pg_temp.t_ok(cardinality(res) = 2, 'duplicates collapse and nulls are ignored', res::text);

  -- asker NOT confirmed in the venue → empty (a venue cannot be probed from outside)
  perform pg_temp.as_user(u5);
  res := public.venue_present_users(biz, array[u1, u2, u3]);
  perform pg_temp.as_service();
  perform pg_temp.t_ok(res = '{}', 'asker outside the venue → empty', res::text);
  perform pg_temp.as_user(u4);
  res := public.venue_present_users(biz, array[u1, u2, u3]);
  perform pg_temp.as_service();
  perform pg_temp.t_ok(res = '{}', 'asker with EXPIRED presence → empty', res::text);

  -- presence in ANOTHER venue does not count
  set local session_replication_role = replica;   -- the plan-limit trigger would refuse a second business
  insert into public.businesses (id, owner_id, name, slug) values (other_biz, u3, 'Other', 'other-sql-test');
  set local session_replication_role = origin;
  perform pg_temp.as_user(u2);
  res := public.venue_present_users(other_biz, array[u1, u2, u3]);
  perform pg_temp.as_service();
  perform pg_temp.t_ok(res = '{}', 'asking about a venue where the asker is not present → empty', res::text);

  -- no session / nulls
  res := public.venue_present_users(biz, array[u1, u2]);
  perform pg_temp.t_ok(res = '{}', 'no session (auth.uid() null) → empty', res::text);
  perform pg_temp.as_user(u2);
  perform pg_temp.t_ok(public.venue_present_users(null, array[u1]) = '{}', 'null business → empty');
  perform pg_temp.t_ok(public.venue_present_users(biz, null) = '{}', 'null list → empty');
  perform pg_temp.t_ok(public.venue_present_users(biz, '{}') = '{}', 'empty list → empty');
  perform pg_temp.as_service();

  -- blocks, in both directions
  insert into public.blocks (blocker_id, blocked_id) values (u2, u1), (u3, u2);
  perform pg_temp.as_user(u2);
  res := public.venue_present_users(biz, array[u1, u2, u3]);
  perform pg_temp.as_service();
  perform pg_temp.t_ok(res = array[u2], 'someone I blocked AND someone who blocked me are both removed', res::text);
  delete from public.blocks;

  -- at most 100 ids: only the first 100 positions are considered, the rest is cut
  for i in 100..260 loop perform pg_temp.seed_user(i); perform pg_temp.present(pg_temp.uid(i)); end loop;
  ids := array[u2]::uuid[] || array(select pg_temp.uid(g) from generate_series(100, 260) g order by g);   -- 162 ids, all present
  perform pg_temp.as_user(u2);
  res := public.venue_present_users(biz, ids);
  perform pg_temp.as_service();
  perform pg_temp.t_ok(cardinality(res) = 100, '162 ids asked → 100 returned (cap)', cardinality(res)::text);
  perform pg_temp.t_ok(res @> ids[1:100], 'the 100 returned are exactly the first 100 asked');
  perform pg_temp.t_ok(not (ids[101] = any(res)) and not (ids[162] = any(res)), 'ids after position 100 are cut');
end
$t$;
