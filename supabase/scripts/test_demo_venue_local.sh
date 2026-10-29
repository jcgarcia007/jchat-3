#!/usr/bin/env bash
# Prueba LOCAL del seed y del teardown del local de demostración (supabase/scripts/demo_venue_*.sql).
# Solo contra el contenedor de la base local (loadtest/local-up.sh); se niega a correr contra otra cosa.
#   bash supabase/scripts/test_demo_venue_local.sh
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"
[ -S "$HOME/.docker/run/docker.sock" ] && export DOCKER_HOST="${DOCKER_HOST:-unix://$HOME/.docker/run/docker.sock}"
C="${SQL_TEST_CONTAINER:-supabase_db_jchat-local}"
case "$C" in *local*) ;; *) echo "REFUSING: container $C is not a local one"; exit 2 ;; esac
docker inspect "$C" >/dev/null 2>&1 || { echo "local database is not running (bash loadtest/local-up.sh)"; exit 2; }
psq() { docker exec -i "$C" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -At "$@"; }

REVIEWER='f0000000-0000-4000-8000-0000000000a1'
STRANGER='f0000000-0000-4000-8000-0000000000a2'
BIZ='d3000000-0000-4000-8000-000000000001'
ROOM='d3000000-0000-4000-8000-000000000002'
fail=0
ok()  { echo "  ✓ $1"; }
bad() { echo "  ✗ $1"; fail=$((fail + 1)); }
check() { if [ "$2" = "$3" ]; then ok "$1"; else bad "$1 (got '$2', expected '$3')"; fi; }

seed()     { sed "s/:reviewer_user_id/$REVIEWER/" "$ROOT/supabase/scripts/demo_venue_seed.sql" | psq >/dev/null; }
teardown() { psq < "$ROOT/supabase/scripts/demo_venue_teardown.sql" >/dev/null; }

echo "── people for the test (a reviewer and a stranger, both synthetic)"
psq >/dev/null <<SQL
insert into auth.users (id, instance_id, aud, role, email) values
  ('$REVIEWER','00000000-0000-0000-0000-000000000000','authenticated','authenticated','reviewer-test@example.invalid'),
  ('$STRANGER','00000000-0000-0000-0000-000000000000','authenticated','authenticated','stranger-test@example.invalid') on conflict do nothing;
insert into public.users (id, username) values ('$REVIEWER','reviewer_test'),('$STRANGER','stranger_test') on conflict do nothing;
SQL

# a bare local database has no game catalog (production does): add the two games for the test and remove them at the end if we added them
GAMES_ADDED="$(psq -c "insert into public.games (key, name_es, name_en) select k, k, k from unnest(array['match','truth_or_dare']) k where not exists (select 1 from public.games g where g.key = k) returning key" | tr '\n' ' ')"

echo "── marker left unreplaced is refused"
if psq < "$ROOT/supabase/scripts/demo_venue_seed.sql" >/dev/null 2>&1; then bad "the seed ran with the marker :reviewer_user_id still in it"; else ok "the seed stops with a clear error when the marker is not replaced"; fi

echo "── seed twice"
seed && ok "first seed" || bad "first seed"
seed && ok "second seed (idempotent)" || bad "second seed"
check "1 business" "$(psq -c "select count(*) from public.businesses where id='$BIZ'")" 1
check "owner is the reviewer" "$(psq -c "select owner_id from public.businesses where id='$BIZ'")" "$REVIEWER"
check "verified and active" "$(psq -c "select status||is_verified::text||is_active::text from public.businesses where id='$BIZ'")" "verifiedtruetrue"
check "subdomain jchat-demo" "$(psq -c "select subdomain from public.businesses where id='$BIZ'")" jchat-demo
check "Apple Park coordinates" "$(psq -c "select round(lat::numeric,4)||','||round(lng::numeric,4) from public.businesses where id='$BIZ'")" "37.3349,-122.0090"
check "open 24 h every day" "$(psq -c "select count(*) from jsonb_each((select hours from public.businesses where id='$BIZ')) h where h.value->>'open'='00:00' and h.value->>'close'='23:59' and h.value->>'closed'='false'")" 7
check "6 tables T1-T6" "$(psq -c "select string_agg(label, ',' order by sort) from public.tables where business_id='$BIZ'")" "T1,T2,T3,T4,T5,T6"
check "10 menu items" "$(psq -c "select count(*) from public.menu_items where business_id='$BIZ'")" 10
check "2 items with id_required" "$(psq -c "select count(*) from public.menu_items where business_id='$BIZ' and id_required")" 2
check "1 main room" "$(psq -c "select count(*) from public.rooms where business_id='$BIZ' and is_main")" 1
check "4 test people" "$(psq -c "select count(*) from public.users where is_test and id::text like 'd3000000-%'")" 4
check "8 messages" "$(psq -c "select count(*) from public.messages where room_id='$ROOM'")" 8
check "Match and Truth or Dare on" "$(psq -c "select count(*) from public.business_games where business_id='$BIZ' and enabled")" 2
check "presence for the reviewer and the 4 people" "$(psq -c "select count(*) from public.room_geo_presence where room_id='$ROOM' and expires_at > now() + interval '13 days'")" 5
check "the reviewer passes venue_presence_ok (gifts, Match, Truth or Dare need it)" "$(psq -c "select public.venue_presence_ok('$BIZ', '$REVIEWER')")" t
check "reviewer got a plan that allows a business" "$(psq -c "select plan from public.users where id='$REVIEWER'")" business

echo "── the reviewer enters the venue chat with NO location (far away: London); a stranger from there is refused"
as_user() { psq <<SQL | grep -E '^(true|false),' | tail -1
begin;
select set_config('request.jwt.claims','{"sub":"$1","role":"authenticated"}',true);
select access_granted||','||is_owner||','||reason from public.check_geofence_and_join_room('$ROOM', 51.5072, -0.1276);
rollback;
SQL
}
check "reviewer: access as owner" "$(as_user $REVIEWER)" "true,true,owner"
gift_ok() { psq <<SQL | grep -E '^(t|f)$' | tail -1
begin;
select set_config('request.jwt.claims','{"sub":"$REVIEWER","role":"authenticated"}',true);
select public.gift_available('$BIZ', 'd3000000-0000-4000-8000-000000000301');
rollback;
SQL
}
check "reviewer can gift a demo person (gift_available)" "$(gift_ok)" t
check "stranger: refused outside the radius" "$(as_user $STRANGER | cut -d, -f1,3)" "false,outside_radius"

echo "── teardown twice"
teardown && ok "first teardown" || bad "first teardown"
teardown && ok "second teardown (idempotent)" || bad "second teardown"
check "business gone" "$(psq -c "select count(*) from public.businesses where id='$BIZ'")" 0
check "test people gone" "$(psq -c "select count(*) from public.users where id::text like 'd3000000-%'")" 0
check "menu, tables and messages gone" "$(psq -c "select (select count(*) from public.menu_items where business_id='$BIZ')+(select count(*) from public.tables where business_id='$BIZ')+(select count(*) from public.messages where room_id='$ROOM')")" 0
check "reviewer account untouched" "$(psq -c "select count(*) from public.users where id='$REVIEWER'")" 1

echo "── seed → teardown once more, then clean the test people"
seed && teardown && ok "seed then teardown" || bad "seed then teardown"
[ -n "$GAMES_ADDED" ] && psq >/dev/null -c "delete from public.games where key in ('match','truth_or_dare')"
psq >/dev/null -c "delete from public.users where id in ('$REVIEWER','$STRANGER'); delete from auth.users where id in ('$REVIEWER','$STRANGER');"

echo
if [ "$fail" -eq 0 ]; then echo "demo venue: all checks passed"; else echo "demo venue: $fail check(s) FAILED"; exit 1; fi
