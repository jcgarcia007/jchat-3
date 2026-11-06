#!/usr/bin/env bash
# Prueba LOCAL de supabase/scripts/review_seed.sql y review_unseed.sql. Todo dentro de UNA transacción que termina en ROLLBACK (la migración 262 se aplica
# dentro también). Solo contra el contenedor local.   bash supabase/scripts/test_review_seed_local.sh
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"
[ -S "$HOME/.docker/run/docker.sock" ] && export DOCKER_HOST="${DOCKER_HOST:-unix://$HOME/.docker/run/docker.sock}"
C="${SQL_TEST_CONTAINER:-supabase_db_jchat-local}"
case "$C" in *local*) ;; *) echo "REFUSING: container $C is not a local one"; exit 2 ;; esac
docker inspect "$C" >/dev/null 2>&1 || { echo "local database is not running (bash loadtest/local-up.sh)"; exit 2; }

{
cat <<'SQL'
begin;
SQL
cat "$ROOT/supabase/migrations/262_review_mode.sql"
cat <<'SQL'
create temp table t_out (ok boolean, name text) on commit drop;
grant all on t_out to public;
create function pg_temp.chk(c boolean, n text) returns void language sql as $$ insert into t_out values (coalesce(c, false), n) $$;

-- fixtures: the 5 real accounts, the Demo Lounge, its room, the games and a few interests (a bare local DB has none of them)
insert into auth.users (id, instance_id, aud, role, email)
select ('f0000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rs' || n || '@example.invalid' from generate_series(1, 5) n;
insert into public.users (id, username)
select ('f0000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid, (array['jchatreview','jchatreview2','test','test1','test002'])[n] from generate_series(1, 5) n
on conflict (id) do update set username = excluded.username;
set local session_replication_role = replica;
insert into public.businesses (id, owner_id, name, slug, lat, lng) values ('f1000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 'JChat Demo Lounge', 'jchat-demo-lounge-y7of', 26.0872319, -80.2303233);
set local session_replication_role = origin;
insert into public.rooms (id, business_id, name, is_main) values ('f1000000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000001', 'Main Room', true);
insert into public.games (key, name_es, name_en) select k, k, k from unnest(array['match','truth_or_dare']) k where not exists (select 1 from public.games g where g.key = k);
insert into public.interests (key, name_es, name_en)
select k, k, k from unnest(array['music','coffee','movies','food','travel','gaming','nature','books','karaoke','dancing','wine']) k on conflict do nothing;
insert into public.menu_categories (id, business_id, name) values ('f1000000-0000-4000-8000-0000000000c1', 'f1000000-0000-4000-8000-000000000001', 'Food');
insert into public.menu_items (category_id, business_id, name, price_cents) select 'f1000000-0000-4000-8000-0000000000c1', 'f1000000-0000-4000-8000-000000000001', 'Item ' || n, 500 from generate_series(1, 4) n;

SQL
cat "$ROOT/supabase/scripts/review_seed.sql"
cat "$ROOT/supabase/scripts/review_seed.sql"   # idempotent: twice
cat <<'SQL'
select pg_temp.chk((select count(*) from public.review_group_members where note = 'review-seed') = 5, '5 real accounts in the group');
select pg_temp.chk((select count(*) from public.review_group_members where kind = 'reviewer') = 2, '2 reviewers, 3 qa real + 4 fictional');
select pg_temp.chk((select count(*) from public.review_group_members where kind = 'qa') = 7, 'qa = 3 real + 4 fictional');
select pg_temp.chk((select count(*) from public.review_group_businesses where status = 'active') = 1, 'the venue is in the group');
select pg_temp.chk((select count(*) from public.users where is_test and id::text like 'd4000000-%') = 4, '4 fictional people with is_test');
select pg_temp.chk((select count(*) from public.business_games where enabled and business_id = 'f1000000-0000-4000-8000-000000000001') = 2, 'Match and Truth or Dare on');
select pg_temp.chk((select count(*) from public.messages where id::text like 'd4000000-%') = 3, '3 messages (not duplicated by the second run)');
select pg_temp.chk((select count(*) from public.offers where id::text like 'd4000000-%' and is_active) = 2, '2 offers');
select pg_temp.chk((select count(*) from public.menu_items where business_id = 'f1000000-0000-4000-8000-000000000001') = 6, 'menu completed to 6 items');
select pg_temp.chk((select count(*) from public.room_geo_presence where user_id::text like 'd4000000-%') = 4, 'presence for the 4 people');
select pg_temp.chk((select count(*) from public.match_presence where user_id::text like 'd4000000-%' and active_since is not null) = 4, 'match presence for the 4 people');
select pg_temp.chk((select count(*) from public.match_photos where id::text like 'd4000000-%' and status = 'approved') = 4, '4 approved placeholder photos');
select pg_temp.chk((select count(*) from public.match_profiles where user_id = 'f0000000-0000-4000-8000-000000000002') = 1, 'reviewer 2 has a match profile');
select pg_temp.chk((select count(*) from public.review_bypass_log) = 0, 'the seed writes no bypass log');
select pg_temp.chk(not public.review_mode_active(), 'the seed does NOT turn the switch on');
-- real people never match a fictional person: a user outside the group is not in the group
select pg_temp.chk(not public.review_is_member('f0000000-0000-4000-8000-0000000000ff'), 'an unknown user is not in the group');

-- reviewer 2 (as the app does when joining Match: opt-in + presence) sees the 4 fictional people in the Match deck
insert into public.game_optins (user_id, business_id, game_key) values ('f0000000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000001', 'match');
insert into public.match_presence (user_id, business_id, expires_at, active_since, method) values ('f0000000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000001', now() + interval '15 minutes', now(), 'geo');
select set_config('request.jwt.claims', '{"sub":"f0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select pg_temp.chk(jsonb_array_length(public.match_get_deck('f1000000-0000-4000-8000-000000000001', 20)) = 4, 'Match deck of reviewer 2: the 4 fictional people');
reset role;

-- the unseed removes only what was seeded
insert into public.messages (room_id, user_id, body) values ('f1000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000003', 'real message');
SQL
cat "$ROOT/supabase/scripts/review_unseed.sql"
cat <<'SQL'
select pg_temp.chk((select count(*) from public.users where id::text like 'd4000000-%') = 0, 'unseed: fictional people gone');
select pg_temp.chk((select count(*) from auth.users where id::text like 'd4000000-%') = 0, 'unseed: fictional auth users gone');
select pg_temp.chk((select count(*) from public.offers where id::text like 'd4000000-%') = 0 and (select count(*) from public.messages where id::text like 'd4000000-%') = 0, 'unseed: offers and messages gone');
select pg_temp.chk((select count(*) from public.menu_items where business_id = 'f1000000-0000-4000-8000-000000000001') = 4, 'unseed: back to the 4 original menu items');
select pg_temp.chk((select count(*) from public.messages where body = 'real message') = 1, 'unseed: a real message stays');
select pg_temp.chk((select count(*) from public.users where username in ('jchatreview','jchatreview2','test','test1','test002')) = 5, 'unseed: the 5 real accounts stay');
select pg_temp.chk((select count(*) from public.review_group_members where note = 'review-seed') = 5, 'unseed: real accounts stay in the group');
select pg_temp.chk((select count(*) from public.businesses where slug = 'jchat-demo-lounge-y7of') = 1, 'unseed: the venue stays');
select 'RESULT|' || ok || '|' || name from t_out;
rollback;
SQL
} | docker exec -i "$C" psql -U postgres -d postgres -At -v ON_ERROR_STOP=1 2>&1 | grep -E "^RESULT|ERROR|DETAIL|CONTEXT" | sed -e 's/RESULT|true|/  ✓ /' -e 's/RESULT|false|/  ✗ /'
