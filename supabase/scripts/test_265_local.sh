#!/usr/bin/env bash
# Prueba LOCAL de la migración 265 (cierre de locales al borrar la cuenta de un dueño). TODO dentro de UNA transacción que termina en ROLLBACK
# (la 262 y la 265 se aplican dentro; la 265 dos veces: idempotente). Solo contra el contenedor local.   bash supabase/scripts/test_265_local.sh
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"
[ -S "$HOME/.docker/run/docker.sock" ] && export DOCKER_HOST="${DOCKER_HOST:-unix://$HOME/.docker/run/docker.sock}"
C="${SQL_TEST_CONTAINER:-supabase_db_jchat-local}"
case "$C" in *local*) ;; *) echo "REFUSING: container $C is not a local one"; exit 2 ;; esac
docker inspect "$C" >/dev/null 2>&1 || { echo "local database is not running (bash loadtest/local-up.sh)"; exit 2; }

TMP=$(mktemp)
{
cat <<'SQL'
\set ON_ERROR_STOP on
begin;
SQL
cat "$ROOT/supabase/migrations/262_review_mode.sql"
cat "$ROOT/supabase/migrations/265_owner_account_close.sql"
cat "$ROOT/supabase/migrations/265_owner_account_close.sql"
cat <<'SQL'
create temp table t_out (ok boolean, name text) on commit drop;
grant all on t_out to public;
create function pg_temp.chk(c boolean, n text) returns void language sql as $$ insert into t_out values (coalesce(c, false), n) $$;

-- people: O owner, E employee (accepted), P employee (pending invite), C customer with a future reservation, D customer with a past one, X bystander owner
insert into auth.users (id, instance_id, aud, role, email) select ('f2650000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'u265' || n || '@example.invalid' from generate_series(1, 6) n;
insert into public.users (id, username) select ('f2650000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid, 'u265_' || n from generate_series(1, 6) n on conflict (id) do nothing;
-- ids: 01 O, 02 E, 03 P, 04 C, 05 D, 06 X
set local session_replication_role = replica;
insert into public.businesses (id, owner_id, name, slug, status, is_active, menu_enabled, stripe_account_id, stripe_charges_enabled)
values ('f2650000-0000-4000-8000-0000000000b1', 'f2650000-0000-4000-8000-000000000001', 'Bar 265', 'bar-265-xx', 'verified', true, true, 'acct_test_265', true),
       ('f2650000-0000-4000-8000-0000000000b2', 'f2650000-0000-4000-8000-000000000006', 'Other 265', 'other-265-xx', 'verified', true, true, null, false);
set local session_replication_role = origin;
insert into public.rooms (id, business_id, name, is_main) values ('f2650000-0000-4000-8000-0000000000a1', 'f2650000-0000-4000-8000-0000000000b1', 'Main', true),
  ('f2650000-0000-4000-8000-0000000000a2', 'f2650000-0000-4000-8000-0000000000b2', 'Main', true);
insert into public.menu_categories (id, business_id, name) values ('f2650000-0000-4000-8000-0000000000c1', 'f2650000-0000-4000-8000-0000000000b1', 'Cat'), ('f2650000-0000-4000-8000-0000000000c2', 'f2650000-0000-4000-8000-0000000000b2', 'Cat');
insert into public.menu_items (id, category_id, business_id, name, price_cents) values
  ('f2650000-0000-4000-8000-0000000000e1', 'f2650000-0000-4000-8000-0000000000c1', 'f2650000-0000-4000-8000-0000000000b1', 'Item', 500),
  ('f2650000-0000-4000-8000-0000000000e2', 'f2650000-0000-4000-8000-0000000000c2', 'f2650000-0000-4000-8000-0000000000b2', 'Item', 500);
insert into public.tables (id, business_id, label, qr_token) values ('f2650000-0000-4000-8000-0000000000d1', 'f2650000-0000-4000-8000-0000000000b1', 'T1', 'qr-265');
insert into public.offers (id, business_id, room_id, title, is_active, status) values ('f2650000-0000-4000-8000-0000000000f1', 'f2650000-0000-4000-8000-0000000000b1', 'f2650000-0000-4000-8000-0000000000a1', 'Offer', true, 'active');
insert into public.reviews (id, user_id, business_id, rating, body) values ('f2650000-0000-4000-8000-000000000a01', 'f2650000-0000-4000-8000-000000000004', 'f2650000-0000-4000-8000-0000000000b1', 5, 'great');
insert into public.posts (id, user_id, caption, business_id) values ('f2650000-0000-4000-8000-000000000a02', 'f2650000-0000-4000-8000-000000000001', 'hello', 'f2650000-0000-4000-8000-0000000000b1'),
  ('f2650000-0000-4000-8000-000000000a03', 'f2650000-0000-4000-8000-000000000006', 'other', 'f2650000-0000-4000-8000-0000000000b2');
insert into public.comments (id, post_id, user_id, body) values ('f2650000-0000-4000-8000-000000000a04', 'f2650000-0000-4000-8000-000000000a02', 'f2650000-0000-4000-8000-000000000004', 'nice');
insert into public.messages (id, room_id, user_id, body, type) values ('f2650000-0000-4000-8000-000000000a05', 'f2650000-0000-4000-8000-0000000000a1', 'f2650000-0000-4000-8000-000000000004', 'hi', 'text'),
  ('f2650000-0000-4000-8000-000000000a06', 'f2650000-0000-4000-8000-0000000000a2', 'f2650000-0000-4000-8000-000000000004', 'hi other', 'text');
insert into public.games (key, name_es, name_en) select k, k, k from unnest(array['match']) k where not exists (select 1 from public.games g where g.key = k);
insert into public.game_optins (user_id, business_id, game_key) values ('f2650000-0000-4000-8000-000000000004', 'f2650000-0000-4000-8000-0000000000b1', 'match'), ('f2650000-0000-4000-8000-000000000004', 'f2650000-0000-4000-8000-0000000000b2', 'match');
insert into public.match_presence (user_id, business_id, entered_at, last_seen_at, expires_at, active_since, method) values
  ('f2650000-0000-4000-8000-000000000004', 'f2650000-0000-4000-8000-0000000000b1', now(), now(), now() + interval '1 day', now(), 'geo'),
  ('f2650000-0000-4000-8000-000000000004', 'f2650000-0000-4000-8000-0000000000b2', now(), now(), now() + interval '1 day', now(), 'geo');
set local session_replication_role = replica;
insert into public.employees (id, business_id, user_id, role, status) values
  ('f2650000-0000-4000-8000-000000000e01', 'f2650000-0000-4000-8000-0000000000b1', 'f2650000-0000-4000-8000-000000000002', 'staff', 'accepted'),
  ('f2650000-0000-4000-8000-000000000e02', 'f2650000-0000-4000-8000-0000000000b1', 'f2650000-0000-4000-8000-000000000003', 'staff', 'pending');
set local session_replication_role = origin;
insert into public.reservations (id, business_id, user_id, reserved_at, party_size, status) values
  ('f2650000-0000-4000-8000-000000000f01', 'f2650000-0000-4000-8000-0000000000b1', 'f2650000-0000-4000-8000-000000000004', now() + interval '3 days', 2, 'pending'),
  ('f2650000-0000-4000-8000-000000000f02', 'f2650000-0000-4000-8000-0000000000b1', null, now() + interval '4 days', 2, 'pending'),
  ('f2650000-0000-4000-8000-000000000f03', 'f2650000-0000-4000-8000-0000000000b1', 'f2650000-0000-4000-8000-000000000005', now() - interval '3 days', 2, 'arrived'),
  ('f2650000-0000-4000-8000-000000000f04', 'f2650000-0000-4000-8000-0000000000b2', 'f2650000-0000-4000-8000-000000000004', now() + interval '3 days', 2, 'pending');
-- history that MUST survive: a delivered order (+ a cancelled one)
insert into public.orders (id, business_id, user_id, status, total_cents, order_number) values
  ('f2650000-0000-4000-8000-000000000d01', 'f2650000-0000-4000-8000-0000000000b1', 'f2650000-0000-4000-8000-000000000004', 'delivered', 1500, 1),
  ('f2650000-0000-4000-8000-000000000d02', 'f2650000-0000-4000-8000-0000000000b1', 'f2650000-0000-4000-8000-000000000004', 'cancelled', 700, 2);

-- ── owner_open_orders / blockers ──
insert into public.orders (id, business_id, user_id, status, total_cents, order_number) values ('f2650000-0000-4000-8000-000000000d03', 'f2650000-0000-4000-8000-0000000000b1', 'f2650000-0000-4000-8000-000000000004', 'preparing', 900, 3);
insert into public.table_tabs (id, table_id, business_id, name, kind, owner_uid, status) values ('f2650000-0000-4000-8000-000000000a07', 'f2650000-0000-4000-8000-0000000000d1', 'f2650000-0000-4000-8000-0000000000b1', 'Tab', 'customer', 'f2650000-0000-4000-8000-000000000004', 'open');
select pg_temp.chk((select coalesce(sum(n), 0) from public.owner_open_orders('f2650000-0000-4000-8000-000000000001') where kind = 'orders') = 1, 'owner_open_orders: 1 order in progress');
select pg_temp.chk((select coalesce(sum(n), 0) from public.owner_open_orders('f2650000-0000-4000-8000-000000000001') where kind = 'tabs') = 1, 'owner_open_orders: 1 open tab');
select pg_temp.chk((select count(*) from public.owner_open_orders('f2650000-0000-4000-8000-000000000006')) = 0, 'owner_open_orders: other owner has none');
-- an authenticated user cannot ask about someone else
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f2650000-0000-4000-8000-000000000006","role":"authenticated"}', true);
do $$ begin perform * from public.owner_open_orders('f2650000-0000-4000-8000-000000000001'); raise exception 'should have failed'; exception when sqlstate '42501' then null; end $$;
reset role;
select set_config('request.jwt.claims', '', true);
-- closing with open work is refused (nothing changes)
do $$ begin perform public.owner_close_business('f2650000-0000-4000-8000-0000000000b1', 'f2650000-0000-4000-8000-000000000001'); raise exception 'should have failed'; exception when others then
  if sqlerrm <> 'owner_open_orders' then raise; end if; end $$;
select pg_temp.chk((select status from public.businesses where id = 'f2650000-0000-4000-8000-0000000000b1') = 'verified', 'refused close leaves the venue untouched');
-- wrong owner refused
update public.orders set status = 'delivered' where id = 'f2650000-0000-4000-8000-000000000d03';
update public.table_tabs set status = 'closed' where id = 'f2650000-0000-4000-8000-000000000a07';
do $$ begin perform public.owner_close_business('f2650000-0000-4000-8000-0000000000b1', 'f2650000-0000-4000-8000-000000000006'); raise exception 'should have failed'; exception when sqlstate '42501' then null; end $$;
select pg_temp.chk((select count(*) from public.owner_open_orders('f2650000-0000-4000-8000-000000000001')) = 0, 'after closing orders and tab: nothing blocks');

-- ── THE CLOSE ──
create temp table t_res as select public.owner_close_business('f2650000-0000-4000-8000-0000000000b1', 'f2650000-0000-4000-8000-000000000001') as r;
select pg_temp.chk((select (r->>'employees_notified')::int from t_res) = 1, 'result: 1 employee notified (the pending invite is removed silently)');
select pg_temp.chk((select (r->>'reservations_cancelled')::int from t_res) = 2, 'result: 2 future reservations cancelled');
select pg_temp.chk((select jsonb_array_length(r->'email_ids') from t_res) = 1, 'result: 1 email queued (only the reservation with an account)');
select pg_temp.chk((select status = 'closed' and not is_active and owner_id is null and not menu_enabled and not stripe_charges_enabled from public.businesses where id = 'f2650000-0000-4000-8000-0000000000b1'), 'venue: closed, inactive, no owner, no menu, no charges');
select pg_temp.chk((select stripe_account_id = 'acct_test_265' from public.businesses where id = 'f2650000-0000-4000-8000-0000000000b1'), 'stripe_account_id kept (7-year records)');
select pg_temp.chk((select count(*) from public.orders where business_id = 'f2650000-0000-4000-8000-0000000000b1') = 3, 'orders KEPT (3 rows, delivered and cancelled)');
select pg_temp.chk((select count(*) from public.orders where business_id = 'f2650000-0000-4000-8000-0000000000b1' and status = 'delivered') = 2, 'delivered orders untouched');
select pg_temp.chk((select not is_active from public.rooms where id = 'f2650000-0000-4000-8000-0000000000a1'), 'room deactivated');
select pg_temp.chk((select not is_available from public.menu_items where id = 'f2650000-0000-4000-8000-0000000000e1'), 'menu item deactivated (row kept)');
select pg_temp.chk((select not is_active from public.tables where id = 'f2650000-0000-4000-8000-0000000000d1'), 'table deactivated');
select pg_temp.chk((select not is_active from public.offers where id = 'f2650000-0000-4000-8000-0000000000f1'), 'offer deactivated');
select pg_temp.chk((select status = 'hidden' from public.reviews where id = 'f2650000-0000-4000-8000-000000000a01'), 'review hidden but kept');
select pg_temp.chk((select hidden_at is not null from public.posts where id = 'f2650000-0000-4000-8000-000000000a02'), 'post hidden but kept');
select pg_temp.chk((select hidden_at is not null from public.comments where id = 'f2650000-0000-4000-8000-000000000a04'), 'comment on the venue post hidden but kept');
select pg_temp.chk((select hidden_at is not null from public.messages where id = 'f2650000-0000-4000-8000-000000000a05'), 'chat message hidden but kept');
select pg_temp.chk((select count(*) from public.match_presence where business_id = 'f2650000-0000-4000-8000-0000000000b1') = 0 and (select count(*) from public.game_optins where business_id = 'f2650000-0000-4000-8000-0000000000b1') = 0, 'presence and game opt-ins of the venue deleted');
select pg_temp.chk((select status = 'removed' from public.employees where id = 'f2650000-0000-4000-8000-000000000e01') and (select status = 'removed' from public.employees where id = 'f2650000-0000-4000-8000-000000000e02'), 'both employee rows removed (accounts untouched)');
select pg_temp.chk((select count(*) from public.users where id in ('f2650000-0000-4000-8000-000000000002', 'f2650000-0000-4000-8000-000000000003')) = 2, 'employee accounts still exist');
select pg_temp.chk((select count(*) from public.notifications where type = 'business_closed' and user_id = 'f2650000-0000-4000-8000-000000000002') = 1, 'employee got business_closed (bandeja)');
select pg_temp.chk((select count(*) from public.notifications where type = 'business_closed' and user_id = 'f2650000-0000-4000-8000-000000000003') = 0, 'pending invite got no notice');
select pg_temp.chk((select status = 'cancelled' from public.reservations where id = 'f2650000-0000-4000-8000-000000000f01') and (select status = 'cancelled' from public.reservations where id = 'f2650000-0000-4000-8000-000000000f02'), 'future reservations cancelled');
select pg_temp.chk((select status = 'arrived' from public.reservations where id = 'f2650000-0000-4000-8000-000000000f03'), 'past reservation untouched');
select pg_temp.chk((select count(*) from public.notifications where type = 'reservation_cancelled' and user_id = 'f2650000-0000-4000-8000-000000000004') = 1, 'customer got reservation_cancelled (bandeja)');
select pg_temp.chk((select count(*) from public.outbound_emails where status = 'pending' and kind = 'reservation_cancelled_business_closed' and user_id = 'f2650000-0000-4000-8000-000000000004') = 1, 'email queued for the customer');
select pg_temp.chk((select not (payload::text ~* 'owner|u2651|f2650000-0000-4000-8000-000000000001') from public.outbound_emails limit 1), 'queued email payload carries no owner data');
select pg_temp.chk((select count(*) from public.security_logs where action = 'owner_closed_business') = 1, 'security_logs entry');
-- the other owner's venue is untouched
select pg_temp.chk((select status = 'verified' and is_active and owner_id is not null from public.businesses where id = 'f2650000-0000-4000-8000-0000000000b2'), 'other venue untouched');
select pg_temp.chk((select is_active from public.rooms where id = 'f2650000-0000-4000-8000-0000000000a2') and (select hidden_at is null from public.messages where id = 'f2650000-0000-4000-8000-000000000a06') and (select hidden_at is null from public.posts where id = 'f2650000-0000-4000-8000-000000000a03'), 'other venue room/messages/posts untouched');
select pg_temp.chk((select count(*) from public.match_presence where business_id = 'f2650000-0000-4000-8000-0000000000b2') = 1 and (select status = 'pending' from public.reservations where id = 'f2650000-0000-4000-8000-000000000f04'), 'other venue presence and reservation untouched');

-- ── idempotent retry ──
select pg_temp.chk((public.owner_close_business('f2650000-0000-4000-8000-0000000000b1', 'f2650000-0000-4000-8000-000000000001')->>'already')::boolean, 'second close = already (no-op)');
select pg_temp.chk((select count(*) from public.notifications where type = 'business_closed') = 1, 'no duplicate notifications on retry');

-- ── cannot reopen (even the owner of the table: any role) ──
do $$ begin update public.businesses set status = 'verified' where id = 'f2650000-0000-4000-8000-0000000000b1'; raise exception 'should have failed'; exception when others then
  if sqlerrm <> 'closed_business_cannot_reopen' then raise; end if; end $$;
do $$ begin perform public.admin_set_business_status('f2650000-0000-4000-8000-0000000000b1', 'active'); raise exception 'should have failed'; exception when others then
  if sqlerrm not in ('closed_business_cannot_reopen', 'not authorized') then raise; end if; end $$;
select pg_temp.chk((select status = 'closed' from public.businesses where id = 'f2650000-0000-4000-8000-0000000000b1'), 'still closed after reopen attempts');
update public.businesses set is_active = true where id = 'f2650000-0000-4000-8000-0000000000b1';
select pg_temp.chk((select not is_active from public.businesses where id = 'f2650000-0000-4000-8000-0000000000b1'), 'is_active cannot be turned back on while closed');
select pg_temp.chk((select status = 'closed' from public.businesses where id = 'f2650000-0000-4000-8000-0000000000b1'), 'status stays closed');

-- ── visibility: nobody sees the closed venue or its reviews; the other venue is still public ──
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f2650000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select pg_temp.chk((select count(*) from public.businesses where id = 'f2650000-0000-4000-8000-0000000000b1') = 0, 'a customer cannot read the closed venue');
select pg_temp.chk((select count(*) from public.reviews where business_id = 'f2650000-0000-4000-8000-0000000000b1') = 0, 'a customer cannot read the closed venue reviews');
select pg_temp.chk((select count(*) from public.businesses where id = 'f2650000-0000-4000-8000-0000000000b2') = 1, 'the other venue is still public');
reset role;
select set_config('request.jwt.claims', '', true);
set local role anon;
select pg_temp.chk((select count(*) from public.businesses where id = 'f2650000-0000-4000-8000-0000000000b1') = 0, 'anon cannot read the closed venue');
reset role;
select set_config('request.jwt.claims', '', true);
-- RLS: outbound_emails closed to clients
set local role authenticated;
select pg_temp.chk(not has_table_privilege('authenticated', 'public.outbound_emails', 'select'), 'authenticated has no access to outbound_emails');
select pg_temp.chk(not has_function_privilege('authenticated', 'public.owner_close_business(uuid, uuid)', 'execute'), 'authenticated cannot run owner_close_business');
reset role;
select set_config('request.jwt.claims', '', true);
select pg_temp.chk((select relrowsecurity from pg_class where oid = 'public.outbound_emails'::regclass), 'outbound_emails RLS on');
-- the push trigger knows the new types
select pg_temp.chk((select pg_get_triggerdef(oid) like '%business_closed%' and pg_get_triggerdef(oid) like '%reservation_cancelled%' and pg_get_triggerdef(oid) like '%order_status%' from pg_trigger where tgname = 'trg_push_on_notification_insert'), 'push trigger: new types added, old ones kept');
-- owner_id nullable
select pg_temp.chk((select is_nullable = 'YES' from information_schema.columns where table_schema = 'public' and table_name = 'businesses' and column_name = 'owner_id'), 'businesses.owner_id nullable');

select 'RESULT|' || (case when ok then 'ok' else 'FAIL' end) || '|' || name from t_out order by 1;
rollback;
SQL
} > "$TMP"
OUT=$(docker exec -i "$C" psql -U postgres -d postgres -At < "$TMP" 2>&1)
rm -f "$TMP"
echo "$OUT" | grep -E "ERROR|FATAL|psql:" | head -5
echo "$OUT" | grep '^RESULT|' | sed -e 's/^RESULT|ok|/  ✓ /' -e 's/^RESULT|FAIL|/  ✗ /'
N=$(echo "$OUT" | grep -c '^RESULT|ok|'); F=$(echo "$OUT" | grep -c '^RESULT|FAIL|'); E=$(echo "$OUT" | grep -c 'ERROR')
echo "$N ok, $F failed, $E errors"
[ "$F" = 0 ] && [ "$E" = 0 ] && [ "$N" -gt 0 ] && echo "ALL OK" || { echo "FAILED"; exit 1; }
