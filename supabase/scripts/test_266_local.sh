#!/usr/bin/env bash
# Prueba LOCAL de la migración 266 (pedidos abandonados + reintento de correos). TODO dentro de UNA transacción que termina en ROLLBACK
# (la 262, la 265 y la 266 se aplican dentro; la 266 dos veces: idempotente). Solo contra el contenedor local.   bash supabase/scripts/test_266_local.sh
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
cat "$ROOT/supabase/migrations/266_stale_orders_and_email_retry.sql"
cat "$ROOT/supabase/migrations/266_stale_orders_and_email_retry.sql"
cat <<'SQL'
create temp table t_out (ok boolean, name text) on commit drop;
grant all on t_out to public;
create function pg_temp.chk(c boolean, n text) returns void language sql as $$ insert into t_out values (coalesce(c, false), n) $$;

-- fixtures: customer C, owner O, one venue with a table (open session) and one menu item
insert into auth.users (id, instance_id, aud, role, email) select ('f2660000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'u266' || n || '@example.invalid' from generate_series(1, 2) n;
insert into public.users (id, username) select ('f2660000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid, 'u266_' || n from generate_series(1, 2) n on conflict (id) do nothing;
set local session_replication_role = replica;
insert into public.businesses (id, owner_id, name, slug, status, is_active, menu_enabled)
values ('f2660000-0000-4000-8000-0000000000b1', 'f2660000-0000-4000-8000-000000000001', 'Bar 266', 'bar-266-xx', 'verified', true, true);
set local session_replication_role = origin;
insert into public.menu_categories (id, business_id, name) values ('f2660000-0000-4000-8000-0000000000c1', 'f2660000-0000-4000-8000-0000000000b1', 'Cat');
insert into public.menu_items (id, category_id, business_id, name, price_cents) values ('f2660000-0000-4000-8000-0000000000e1', 'f2660000-0000-4000-8000-0000000000c1', 'f2660000-0000-4000-8000-0000000000b1', 'Item', 500);
insert into public.tables (id, business_id, label, qr_token, access_code, session_opened_at) values ('f2660000-0000-4000-8000-0000000000d1', 'f2660000-0000-4000-8000-0000000000b1', 'T1', 'qr-266', '123456', now() - interval '2 days');

-- orders (C = customer). 01 paid+old, 02 unpaid+old+table, 03 recent, 04 pending+old unpaid, 05 disputed+old, 06 preparing+old paid
insert into public.orders (id, business_id, user_id, status, total_cents, order_number, paid_at, table_id, status_updated_at, created_at) values
  ('f2660000-0000-4000-8000-000000000a01', 'f2660000-0000-4000-8000-0000000000b1', 'f2660000-0000-4000-8000-000000000002', 'confirmed', 500, 1, now() - interval '30 hours', null, now() - interval '30 hours', now() - interval '31 hours'),
  ('f2660000-0000-4000-8000-000000000a02', 'f2660000-0000-4000-8000-0000000000b1', 'f2660000-0000-4000-8000-000000000002', 'ready', 500, 2, null, 'f2660000-0000-4000-8000-0000000000d1', now() - interval '30 hours', now() - interval '31 hours'),
  ('f2660000-0000-4000-8000-000000000a03', 'f2660000-0000-4000-8000-0000000000b1', 'f2660000-0000-4000-8000-000000000002', 'confirmed', 500, 3, null, null, now() - interval '2 hours', now() - interval '2 hours'),
  ('f2660000-0000-4000-8000-000000000a04', 'f2660000-0000-4000-8000-0000000000b1', 'f2660000-0000-4000-8000-000000000002', 'pending', 500, 4, null, null, now() - interval '48 hours', now() - interval '48 hours'),
  ('f2660000-0000-4000-8000-000000000a05', 'f2660000-0000-4000-8000-0000000000b1', 'f2660000-0000-4000-8000-000000000002', 'disputed', 500, 5, now() - interval '60 hours', null, now() - interval '48 hours', now() - interval '60 hours'),
  ('f2660000-0000-4000-8000-000000000a06', 'f2660000-0000-4000-8000-0000000000b1', 'f2660000-0000-4000-8000-000000000002', 'preparing', 500, 6, now() - interval '40 hours', null, now() - interval '40 hours', now() - interval '41 hours');
insert into public.order_items (order_id, menu_item_id, qty, price_cents, item_status) values
  ('f2660000-0000-4000-8000-000000000a01', 'f2660000-0000-4000-8000-0000000000e1', 1, 500, 'pending'),
  ('f2660000-0000-4000-8000-000000000a06', 'f2660000-0000-4000-8000-0000000000e1', 1, 500, 'preparing'),
  ('f2660000-0000-4000-8000-000000000a03', 'f2660000-0000-4000-8000-0000000000e1', 1, 500, 'pending');
delete from public.notifications where user_id = 'f2660000-0000-4000-8000-000000000002';

-- ── Part A ──
select pg_temp.chk(not has_function_privilege('authenticated', 'public.orders_auto_settle()', 'execute') and not has_function_privilege('anon', 'public.orders_auto_settle()', 'execute'), 'A: clients cannot run orders_auto_settle');
create temp table t_first as select public.orders_auto_settle() as n;
select pg_temp.chk((select n from t_first) = 4, 'A: first pass settles 4 (2 paid, 2 unpaid)');
select pg_temp.chk((select status from public.orders where id = 'f2660000-0000-4000-8000-000000000a01') = 'delivered' and (select auto_settled_at from public.orders where id = 'f2660000-0000-4000-8000-000000000a01') is not null, 'A: old paid order → delivered + auto_settled_at');
select pg_temp.chk((select status from public.orders where id = 'f2660000-0000-4000-8000-000000000a06') = 'delivered', 'A: old paid preparing order → delivered');
select pg_temp.chk((select bool_and(item_status = 'done' and done_at is not null) from public.order_items where order_id in ('f2660000-0000-4000-8000-000000000a01', 'f2660000-0000-4000-8000-000000000a06')), 'A: items of the paid orders → done');
select pg_temp.chk((select status = 'cancelled' and canceled_at is not null and auto_settled_at is not null from public.orders where id = 'f2660000-0000-4000-8000-000000000a02'), 'A: old unpaid order → cancelled + canceled_at');
select pg_temp.chk((select access_code is null and session_opened_at is null from public.tables where id = 'f2660000-0000-4000-8000-0000000000d1'), 'A: the table of the cancelled order is freed');
select pg_temp.chk((select status = 'cancelled' from public.orders where id = 'f2660000-0000-4000-8000-000000000a04'), 'A: old PENDING unpaid order enters the sweep → cancelled');
select pg_temp.chk((select status = 'confirmed' and auto_settled_at is null from public.orders where id = 'f2660000-0000-4000-8000-000000000a03') and (select item_status = 'pending' from public.order_items where order_id = 'f2660000-0000-4000-8000-000000000a03'), 'A: recent order untouched');
select pg_temp.chk((select status = 'disputed' and auto_settled_at is null from public.orders where id = 'f2660000-0000-4000-8000-000000000a05'), 'A: disputed order untouched');
select pg_temp.chk((select count(*) from public.notifications where user_id = 'f2660000-0000-4000-8000-000000000002') = 0, 'A: the sweep inserts NO notification (no push)');
select pg_temp.chk((select count(*) from public.security_logs where action = 'orders_auto_settled' and detail = 'delivered:2 cancelled:2') = 1, 'A: one security_logs row with the counts');
select pg_temp.chk((select public.orders_auto_settle()) = 0, 'A: second pass settles 0 (idempotent)');
select pg_temp.chk((select count(*) from public.security_logs where action = 'orders_auto_settled') = 1, 'A: a pass with nothing to do writes no log');
-- the switch is off again: a normal status change notifies as before
update public.orders set status = 'preparing' where id = 'f2660000-0000-4000-8000-000000000a03';
select pg_temp.chk((select count(*) from public.notifications where user_id = 'f2660000-0000-4000-8000-000000000002' and type = 'order_status') = 1, 'A: outside the sweep notify_order_status still notifies');
select pg_temp.chk((select count(*) from cron.job where jobname = 'orders-auto-settle' and schedule = '17 * * * *') = 1, 'A: cron job orders-auto-settle scheduled once');

-- ── Part B ──
select pg_temp.chk(not has_function_privilege('authenticated', 'public.outbound_emails_retry()', 'execute'), 'B: clients cannot run outbound_emails_retry');
insert into public.outbound_emails (id, kind, user_id, payload, status, attempts, created_at, last_attempt_at) values
  ('f2660000-0000-4000-8000-000000000b01', 'reservation_cancelled_business_closed', null, '{}', 'pending', 0, now() - interval '1 minute', null),
  ('f2660000-0000-4000-8000-000000000b02', 'reservation_cancelled_business_closed', null, '{}', 'pending', 0, now() - interval '20 minutes', null),
  ('f2660000-0000-4000-8000-000000000b03', 'reservation_cancelled_business_closed', null, '{}', 'failed', 6, now() - interval '2 days', now() - interval '1 day'),
  ('f2660000-0000-4000-8000-000000000b04', 'reservation_cancelled_business_closed', null, '{}', 'failed', 1, now() - interval '2 hours', now() - interval '5 minutes'),
  ('f2660000-0000-4000-8000-000000000b05', 'reservation_cancelled_business_closed', null, '{}', 'sent', 1, now() - interval '2 days', now() - interval '1 day'),
  ('f2660000-0000-4000-8000-000000000b06', 'reservation_cancelled_business_closed', null, '{}', 'failed', 2, now() - interval '2 days', now() - interval '3 hours');
delete from vault.secrets where name = 'push_webhook_secret';
select pg_temp.chk((select public.outbound_emails_retry()) = 0, 'B: without the vault secret it returns 0');
select pg_temp.chk((select count(*) from public.outbound_emails where attempts > 0 and id in ('f2660000-0000-4000-8000-000000000b02')) = 0, 'B: without the secret no row is touched');
select vault.create_secret('test-secret-266', 'push_webhook_secret');
create temp table t_retry as select public.outbound_emails_retry() as n;
select pg_temp.chk((select n from t_retry) = 2, 'B: picks the old pending row and the failed row past its backoff (2)');
select pg_temp.chk((select attempts = 0 and last_attempt_at is null from public.outbound_emails where id = 'f2660000-0000-4000-8000-000000000b01'), 'B: a recent row (1 min) is not touched');
select pg_temp.chk((select attempts = 1 and last_attempt_at is not null and last_attempt_at > now() - interval '1 minute' from public.outbound_emails where id = 'f2660000-0000-4000-8000-000000000b02'), 'B: an old row → attempts + 1 and last_attempt_at = now');
select pg_temp.chk((select attempts = 3 from public.outbound_emails where id = 'f2660000-0000-4000-8000-000000000b06'), 'B: a failed row past its backoff (3 h > 40 min) is retried');
select pg_temp.chk((select attempts = 1 and last_attempt_at < now() - interval '4 minutes' from public.outbound_emails where id = 'f2660000-0000-4000-8000-000000000b04'), 'B: a row inside its backoff (5 min < 20 min) is not taken');
select pg_temp.chk((select attempts = 6 and status = 'failed' from public.outbound_emails where id = 'f2660000-0000-4000-8000-000000000b03'), 'B: a row with 6 attempts is never taken again (attempts stays 6, terminal failed)');
select pg_temp.chk((select status = 'sent' and attempts = 1 from public.outbound_emails where id = 'f2660000-0000-4000-8000-000000000b05'), 'B: a sent row is not taken');
select pg_temp.chk((select count(*) from net.http_request_queue where url like '%/functions/v1/outbound-emails') = 1, 'B: ONE pg_net call to outbound-emails for the whole batch');
select pg_temp.chk((select count(*) from public.security_logs where action = 'outbound_email_gave_up' and target_id = 'f2660000-0000-4000-8000-000000000b03') = 1, 'B: the row with 6 attempts is logged once as gave_up');
select public.outbound_emails_retry();
select pg_temp.chk((select count(*) from public.security_logs where action = 'outbound_email_gave_up' and target_id = 'f2660000-0000-4000-8000-000000000b03') = 1, 'B: gave_up is not logged twice');
select pg_temp.chk((select count(*) from cron.job where jobname = 'outbound-emails-retry' and schedule = '*/10 * * * *') = 1, 'B: cron job outbound-emails-retry scheduled once');
select pg_temp.chk((select count(*) from pg_indexes where indexname = 'outbound_emails_status_attempt_idx') = 1, 'B: index created once (migration applied twice)');

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
