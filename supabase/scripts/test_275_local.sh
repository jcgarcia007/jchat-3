#!/usr/bin/env bash
# Prueba LOCAL de la migración 275 (tarjeta mínima del cliente de una reserva) sobre la 274. TODO dentro de UNA transacción que termina en ROLLBACK
# (258, 262, 265–273 se aplican dentro; la 274 y la 275 dos veces: idempotentes). Solo contra el contenedor local.   bash supabase/scripts/test_275_local.sh
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
for m in 258_storage_user_objects 262_review_mode 265_owner_account_close 266_stale_orders_and_email_retry 267_retention_and_report_evidence 268_users_plan_interval_trial_used 269_business_plan_requests 270_business_owner_is_pro 271_users_plan_status_past_due 272_report_evidence 273_reservation_slots_staff_notify; do
  cat "$ROOT/supabase/migrations/$m.sql"
done
cat <<'SQL'
create temp table t_out (ok boolean, name text) on commit drop;
grant all on t_out to public;
create function pg_temp.chk(c boolean, n text) returns void language sql as $$ insert into t_out values (coalesce(c, false), n) $$;
grant execute on function pg_temp.chk(boolean, text) to public;
-- statement that must fail with a message containing `expected`
create function pg_temp.err(q text, expected text, n text) returns void language plpgsql as $$
begin
  execute q;
  insert into t_out values (false, n || ' (no error)');
exception when others then
  insert into t_out values (sqlerrm like '%' || expected || '%' or sqlstate = expected, n || ' [' || sqlerrm || ']');
end $$;
grant execute on function pg_temp.err(text, text, text) to public;
create function pg_temp.login(n int) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.u(n), 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
grant execute on function pg_temp.login(int) to public;
create function pg_temp.logout() returns void language plpgsql as $$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
end $$;
grant execute on function pg_temp.logout() to public;
create function pg_temp.u(n int) returns uuid language sql as $$ select ('e2740000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid $$;
grant execute on function pg_temp.u(int) to public;

SQL
cat "$ROOT/supabase/migrations/274_reservation_confirm_reminders.sql"
cat "$ROOT/supabase/migrations/274_reservation_confirm_reminders.sql"
cat "$ROOT/supabase/migrations/275_reservation_customer_card.sql"
cat "$ROOT/supabase/migrations/275_reservation_customer_card.sql"
cat <<'SQL'

-- people: 01 owner of b1 · 02 staff WITH reservations_manage · 03 staff WITHOUT · 04 customer · 05 PENDING staff with the permission · 06 owner of b2 · 07 staff of b2 with the permission
--         08 staff of b1 with a base role only (no custom role) · 09 platform admin · 10 customer B
insert into auth.users (id, instance_id, aud, role, email)
  select pg_temp.u(n), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'u274' || n || '@example.com' from generate_series(1, 10) n;
insert into public.users (id, username) select pg_temp.u(n), 'u274_' || n from generate_series(1, 10) n on conflict (id) do nothing;
update public.users set plan = 'pro' where id in (pg_temp.u(1), pg_temp.u(6));
update public.users set role = 'super_admin' where id = pg_temp.u(9);

set local session_replication_role = replica;
insert into public.businesses (id, owner_id, name, slug, status, is_active, timezone, hours) values
  ('e2740000-0000-4000-8000-0000000000b1', pg_temp.u(1), 'Bar Uno',  'bar-274-1', 'verified', true, 'America/Santo_Domingo', '{}'::jsonb),
  ('e2740000-0000-4000-8000-0000000000b2', pg_temp.u(6), 'Bar Dos',  'bar-274-2', 'verified', true, 'America/New_York',      '{}'::jsonb);
set local session_replication_role = origin;
insert into public.custom_roles (id, business_id, name, permissions) values
  ('e2740000-0000-4000-8000-0000000000c1', 'e2740000-0000-4000-8000-0000000000b1', 'Anfitrión', '{"reservations_manage": true}'),
  ('e2740000-0000-4000-8000-0000000000c2', 'e2740000-0000-4000-8000-0000000000b1', 'Cajero',    '{"reservations_manage": false, "pos_access": true}'),
  ('e2740000-0000-4000-8000-0000000000c3', 'e2740000-0000-4000-8000-0000000000b2', 'Anfitrión2', '{"reservations_manage": true}');
insert into public.employees (id, business_id, user_id, role, status, custom_role_id) values
  ('e2740000-0000-4000-8000-000000000e02', 'e2740000-0000-4000-8000-0000000000b1', pg_temp.u(2), 'staff', 'accepted', 'e2740000-0000-4000-8000-0000000000c1'),
  ('e2740000-0000-4000-8000-000000000e03', 'e2740000-0000-4000-8000-0000000000b1', pg_temp.u(3), 'staff', 'accepted', 'e2740000-0000-4000-8000-0000000000c2'),
  ('e2740000-0000-4000-8000-000000000e05', 'e2740000-0000-4000-8000-0000000000b1', pg_temp.u(5), 'staff', 'pending',  'e2740000-0000-4000-8000-0000000000c1'),
  ('e2740000-0000-4000-8000-000000000e07', 'e2740000-0000-4000-8000-0000000000b2', pg_temp.u(7), 'staff', 'accepted', 'e2740000-0000-4000-8000-0000000000c3'),
  ('e2740000-0000-4000-8000-000000000e08', 'e2740000-0000-4000-8000-0000000000b1', pg_temp.u(8), 'manager', 'accepted', null);
insert into public.tables (id, business_id, label) values
  ('e2740000-0000-4000-8000-0000000000d1', 'e2740000-0000-4000-8000-0000000000b1', 'M1'),
  ('e2740000-0000-4000-8000-0000000000d2', 'e2740000-0000-4000-8000-0000000000b1', 'M2');
delete from public.notifications;


insert into public.reservations (id, business_id, user_id, reserved_at, party_size, status) values
  ('e2740000-0000-4000-8000-0000000000a1', 'e2740000-0000-4000-8000-0000000000b1', pg_temp.u(4), now() + interval '3 days', 2, 'pending');
insert into public.reservations (id, business_id, user_id, reserved_at, party_size, status) values
  ('e2740000-0000-4000-8000-0000000000a2', 'e2740000-0000-4000-8000-0000000000b1', null, now() + interval '3 days', 2, 'pending');
update public.users set display_name = 'Cliente Cuatro', username = 'cliente_cuatro', avatar_url = 'https://example.com/a4.png' where id = pg_temp.u(4);

select pg_temp.login(1);
select pg_temp.chk((select count(*) = 1 and bool_and(display_name = 'Cliente Cuatro' and username = 'cliente_cuatro' and avatar_url = 'https://example.com/a4.png') from public.reservation_customer_card('e2740000-0000-4000-8000-0000000000a1')), 'card: the owner sees name, @user and photo');
select pg_temp.chk((select count(*) = 0 from public.reservation_customer_card('e2740000-0000-4000-8000-0000000000a2')), 'card: a phone reservation (no account) returns nothing');
select pg_temp.chk((select proargnames = array['p_reservation_id','display_name','username','avatar_url'] from pg_proc where proname = 'reservation_customer_card'), 'card: it returns exactly the 3 fields (no email, no phone)');
select pg_temp.logout();
select pg_temp.login(2);
select pg_temp.chk((select count(*) = 1 from public.reservation_customer_card('e2740000-0000-4000-8000-0000000000a1')), 'card: staff WITH reservations_manage sees it');
select pg_temp.logout();
select pg_temp.login(3);
select pg_temp.err($q$select * from public.reservation_customer_card('e2740000-0000-4000-8000-0000000000a1')$q$, 'NOT_ALLOWED', 'card: staff WITHOUT the permission → NOT_ALLOWED');
select pg_temp.logout();
select pg_temp.login(5);
select pg_temp.err($q$select * from public.reservation_customer_card('e2740000-0000-4000-8000-0000000000a1')$q$, 'NOT_ALLOWED', 'card: PENDING staff → NOT_ALLOWED');
select pg_temp.logout();
select pg_temp.login(7);
select pg_temp.err($q$select * from public.reservation_customer_card('e2740000-0000-4000-8000-0000000000a1')$q$, 'NOT_ALLOWED', 'card: staff of ANOTHER venue → NOT_ALLOWED');
select pg_temp.logout();
select pg_temp.login(4);
select pg_temp.err($q$select * from public.reservation_customer_card('e2740000-0000-4000-8000-0000000000a1')$q$, 'NOT_ALLOWED', 'card: the customer of that very reservation → NOT_ALLOWED');
select pg_temp.logout();
select pg_temp.login(10);
select pg_temp.err($q$select * from public.reservation_customer_card('e2740000-0000-4000-8000-0000000000a1')$q$, 'NOT_ALLOWED', 'card: another customer → NOT_ALLOWED');
select pg_temp.err($q$select * from public.reservation_customer_card('e2740000-0000-4000-8000-00000000ffff')$q$, 'NOT_ALLOWED', 'card: an unknown id gives the same NOT_ALLOWED (no probing)');
select pg_temp.logout();
select pg_temp.chk(has_function_privilege('authenticated', 'public.reservation_customer_card(uuid)', 'execute') and has_function_privilege('service_role', 'public.reservation_customer_card(uuid)', 'execute') and not has_function_privilege('anon', 'public.reservation_customer_card(uuid)', 'execute'), 'card: execute for authenticated / service_role, not anon');
select pg_temp.chk((select count(*) = 1 from pg_proc where proname = 'reservation_customer_card'), 'card: one function (275 applied twice)');

select 'RESULT|' || (case when ok then 'ok' else 'FAIL' end) || '|' || name from t_out order by 1;
rollback;
SQL
} > "$TMP"
OUT=$(docker exec -i "$C" psql -U postgres -d postgres -At < "$TMP" 2>&1)
rm -f "$TMP"
echo "$OUT" | grep -E -B3 -A3 "ERROR|FATAL|psql:" | head -20
echo "$OUT" | grep '^RESULT|' | sed -e 's/^RESULT|ok|/  ✓ /' -e 's/^RESULT|FAIL|/  ✗ /'
N=$(echo "$OUT" | grep -c '^RESULT|ok|'); F=$(echo "$OUT" | grep -c '^RESULT|FAIL|'); E=$(echo "$OUT" | grep -c 'ERROR')
echo "$N ok, $F failed, $E errors"
[ "$F" = 0 ] && [ "$E" = 0 ] && [ "$N" -gt 0 ] && echo "ALL OK" || { echo "FAILED"; exit 1; }
