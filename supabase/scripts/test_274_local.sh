#!/usr/bin/env bash
# Prueba LOCAL de la migración 274 (confirmación del local, personal con permiso de reservas, avisos y recordatorios). TODO dentro de UNA transacción que termina en ROLLBACK
# (258, 262, 265–273 se aplican dentro; la 274 dos veces: idempotente). Solo contra el contenedor local.   bash supabase/scripts/test_274_local.sh
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

-- the production definitions 274 builds on (md5 read 2026-11-10) must be the ones the baseline creates
select pg_temp.chk(md5(pg_get_functiondef('public.set_reservation_status(uuid,text)'::regprocedure)) = '5e6c8e406a30547405760c8bcb4ec485', 'baseline: set_reservation_status = production');
select pg_temp.chk(md5(pg_get_functiondef('public.reservations_customer_guard()'::regprocedure)) = '5322d7dd01ab228aadd2ccb3bf8f8b29', 'baseline: reservations_customer_guard = production');
select pg_temp.chk(md5(pg_get_functiondef('public.create_reservation(uuid,timestamptz,integer,uuid[],text,text,text,text,text)'::regprocedure)) = '45137c172bf3c65b943484e0dea7ddf4', 'baseline: create_reservation = production');
select pg_temp.chk(md5(pg_get_functiondef('public.update_reservation(uuid,timestamptz,integer,uuid[],text,text,text,text,text)'::regprocedure)) = '4d32c1a77dde70b356c265294fc7df10', 'baseline: update_reservation = production');
select pg_temp.chk(md5(pg_get_functiondef('public.set_table_reserved(uuid,boolean,text,timestamptz)'::regprocedure)) = 'b85240759e756594f85f8a6c662fcc86', 'baseline: set_table_reserved = production');
select pg_temp.chk((select pg_get_triggerdef(oid) from pg_trigger where tgname = 'trg_push_on_notification_insert') !~ 'reservation_confirmed', 'baseline: the push list has no M3 types yet');
SQL
cat "$ROOT/supabase/migrations/274_reservation_confirm_reminders.sql"
cat "$ROOT/supabase/migrations/274_reservation_confirm_reminders.sql"
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

-- ───────── 1. the permission rule ─────────
select pg_temp.chk(public.reservations_can_manage('e2740000-0000-4000-8000-0000000000b1', pg_temp.u(1)), 'can_manage: the owner');
select pg_temp.chk(public.reservations_can_manage('e2740000-0000-4000-8000-0000000000b1', pg_temp.u(2)), 'can_manage: accepted staff with reservations_manage');
select pg_temp.chk(not public.reservations_can_manage('e2740000-0000-4000-8000-0000000000b1', pg_temp.u(3)), 'can_manage: accepted staff WITHOUT the permission → no');
select pg_temp.chk(not public.reservations_can_manage('e2740000-0000-4000-8000-0000000000b1', pg_temp.u(5)), 'can_manage: PENDING staff with the permission → no');
select pg_temp.chk(not public.reservations_can_manage('e2740000-0000-4000-8000-0000000000b1', pg_temp.u(8)), 'can_manage: accepted staff with a base role only (no custom role) → no');
select pg_temp.chk(not public.reservations_can_manage('e2740000-0000-4000-8000-0000000000b1', pg_temp.u(7)), 'can_manage: staff of ANOTHER venue → no');
select pg_temp.chk(not public.reservations_can_manage('e2740000-0000-4000-8000-0000000000b1', pg_temp.u(4)), 'can_manage: a customer → no');
select pg_temp.chk(public.reservations_can_manage('e2740000-0000-4000-8000-0000000000b1', pg_temp.u(9)), 'can_manage: a platform admin');
select pg_temp.chk(not public.reservations_can_manage(null, pg_temp.u(1)) and not public.reservations_can_manage('e2740000-0000-4000-8000-0000000000b1', null), 'can_manage: null business / null user → no');
select pg_temp.chk(not has_function_privilege('anon', 'public.reservations_can_manage(uuid,uuid)', 'execute') and has_function_privilege('authenticated', 'public.reservations_can_manage(uuid,uuid)', 'execute'), 'can_manage: authenticated can run it, anon cannot');
select pg_temp.login(3);
select pg_temp.chk(not public.reservations_can_manage('e2740000-0000-4000-8000-0000000000b1', pg_temp.u(1)), 'can_manage: with a session it does not answer for ANOTHER user (no probing)');
select pg_temp.chk(not public.reservations_can_manage('e2740000-0000-4000-8000-0000000000b1'), 'can_manage: default = the caller (staff without the permission → no)');
select pg_temp.logout();

-- ───────── 2. schema ─────────
select pg_temp.chk((select count(*) = 4 from information_schema.columns where table_schema = 'public' and table_name = 'reservations' and column_name in ('status_changed_by', 'status_reason', 'reminder_24h_at', 'reminder_2h_at')), 'schema: the 4 new columns');
select pg_temp.chk((select count(*) = 1 from pg_constraint where conrelid = 'public.reservations'::regclass and conname = 'reservations_status_check'), 'schema: reservations_status_check exists once (274 applied twice)');
select pg_temp.err($q$insert into public.reservations (business_id, user_id, reserved_at, party_size, status) values ('e2740000-0000-4000-8000-0000000000b1', null, now() + interval '3 days', 2, 'bogus')$q$, 'reservations_status_check', 'schema: an unknown status is refused');
select pg_temp.err($q$insert into public.reservations (business_id, user_id, reserved_at, party_size, status_reason) values ('e2740000-0000-4000-8000-0000000000b1', null, now() + interval '3 days', 2, 'bogus')$q$, 'reservations_status_reason_check', 'schema: an unknown reason is refused');
insert into public.reservations (id, business_id, user_id, reserved_at, party_size, status) values
  ('e2740000-0000-4000-8000-0000000000a1', 'e2740000-0000-4000-8000-0000000000b1', pg_temp.u(4), now() + interval '3 days', 2, 'pending');
select pg_temp.chk((select count(*) = 1 from public.reservations where status = 'pending'), 'schema: pending / arrived / cancelled / confirmed / rejected / no_show are all accepted');
update public.reservations set status = 'arrived' where id = 'e2740000-0000-4000-8000-0000000000a1';
update public.reservations set status = 'cancelled' where id = 'e2740000-0000-4000-8000-0000000000a1';
update public.reservations set status = 'no_show' where id = 'e2740000-0000-4000-8000-0000000000a1';
update public.reservations set status = 'confirmed' where id = 'e2740000-0000-4000-8000-0000000000a1';
update public.reservations set status = 'rejected' where id = 'e2740000-0000-4000-8000-0000000000a1';
delete from public.reservations;
delete from public.notifications;

-- ───────── 3. reservation_requested (a customer with an account books) ─────────
select pg_temp.login(4);
insert into public.reservations (id, business_id, user_id, reserved_at, party_size, status) values
  ('e2740000-0000-4000-8000-0000000000a2', 'e2740000-0000-4000-8000-0000000000b1', pg_temp.u(4), now() + interval '3 days', 4, 'pending');
select pg_temp.logout();
select pg_temp.chk((select count(*) = 2 from public.notifications where type = 'reservation_requested'), 'requested: a booking notifies exactly the owner and the staff with the permission (2)');
select pg_temp.chk((select count(*) = 1 from public.notifications where type = 'reservation_requested' and user_id = pg_temp.u(1)) and (select count(*) = 1 from public.notifications where type = 'reservation_requested' and user_id = pg_temp.u(2)), 'requested: ... the owner and staff 02');
select pg_temp.chk((select count(*) = 0 from public.notifications where user_id in (pg_temp.u(3), pg_temp.u(5), pg_temp.u(7), pg_temp.u(8), pg_temp.u(4), pg_temp.u(6))), 'requested: ... and NOT staff without permission, pending staff, base-role staff, another venue, the customer');
select pg_temp.chk((select payload->>'business_name' = 'Bar Uno' and payload->>'reservation_id' = 'e2740000-0000-4000-8000-0000000000a2' and payload->>'timezone' = 'America/Santo_Domingo' and (payload->>'party_size')::int = 4 and payload ? 'reserved_at' from public.notifications where type = 'reservation_requested' and user_id = pg_temp.u(1)), 'requested: payload {business_id, business_name, reservation_id, reserved_at, timezone of the venue, party_size}');
delete from public.notifications;
-- the owner booking at their own venue: staff 02 hears it, the owner (the author) does not
select pg_temp.login(1);
insert into public.reservations (id, business_id, user_id, reserved_at, party_size, status) values
  ('e2740000-0000-4000-8000-0000000000a3', 'e2740000-0000-4000-8000-0000000000b1', pg_temp.u(1), now() + interval '4 days', 2, 'pending');
select pg_temp.logout();
select pg_temp.chk((select count(*) = 1 and bool_and(user_id = pg_temp.u(2)) from public.notifications where type = 'reservation_requested'), 'requested: the author (the owner booking at their own venue) is never notified');
delete from public.notifications;
-- a phone booking made by the venue (user_id null) says nothing
select pg_temp.login(1);
select public.create_reservation('e2740000-0000-4000-8000-0000000000b1', now() + interval '5 days', 3, array['e2740000-0000-4000-8000-0000000000d1']::uuid[], null, '8095550101', 'Ana', 'P', 'terrace');
select pg_temp.logout();
select pg_temp.chk((select count(*) = 0 from public.notifications), 'requested: a reservation created by the venue by phone (no account) notifies nobody');
select pg_temp.chk((select is_reserved from public.tables where id = 'e2740000-0000-4000-8000-0000000000d1'), 'create_reservation (owner): the table is marked reserved');

-- ───────── 4. RLS: who sees and touches reservations ─────────
select pg_temp.chk((select count(*) = 3 from public.reservations), 'rls: (as postgres) 3 reservations in the fixture');
select pg_temp.login(2);
select pg_temp.chk((select count(*) = 3 from public.reservations), 'rls: staff WITH permission sees the venue''s reservations');
select pg_temp.chk((select count(*) >= 1 from public.reservation_customers), 'rls: staff WITH permission reads reservation_customers');
select pg_temp.chk((select count(*) = 1 from public.reservation_tables), 'rls: staff WITH permission reads reservation_tables');
select pg_temp.err($q$insert into public.reservations (business_id, user_id, reserved_at, party_size, status) values ('e2740000-0000-4000-8000-0000000000b1', null, now() + interval '3 days', 2, 'pending')$q$, '42501', 'rls: staff cannot INSERT reservations directly');
with d as (delete from public.reservations where id = 'e2740000-0000-4000-8000-0000000000a2' returning 1) select pg_temp.chk((select count(*) = 0 from d), 'rls: staff cannot DELETE reservations (0 rows)');
create temp table t_upd (who int, n bigint);
grant all on t_upd to public;
with u as (update public.reservations set status = 'pending' where id = 'e2740000-0000-4000-8000-0000000000a2' returning 1) insert into t_upd select 2, count(*) from u;
select pg_temp.login(3);
with u as (update public.reservations set status = 'pending' where id = 'e2740000-0000-4000-8000-0000000000a2' returning 1) insert into t_upd select 3, count(*) from u;
select pg_temp.logout();
select pg_temp.chk((select n = 1 from t_upd where who = 2), 'rls: staff WITH permission can UPDATE (1 row)');
select pg_temp.chk((select n = 0 from t_upd where who = 3), 'rls: staff WITHOUT permission cannot UPDATE (0 rows)');
select pg_temp.chk((select count(*) = 1 from public.reservations where id = 'e2740000-0000-4000-8000-0000000000a2'), 'rls: ... and the DELETE really removed nothing');
-- the ones that must see nothing
create temp table t_seen (who int, n bigint, c bigint, t bigint);
grant all on t_seen to public;
select pg_temp.login(3);
insert into t_seen select 3, (select count(*) from public.reservations), (select count(*) from public.reservation_customers), (select count(*) from public.reservation_tables);
select pg_temp.login(5);
insert into t_seen select 5, (select count(*) from public.reservations), (select count(*) from public.reservation_customers), (select count(*) from public.reservation_tables);
select pg_temp.login(7);
insert into t_seen select 7, (select count(*) from public.reservations), (select count(*) from public.reservation_customers), (select count(*) from public.reservation_tables);
select pg_temp.login(8);
insert into t_seen select 8, (select count(*) from public.reservations), (select count(*) from public.reservation_customers), (select count(*) from public.reservation_tables);
select pg_temp.login(4);
insert into t_seen select 4, (select count(*) from public.reservations), (select count(*) from public.reservation_customers), (select count(*) from public.reservation_tables);
select pg_temp.logout();
select pg_temp.chk((select n = 0 and c = 0 and t = 0 from t_seen where who = 3), 'rls: staff WITHOUT permission sees 0 reservations / customers / tables');
select pg_temp.chk((select n = 0 and c = 0 and t = 0 from t_seen where who = 5), 'rls: PENDING staff sees nothing');
select pg_temp.chk((select n = 0 and c = 0 and t = 0 from t_seen where who = 7), 'rls: staff of another venue sees nothing');
select pg_temp.chk((select n = 0 and c = 0 and t = 0 from t_seen where who = 8), 'rls: base-role staff sees nothing');
select pg_temp.chk((select n = 1 and c = 0 and t = 0 from t_seen where who = 4), 'rls: the customer still sees only their own reservation (and no customers / tables)');

-- ───────── 5. set_reservation_status: who, which states ─────────
select pg_temp.login(3);
select pg_temp.err($q$select public.set_reservation_status('e2740000-0000-4000-8000-0000000000a2', 'confirmed')$q$, 'NOT_ALLOWED', 'status: staff WITHOUT permission → NOT_ALLOWED');
select pg_temp.err($q$select public.reject_reservation('e2740000-0000-4000-8000-0000000000a2', null)$q$, 'NOT_ALLOWED', 'reject: staff WITHOUT permission → NOT_ALLOWED');
select pg_temp.err($q$select public.create_reservation('e2740000-0000-4000-8000-0000000000b1', now() + interval '6 days', 2, null, null, null, 'X', null, null)$q$, 'NOT_ALLOWED', 'create_reservation: staff WITHOUT permission → NOT_ALLOWED');
select pg_temp.login(4);
select pg_temp.err($q$select public.set_reservation_status('e2740000-0000-4000-8000-0000000000a2', 'confirmed')$q$, 'NOT_ALLOWED', 'status: the customer cannot confirm through the RPC');
select pg_temp.err($q$update public.reservations set status = 'confirmed' where id = 'e2740000-0000-4000-8000-0000000000a2'$q$, 'customer_cannot_change_status', 'status: the customer cannot confirm with a direct UPDATE (guard)');
select pg_temp.err($q$update public.reservations set status_reason = 'no_availability' where id = 'e2740000-0000-4000-8000-0000000000a2'$q$, '42501', 'status: the customer cannot write the rejection reason (no column grant)');
select pg_temp.err($q$update public.reservations set reminder_2h_at = now() where id = 'e2740000-0000-4000-8000-0000000000a2'$q$, '42501', 'status: the customer cannot touch the reminder marks (no column grant)');
select pg_temp.chk(not exists (select 1 from information_schema.column_privileges where table_schema = 'public' and table_name = 'reservations' and grantee in ('authenticated', 'anon') and privilege_type = 'UPDATE' and column_name <> 'status'), 'grants: clients can UPDATE only the status column (the new columns are server-written)');
select pg_temp.logout();
select pg_temp.chk((select status = 'pending' and status_changed_by is null from public.reservations where id = 'e2740000-0000-4000-8000-0000000000a2'), 'status: after the refusals nothing changed');
delete from public.notifications;
-- staff 02 confirms
select pg_temp.login(2);
select public.set_reservation_status('e2740000-0000-4000-8000-0000000000a2', 'confirmed');
select pg_temp.logout();
select pg_temp.chk((select status = 'confirmed' and status_changed_by = pg_temp.u(2) from public.reservations where id = 'e2740000-0000-4000-8000-0000000000a2'), 'confirm: staff WITH permission confirms; status_changed_by = that staff');
select pg_temp.chk((select count(*) = 1 from public.notifications where type = 'reservation_confirmed' and user_id = pg_temp.u(4)
  and payload->>'business_name' = 'Bar Uno' and payload->>'reservation_id' = 'e2740000-0000-4000-8000-0000000000a2' and payload->>'timezone' = 'America/Santo_Domingo' and (payload->>'party_size')::int = 4 and payload ? 'reserved_at' and not (payload ? 'reason')), 'confirm: the customer gets reservation_confirmed with {business, reservation_id, reserved_at, timezone, party_size}');
select pg_temp.chk((select count(*) = 1 from public.notifications), 'confirm: only that one notification');
select pg_temp.login(1);
select public.set_reservation_status('e2740000-0000-4000-8000-0000000000a2', 'confirmed');
select pg_temp.logout();
select pg_temp.chk((select count(*) = 1 from public.notifications), 'confirm: confirming again does not notify again');
-- the owner changing a reservation they booked themselves (user_id = owner): no self-notification
select pg_temp.login(1);
select public.set_reservation_status('e2740000-0000-4000-8000-0000000000a3', 'confirmed');
select pg_temp.logout();
select pg_temp.chk((select count(*) = 1 from public.notifications), 'confirm: never notifies when the person who changes the status is the reservation''s own user');
select pg_temp.chk((select count(*) = 0 from public.notifications where user_id = pg_temp.u(1)), '... (the owner got nothing)');
-- a reservation by phone: confirm works, nobody to notify
select pg_temp.login(2);
select public.create_reservation('e2740000-0000-4000-8000-0000000000b1', now() + interval '7 days', 2, array['e2740000-0000-4000-8000-0000000000d2']::uuid[], null, null, 'Luis', null, null);
select pg_temp.logout();
select pg_temp.chk((select count(*) = 1 from public.reservations where customer_id in (select id from public.reservation_customers where first_name = 'Luis')), 'create_reservation: staff WITH permission creates a reservation by phone');
select pg_temp.chk((select is_reserved from public.tables where id = 'e2740000-0000-4000-8000-0000000000d2'), 'create_reservation: ... and marks its table (set_table_reserved accepts the permission)');
select pg_temp.chk((select count(*) = 1 from public.table_reservation_log where table_id = 'e2740000-0000-4000-8000-0000000000d2' and changed_by = pg_temp.u(2)), 'create_reservation: ... and logs who did it');
select pg_temp.login(2);
select public.set_reservation_status((select id from public.reservations where customer_id in (select id from public.reservation_customers where first_name = 'Luis')), 'confirmed');
select pg_temp.logout();
select pg_temp.chk((select count(*) = 1 from public.notifications), 'confirm: a phone reservation (no account) notifies nobody');

-- reject with a reason + tables released
delete from public.notifications;
insert into public.reservations (id, business_id, user_id, reserved_at, party_size, status) values ('e2740000-0000-4000-8000-0000000000a4', 'e2740000-0000-4000-8000-0000000000b1', pg_temp.u(10), now() + interval '8 days', 6, 'pending');
insert into public.reservation_tables (reservation_id, table_id) values ('e2740000-0000-4000-8000-0000000000a4', 'e2740000-0000-4000-8000-0000000000d1');
delete from public.notifications;
select pg_temp.login(2);
select pg_temp.err($q$select public.reject_reservation('e2740000-0000-4000-8000-0000000000a4', 'because I said so')$q$, 'BAD_REASON', 'reject: an unknown reason → BAD_REASON');
select public.reject_reservation('e2740000-0000-4000-8000-0000000000a4', 'group_too_large');
select pg_temp.logout();
select pg_temp.chk((select status = 'rejected' and status_reason = 'group_too_large' and status_changed_by = pg_temp.u(2) from public.reservations where id = 'e2740000-0000-4000-8000-0000000000a4'), 'reject: status rejected, reason saved, status_changed_by saved');
select pg_temp.chk((select not is_reserved from public.tables where id = 'e2740000-0000-4000-8000-0000000000d1'), 'reject: the reservation''s tables are released (like cancelled)');
select pg_temp.chk((select count(*) = 1 from public.notifications where type = 'reservation_rejected' and user_id = pg_temp.u(10) and payload->>'reason' = 'group_too_large' and (payload->>'party_size')::int = 6), 'reject: the customer gets reservation_rejected with the reason');
select pg_temp.login(1);
select pg_temp.err($q$select public.set_reservation_status('e2740000-0000-4000-8000-0000000000a4', 'confirmed')$q$, 'BAD_TRANSITION', 'confirm: a rejected reservation cannot be confirmed (BAD_TRANSITION)');
select pg_temp.logout();
-- rejecting without a reason; plain set_reservation_status('rejected') clears a stale reason? (it keeps the one reject_reservation set; without it the reason is null)
insert into public.reservations (id, business_id, user_id, reserved_at, party_size, status) values ('e2740000-0000-4000-8000-0000000000a5', 'e2740000-0000-4000-8000-0000000000b1', pg_temp.u(10), now() + interval '9 days', 2, 'pending');
delete from public.notifications;
select pg_temp.login(1);
select public.set_reservation_status('e2740000-0000-4000-8000-0000000000a5', 'rejected');
select pg_temp.logout();
select pg_temp.chk((select count(*) = 1 and bool_and(not (payload ? 'reason')) from public.notifications where type = 'reservation_rejected'), 'reject: without a reason the notice has no reason key');
-- cancelled / arrived cannot be confirmed
update public.reservations set status = 'cancelled' where id = 'e2740000-0000-4000-8000-0000000000a3';
select pg_temp.login(1);
select pg_temp.err($q$select public.set_reservation_status('e2740000-0000-4000-8000-0000000000a3', 'confirmed')$q$, 'BAD_TRANSITION', 'confirm: a cancelled reservation cannot be confirmed');
select pg_temp.err($q$select public.set_reservation_status('e2740000-0000-4000-8000-0000000000a3', 'wat')$q$, 'BAD_STATUS', 'status: an unknown status → BAD_STATUS');
select pg_temp.logout();
-- cancelled / no_show still release tables
insert into public.reservations (id, business_id, user_id, reserved_at, party_size, status) values ('e2740000-0000-4000-8000-0000000000a6', 'e2740000-0000-4000-8000-0000000000b1', null, now() + interval '9 days', 2, 'pending');
insert into public.reservation_tables (reservation_id, table_id) values ('e2740000-0000-4000-8000-0000000000a6', 'e2740000-0000-4000-8000-0000000000d1');
update public.tables set is_reserved = true where id = 'e2740000-0000-4000-8000-0000000000d1';
select pg_temp.login(1);
select public.set_reservation_status('e2740000-0000-4000-8000-0000000000a6', 'cancelled');
select pg_temp.logout();
select pg_temp.chk((select not is_reserved from public.tables where id = 'e2740000-0000-4000-8000-0000000000d1'), 'cancelled: still releases the tables');
-- the customer cancels their own reservation: allowed, no notification
delete from public.notifications;
select pg_temp.login(4);
update public.reservations set status = 'cancelled' where id = 'e2740000-0000-4000-8000-0000000000a2';
select pg_temp.logout();
select pg_temp.chk((select status = 'cancelled' from public.reservations where id = 'e2740000-0000-4000-8000-0000000000a2') and (select count(*) = 0 from public.notifications), 'cancel: the customer can still cancel their own, and nothing is notified');
-- platform admin can confirm
insert into public.reservations (id, business_id, user_id, reserved_at, party_size, status) values ('e2740000-0000-4000-8000-0000000000a7', 'e2740000-0000-4000-8000-0000000000b1', pg_temp.u(10), now() + interval '10 days', 2, 'pending');
select pg_temp.login(9);
select public.set_reservation_status('e2740000-0000-4000-8000-0000000000a7', 'confirmed');
select pg_temp.logout();
select pg_temp.chk((select status = 'confirmed' from public.reservations where id = 'e2740000-0000-4000-8000-0000000000a7'), 'status: a platform admin can confirm');
-- update_reservation: staff WITH permission yes, WITHOUT no
select pg_temp.login(3);
select pg_temp.err($q$select public.update_reservation('e2740000-0000-4000-8000-0000000000a7', now() + interval '11 days', 3, null, null, null, 'Z', null, null)$q$, 'NOT_ALLOWED', 'update_reservation: staff WITHOUT permission → NOT_ALLOWED');
select pg_temp.login(2);
select public.update_reservation('e2740000-0000-4000-8000-0000000000a7', now() + interval '11 days', 3, null, null, null, 'Z', null, null);
select pg_temp.logout();
select pg_temp.chk((select party_size = 3 from public.reservations where id = 'e2740000-0000-4000-8000-0000000000a7'), 'update_reservation: staff WITH permission can edit');

-- ───────── 6. reminders ─────────
delete from public.notifications;
delete from public.reservations;
set local session_replication_role = replica;
insert into public.reservations (id, business_id, user_id, reserved_at, party_size, status, is_waitlist, created_at) values
  ('e2740000-0000-4000-8000-0000000000f1', 'e2740000-0000-4000-8000-0000000000b1', pg_temp.u(4),  now() + interval '24 hours',                    2, 'pending',   false, now() - interval '2 days'),
  ('e2740000-0000-4000-8000-0000000000f2', 'e2740000-0000-4000-8000-0000000000b1', pg_temp.u(10), now() + interval '2 hours',                     5, 'confirmed', false, now() - interval '2 days'),
  ('e2740000-0000-4000-8000-0000000000f3', 'e2740000-0000-4000-8000-0000000000b1', pg_temp.u(4),  now() + interval '5 hours',                     2, 'confirmed', false, now() - interval '2 days'),   -- outside both windows
  ('e2740000-0000-4000-8000-0000000000f4', 'e2740000-0000-4000-8000-0000000000b1', pg_temp.u(4),  now() + interval '24 hours',                    2, 'cancelled', false, now() - interval '2 days'),
  ('e2740000-0000-4000-8000-0000000000f5', 'e2740000-0000-4000-8000-0000000000b1', pg_temp.u(4),  now() + interval '24 hours',                    2, 'rejected',  false, now() - interval '2 days'),
  ('e2740000-0000-4000-8000-0000000000f6', 'e2740000-0000-4000-8000-0000000000b1', pg_temp.u(4),  now() + interval '24 hours',                    2, 'pending',   true,  now() - interval '2 days'),  -- waitlist
  ('e2740000-0000-4000-8000-0000000000f7', 'e2740000-0000-4000-8000-0000000000b1', null,          now() + interval '24 hours',                    2, 'pending',   false, now() - interval '2 days'),  -- by phone: no account
  ('e2740000-0000-4000-8000-0000000000f8', 'e2740000-0000-4000-8000-0000000000b1', pg_temp.u(4),  now() + interval '24 hours',                    2, 'pending',   false, now() - interval '5 minutes'), -- booked just now
  ('e2740000-0000-4000-8000-0000000000f9', 'e2740000-0000-4000-8000-0000000000b2', pg_temp.u(10), now() + interval '23 hours 40 minutes',         2, 'pending',   false, now() - interval '2 days'),
  ('e2740000-0000-4000-8000-0000000000fa', 'e2740000-0000-4000-8000-0000000000b2', pg_temp.u(10), now() + interval '25 hours',                    2, 'pending',   false, now() - interval '2 days'),  -- not yet
  ('e2740000-0000-4000-8000-0000000000fb', 'e2740000-0000-4000-8000-0000000000b2', pg_temp.u(10), now() - interval '1 hour',                      2, 'pending',   false, now() - interval '2 days');  -- already past
set local session_replication_role = origin;
create temp table t_n as select public.reservation_reminders() as n;
select pg_temp.chk((select n = 3 from t_n), 'reminders: first run sends 3 (f1 24h, f9 24h, f2 2h) and none of the excluded ones');
select pg_temp.chk((select count(*) = 2 from public.notifications where type = 'reservation_reminder' and (payload->>'hours_before')::int = 24), 'reminders: 2 reminders of 24 h …');
select pg_temp.chk((select count(*) = 1 from public.notifications where type = 'reservation_reminder' and (payload->>'hours_before')::int = 2 and payload->>'reservation_id' = 'e2740000-0000-4000-8000-0000000000f2'), 'reminders: … and 1 of 2 h (the 5-hour one waits)');

select pg_temp.chk((select reminder_24h_at is not null and reminder_2h_at is null from public.reservations where id = 'e2740000-0000-4000-8000-0000000000f1'), 'reminders: f1 got the 24 h mark only');
select pg_temp.chk((select reminder_2h_at is not null and reminder_24h_at is null from public.reservations where id = 'e2740000-0000-4000-8000-0000000000f2'), 'reminders: f2 got the 2 h mark only');
select pg_temp.chk((select bool_and(reminder_24h_at is null and reminder_2h_at is null) from public.reservations where id in ('e2740000-0000-4000-8000-0000000000f3', 'e2740000-0000-4000-8000-0000000000f4', 'e2740000-0000-4000-8000-0000000000f5', 'e2740000-0000-4000-8000-0000000000f6', 'e2740000-0000-4000-8000-0000000000f7', 'e2740000-0000-4000-8000-0000000000f8', 'e2740000-0000-4000-8000-0000000000fa', 'e2740000-0000-4000-8000-0000000000fb')), 'reminders: outside the windows, cancelled, rejected, waitlist, by phone, booked 5 min ago, past → nothing marked');
select pg_temp.chk((select count(*) = 1 from public.notifications where type = 'reservation_reminder' and user_id = pg_temp.u(10) and payload->>'reservation_id' = 'e2740000-0000-4000-8000-0000000000f9'
  and payload->>'business_name' = 'Bar Dos' and payload->>'timezone' = 'America/New_York' and (payload->>'party_size')::int = 2 and (payload->>'hours_before')::int = 24 and payload ? 'reserved_at'), 'reminders: payload {business_id, business_name, reservation_id, reserved_at, timezone of the venue, party_size, hours_before}');
select pg_temp.chk((select (payload->>'party_size')::int = 5 and payload->>'business_name' = 'Bar Uno' and payload->>'timezone' = 'America/Santo_Domingo' from public.notifications where type = 'reservation_reminder' and (payload->>'hours_before')::int = 2), 'reminders: the 2 h one carries party_size 5 and the venue zone');
-- second run: nothing again (once per column)
create temp table t_n2 as select public.reservation_reminders() as n;
select pg_temp.chk((select n = 0 from t_n2) and (select count(*) = 3 from public.notifications where type = 'reservation_reminder'), 'reminders: the second run sends nothing (once only)');
-- booked 5 minutes ago becomes eligible once it is older than 30 minutes
update public.reservations set created_at = now() - interval '1 hour' where id = 'e2740000-0000-4000-8000-0000000000f8';
create temp table t_n3 as select public.reservation_reminders() as n;
select pg_temp.chk((select n = 1 from t_n3) and (select count(*) = 1 from public.notifications where payload->>'reservation_id' = 'e2740000-0000-4000-8000-0000000000f8'), 'reminders: a reservation older than 30 min is picked up (once)');
-- f1 already had its 24 h reminder; when it is 2 h away it gets the 2 h one, and only that
update public.reservations set reserved_at = now() + interval '2 hours' where id = 'e2740000-0000-4000-8000-0000000000f1';
create temp table t_n4 as select public.reservation_reminders() as n;
select pg_temp.chk((select n = 1 from t_n4) and (select count(*) = 1 from public.notifications where payload->>'reservation_id' = 'e2740000-0000-4000-8000-0000000000f1' and (payload->>'hours_before')::int = 2) and (select count(*) = 1 from public.notifications where payload->>'reservation_id' = 'e2740000-0000-4000-8000-0000000000f1' and (payload->>'hours_before')::int = 24), 'reminders: after the 24 h one, the 2 h one comes later (each exactly once)');
-- a reservation cancelled before its reminder window gets none
update public.reservations set reserved_at = now() + interval '24 hours', status = 'cancelled' where id = 'e2740000-0000-4000-8000-0000000000fa';
create temp table t_n5 as select public.reservation_reminders() as n;
select pg_temp.chk((select n = 0 from t_n5), 'reminders: a cancelled reservation never gets one');
select pg_temp.chk(not has_function_privilege('authenticated', 'public.reservation_reminders()', 'execute') and not has_function_privilege('anon', 'public.reservation_reminders()', 'execute'), 'reminders: only the server can run it (not authenticated / anon)');
select pg_temp.chk((select count(*) = 1 from cron.job where jobname = 'reservation-reminders' and schedule = '*/10 * * * *' and command ~ 'reservation_reminders'), 'cron: reservation-reminders every 10 min, once (274 applied twice)');

-- ───────── 7. push trigger list ─────────
select pg_temp.chk((select count(*) = 1 from pg_trigger where tgname = 'trg_push_on_notification_insert' and not tgisinternal), 'push: one trigger');
select pg_temp.chk((select bool_and(pg_get_triggerdef(t.oid) ~ ('''' || x || '''')) from pg_trigger t, unnest(array['reservation_confirmed','reservation_rejected','reservation_requested','reservation_reminder']) x where t.tgname = 'trg_push_on_notification_insert'), 'push: the 4 new types are in the list');
select pg_temp.chk((select bool_and(pg_get_triggerdef(t.oid) ~ ('''' || x || '''')) from pg_trigger t, unnest(array['follower','like','comment','work_alert','match_like','match_super','match_match','match_new_people','order_status','gift_offer','gift_response','business_closed','reservation_cancelled','staff_added','staff_removed']) x where t.tgname = 'trg_push_on_notification_insert'), 'push: the 15 types that were already there are still there');
select pg_temp.chk((select count(*) = 1 from pg_trigger where tgname = 'trg_reservations_notify' and not tgisinternal) and (select count(*) = 1 from pg_trigger where tgname = 'trg_reservations_requested' and not tgisinternal) and (select count(*) = 1 from pg_trigger where tgname = 'reservations_customer_guard' and not tgisinternal), 'triggers: one of each (274 applied twice) and the customer guard untouched');
select pg_temp.chk((select count(*) = 4 from pg_policy where polrelid in ('public.reservations'::regclass, 'public.reservation_tables'::regclass, 'public.reservation_customers'::regclass) and polname ~ 'staff'), 'rls: the 4 staff policies exist once each (274 applied twice)');

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
