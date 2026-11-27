#!/usr/bin/env bash
# Prueba LOCAL de la migración 277 (quién cambió el estado, aviso al local cuando el cliente cancela, caducidad de reservas sin respuesta). TODO dentro de UNA transacción que termina en ROLLBACK
# (258, 262, 265–275 se aplican dentro; la 277 dos veces: idempotente). Solo contra el contenedor local.   bash supabase/scripts/test_277_local.sh
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
for m in 258_storage_user_objects 262_review_mode 265_owner_account_close 266_stale_orders_and_email_retry 267_retention_and_report_evidence 268_users_plan_interval_trial_used 269_business_plan_requests 270_business_owner_is_pro 271_users_plan_status_past_due 272_report_evidence 273_reservation_slots_staff_notify 274_reservation_confirm_reminders 275_reservation_customer_card; do
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
create function pg_temp.u(n int) returns uuid language sql as $$ select ('e2770000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid $$;
grant execute on function pg_temp.u(int) to public;
create function pg_temp.r(n int) returns uuid language sql as $$ select ('e2770000-0000-4000-8000-00000000' || lpad(n::text, 4, '0'))::uuid $$;
grant execute on function pg_temp.r(int) to public;

-- what 274 left (the 277 body of set_reservation_status starts from it)
create temp table t_old as select pg_get_functiondef('public.set_reservation_status(uuid,text)'::regprocedure) as set_def, pg_get_functiondef('public.reservations_notify()'::regprocedure) as notify_def;
grant all on t_old to public;
SQL
cat "$ROOT/supabase/migrations/277_reservation_cancel_notify_expire.sql"
cat "$ROOT/supabase/migrations/277_reservation_cancel_notify_expire.sql"
cat <<'SQL'

-- people: 01 owner of b1 · 02 staff WITH reservations_manage · 03 staff WITHOUT · 04 customer "Carla" · 05 PENDING staff with the permission · 06 owner of b2 · 07 staff of b2 with the permission
--         09 platform admin · 10 customer B (no display_name)
insert into auth.users (id, instance_id, aud, role, email)
  select pg_temp.u(n), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'u277' || n || '@example.com' from generate_series(1, 10) n;
insert into public.users (id, username) select pg_temp.u(n), 'u277_' || n from generate_series(1, 10) n on conflict (id) do nothing;
update public.users set plan = 'pro' where id in (pg_temp.u(1), pg_temp.u(6));
update public.users set role = 'super_admin' where id = pg_temp.u(9);
update public.users set display_name = 'Carla' where id = pg_temp.u(4);
update public.users set display_name = null, username = 'u277_10' where id = pg_temp.u(10);   -- an auth.users insert may create the profile with its own names

set local session_replication_role = replica;
insert into public.businesses (id, owner_id, name, slug, status, is_active, timezone, hours) values
  ('e2770000-0000-4000-8000-0000000000b1', pg_temp.u(1), 'Bar Uno',  'bar-277-1', 'verified', true, 'America/Santo_Domingo', '{}'::jsonb),
  ('e2770000-0000-4000-8000-0000000000b2', pg_temp.u(6), 'Bar Dos',  'bar-277-2', 'verified', true, 'America/New_York',      '{}'::jsonb);
set local session_replication_role = origin;
insert into public.custom_roles (id, business_id, name, permissions) values
  ('e2770000-0000-4000-8000-0000000000c1', 'e2770000-0000-4000-8000-0000000000b1', 'Anfitrión', '{"reservations_manage": true}'),
  ('e2770000-0000-4000-8000-0000000000c2', 'e2770000-0000-4000-8000-0000000000b1', 'Cajero',    '{"reservations_manage": false, "pos_access": true}'),
  ('e2770000-0000-4000-8000-0000000000c3', 'e2770000-0000-4000-8000-0000000000b2', 'Anfitrión2', '{"reservations_manage": true}');
insert into public.employees (id, business_id, user_id, role, status, custom_role_id) values
  ('e2770000-0000-4000-8000-000000000e02', 'e2770000-0000-4000-8000-0000000000b1', pg_temp.u(2), 'staff', 'accepted', 'e2770000-0000-4000-8000-0000000000c1'),
  ('e2770000-0000-4000-8000-000000000e03', 'e2770000-0000-4000-8000-0000000000b1', pg_temp.u(3), 'staff', 'accepted', 'e2770000-0000-4000-8000-0000000000c2'),
  ('e2770000-0000-4000-8000-000000000e05', 'e2770000-0000-4000-8000-0000000000b1', pg_temp.u(5), 'staff', 'pending',  'e2770000-0000-4000-8000-0000000000c1'),
  ('e2770000-0000-4000-8000-000000000e07', 'e2770000-0000-4000-8000-0000000000b2', pg_temp.u(7), 'staff', 'accepted', 'e2770000-0000-4000-8000-0000000000c3');
insert into public.tables (id, business_id, label) values
  ('e2770000-0000-4000-8000-0000000000d1', 'e2770000-0000-4000-8000-0000000000b1', 'M1'),
  ('e2770000-0000-4000-8000-0000000000d2', 'e2770000-0000-4000-8000-0000000000b1', 'M2');

-- ───────── 0. schema, privileges, idempotency, trigger order ─────────
select pg_temp.chk((select count(*) = 1 from pg_constraint where conrelid = 'public.reservations'::regclass and conname = 'reservations_status_check')
  and (select pg_get_constraintdef(oid) like '%expired%' from pg_constraint where conrelid = 'public.reservations'::regclass and conname = 'reservations_status_check'), 'schema: reservations_status_check exists once and admits expired (277 applied twice)');
select pg_temp.err($q$insert into public.reservations (business_id, user_id, reserved_at, party_size, status) values ('e2770000-0000-4000-8000-0000000000b1', null, now() + interval '3 days', 2, 'bogus')$q$, 'reservations_status_check', 'schema: an unknown status is still refused');
select pg_temp.chk((select count(*) = 1 from pg_trigger where tgname = 'reservations_stamp_status_change' and tgrelid = 'public.reservations'::regclass and not tgisinternal), 'schema: one reservations_stamp_status_change trigger (277 applied twice)');
select pg_temp.chk((select array_position(array_agg(tgname::text order by tgname), 'reservations_customer_guard') < array_position(array_agg(tgname::text order by tgname), 'reservations_stamp_status_change')
  from pg_trigger where tgrelid = 'public.reservations'::regclass and not tgisinternal and (tgtype & 2) = 2 and (tgtype & 16) = 16), 'order: the BEFORE UPDATE guard fires before the stamp (alphabetical order of the names)');
select pg_temp.chk((select count(*) = 1 from cron.job where jobname = 'reservations-expire' and schedule = '*/10 * * * *' and command ~ 'reservations_expire'), 'cron: reservations-expire every 10 min, once (277 applied twice)');
select pg_temp.chk((select count(*) = 1 from cron.job where jobname = 'reservation-reminders'), 'cron: the 274 job is still there');
select pg_temp.chk(has_function_privilege('service_role', 'public.reservations_expire()', 'execute')
  and not has_function_privilege('authenticated', 'public.reservations_expire()', 'execute') and not has_function_privilege('anon', 'public.reservations_expire()', 'execute'), 'privileges: only service_role runs reservations_expire()');
select pg_temp.chk(not has_function_privilege('authenticated', 'public.reservations_stamp_status_change()', 'execute') and not has_function_privilege('anon', 'public.reservations_stamp_status_change()', 'execute'), 'privileges: the stamp function is not callable by authenticated / anon');
select pg_temp.chk(replace(pg_get_functiondef('public.set_reservation_status(uuid,text)'::regprocedure),
  E'  -- una reserva caducada (sin respuesta del local) es terminal\n  if v_old = ''expired'' then raise exception ''BAD_TRANSITION''; end if;\n\n', '') = (select set_def from t_old), 'set_reservation_status: the 277 body = the 274 body + the expired guard (nothing removed)');
select pg_temp.chk((select bool_and(pg_get_triggerdef(t.oid) ~ ('''' || x || ''''))
  from pg_trigger t, unnest(array['follower','like','comment','work_alert','match_like','match_super','match_match','match_new_people','order_status','gift_offer','gift_response','business_closed','reservation_cancelled','staff_added','staff_removed',
                                  'reservation_confirmed','reservation_rejected','reservation_requested','reservation_reminder','reservation_cancelled_by_customer']) x
  where t.tgname = 'trg_push_on_notification_insert'), 'push: the 19 types of 274 plus reservation_cancelled_by_customer');
select pg_temp.chk((select count(*) = 1 from pg_trigger where tgname = 'trg_push_on_notification_insert' and not tgisinternal), 'push: one trigger');

-- ───────── 1. N-02: who changed the status ─────────
insert into public.reservations (id, business_id, user_id, reserved_at, party_size, status) values
  (pg_temp.r(1), 'e2770000-0000-4000-8000-0000000000b1', pg_temp.u(4), now() + interval '3 days', 4, 'pending'),
  (pg_temp.r(2), 'e2770000-0000-4000-8000-0000000000b1', pg_temp.u(4), now() + interval '4 days', 2, 'pending'),
  (pg_temp.r(3), 'e2770000-0000-4000-8000-0000000000b1', pg_temp.u(10), now() + interval '5 days', 3, 'pending'),
  (pg_temp.r(4), 'e2770000-0000-4000-8000-0000000000b1', pg_temp.u(4), now() + interval '6 days', 2, 'pending');
delete from public.notifications;
-- the owner confirms (set_reservation_status), then the customer cancels with a direct UPDATE (what the app does)
select pg_temp.login(1);
select public.set_reservation_status(pg_temp.r(1), 'confirmed');
select pg_temp.logout();
select pg_temp.chk((select status = 'confirmed' and status_changed_by = pg_temp.u(1) from public.reservations where id = pg_temp.r(1)), 'stamp: the owner confirmed → status_changed_by = the owner');
select pg_temp.login(4);
update public.reservations set status = 'cancelled' where id = pg_temp.r(1);
select pg_temp.logout();
select pg_temp.chk((select status = 'cancelled' and status_changed_by = pg_temp.u(4) from public.reservations where id = pg_temp.r(1)), 'stamp (N-02): the customer cancelled with a direct UPDATE → status_changed_by = the customer, not the owner who confirmed');
select pg_temp.login(4);
update public.reservations set status = 'cancelled' where id = pg_temp.r(2);
select pg_temp.logout();
select pg_temp.chk((select status = 'cancelled' and status_changed_by = pg_temp.u(4) from public.reservations where id = pg_temp.r(2)), 'stamp: the customer cancelled a pending one → the customer');
select pg_temp.login(1);
update public.reservations set status = 'cancelled' where id = pg_temp.r(3);
select pg_temp.logout();
select pg_temp.chk((select status = 'cancelled' and status_changed_by = pg_temp.u(1) from public.reservations where id = pg_temp.r(3)), 'stamp: the owner cancelled with a direct UPDATE → the owner');
update public.reservations set status = 'pending' where id = pg_temp.r(3);
select pg_temp.chk((select status = 'pending' and status_changed_by = pg_temp.u(1) from public.reservations where id = pg_temp.r(3)), 'stamp: a change without a session (cron / service role) leaves status_changed_by as it was');
-- the guard is intact
select pg_temp.login(4);
select pg_temp.err($q$update public.reservations set status = 'confirmed' where id = pg_temp.r(4)$q$, 'customer_cannot_change_status', 'guard: a customer still cannot confirm (the stamp does not weaken it)');
select pg_temp.err($q$update public.reservations set party_size = 9 where id = pg_temp.r(4)$q$, 'permission denied', 'guard: a customer cannot change the party size (UPDATE is granted on status only)');
select pg_temp.logout();
select pg_temp.chk((select status = 'pending' and status_changed_by is null and party_size = 2 from public.reservations where id = pg_temp.r(4)), 'guard: nothing changed after the rejected attempts');
delete from public.reservations;
delete from public.notifications;

-- ───────── 2. N-01: the venue is told when the customer cancels ─────────
-- (a) confirmed reservation, the customer cancels → owner + staff with permission, nobody else
insert into public.reservations (id, business_id, user_id, reserved_at, party_size, status) values
  (pg_temp.r(10), 'e2770000-0000-4000-8000-0000000000b1', pg_temp.u(4), now() + interval '3 days', 4, 'confirmed');
delete from public.notifications;
select pg_temp.login(4);
update public.reservations set status = 'cancelled' where id = pg_temp.r(10);
select pg_temp.logout();
select pg_temp.chk((select count(*) = 1 from public.notifications where type = 'reservation_cancelled_by_customer'), 'cancel notice: exactly 1 notification (the owner only, like reservation_requested)');
select pg_temp.chk((select array_agg(user_id) = array[pg_temp.u(1)] from public.notifications where type = 'reservation_cancelled_by_customer'), 'cancel notice: to the owner');
select pg_temp.chk((select count(*) = 0 from public.notifications where user_id in (pg_temp.u(2), pg_temp.u(3), pg_temp.u(5), pg_temp.u(6), pg_temp.u(7), pg_temp.u(4), pg_temp.u(9))), 'cancel notice: NOT the staff WITH the permission (TODO, like reservation_requested), staff without it, pending staff, the other venue, the customer (author), an admin');
select pg_temp.chk((select payload->>'business_name' = 'Bar Uno' and payload->>'business_id' = 'e2770000-0000-4000-8000-0000000000b1' and payload->>'reservation_id' = pg_temp.r(10)::text
                           and payload->>'timezone' = 'America/Santo_Domingo' and (payload->>'party_size')::int = 4 and payload ? 'reserved_at' and payload->>'customer_name' = 'Carla'
                    from public.notifications where type = 'reservation_cancelled_by_customer' and user_id = pg_temp.u(1)), 'cancel notice: payload {business_id, business_name, reservation_id, reserved_at, timezone of the venue, party_size, customer_name}');
select pg_temp.chk((select count(*) = 0 from public.notifications where type in ('reservation_confirmed', 'reservation_rejected')), 'cancel notice: nothing is sent to the customer');
-- (b) pending reservation of a customer without display_name → the username
insert into public.reservations (id, business_id, user_id, reserved_at, party_size, status) values
  (pg_temp.r(11), 'e2770000-0000-4000-8000-0000000000b1', pg_temp.u(10), now() + interval '3 days', 2, 'pending');
delete from public.notifications;
select pg_temp.login(10);
update public.reservations set status = 'cancelled' where id = pg_temp.r(11);
select pg_temp.logout();
select pg_temp.chk((select count(*) = 1 and bool_and(payload->>'customer_name' = 'u277_10') from public.notifications where type = 'reservation_cancelled_by_customer'), 'cancel notice: a pending reservation notifies too; without display_name it carries the username');
-- (c) the owner cancels: no new notice
insert into public.reservations (id, business_id, user_id, reserved_at, party_size, status) values
  (pg_temp.r(12), 'e2770000-0000-4000-8000-0000000000b1', pg_temp.u(4), now() + interval '3 days', 2, 'confirmed');
delete from public.notifications;
select pg_temp.login(1);
select public.set_reservation_status(pg_temp.r(12), 'cancelled');
select pg_temp.logout();
select pg_temp.chk((select count(*) = 0 from public.notifications), 'owner cancels: no notification (as in 274)');
-- (d) the owner cancels with a direct UPDATE: no notice either
insert into public.reservations (id, business_id, user_id, reserved_at, party_size, status) values
  (pg_temp.r(13), 'e2770000-0000-4000-8000-0000000000b1', pg_temp.u(4), now() + interval '3 days', 2, 'pending');
delete from public.notifications;
select pg_temp.login(1);
update public.reservations set status = 'cancelled' where id = pg_temp.r(13);
select pg_temp.logout();
select pg_temp.chk((select count(*) = 0 from public.notifications), 'owner cancels (direct UPDATE): no notification');
-- (e) staff with permission cancels: no notice
insert into public.reservations (id, business_id, user_id, reserved_at, party_size, status) values
  (pg_temp.r(14), 'e2770000-0000-4000-8000-0000000000b1', pg_temp.u(4), now() + interval '3 days', 2, 'pending');
delete from public.notifications;
select pg_temp.login(2);
select public.set_reservation_status(pg_temp.r(14), 'cancelled');
select pg_temp.logout();
select pg_temp.chk((select count(*) = 0 from public.notifications) and (select status_changed_by = pg_temp.u(2) from public.reservations where id = pg_temp.r(14)), 'staff cancels: no notification, and status_changed_by = that staff member');
-- (f) the owner reserved at their own venue and cancels it as a customer: the author is the only recipient, so nobody is notified (staff are not recipients)
insert into public.reservations (id, business_id, user_id, reserved_at, party_size, status) values
  (pg_temp.r(15), 'e2770000-0000-4000-8000-0000000000b1', pg_temp.u(1), now() + interval '3 days', 2, 'pending');
delete from public.notifications;
select pg_temp.login(1);
update public.reservations set status = 'cancelled' where id = pg_temp.r(15);
select pg_temp.logout();
select pg_temp.chk((select count(*) = 0 from public.notifications where type = 'reservation_cancelled_by_customer'), 'cancel notice: the author (owner cancelling their own booking) is never notified, and staff are not recipients');
-- (g) not from a live state: an arrived reservation the customer cancels says nothing; a cancel of an already cancelled one neither
insert into public.reservations (id, business_id, user_id, reserved_at, party_size, status) values
  (pg_temp.r(16), 'e2770000-0000-4000-8000-0000000000b1', pg_temp.u(4), now() - interval '1 hour', 2, 'arrived'),
  (pg_temp.r(17), 'e2770000-0000-4000-8000-0000000000b1', pg_temp.u(4), now() + interval '3 days', 2, 'cancelled');
delete from public.notifications;
select pg_temp.login(4);
update public.reservations set status = 'cancelled' where id = pg_temp.r(16);
update public.reservations set status = 'cancelled' where id = pg_temp.r(17);
select pg_temp.logout();
select pg_temp.chk((select count(*) = 0 from public.notifications), 'cancel notice: not from arrived, and not for a status that did not change');
-- (h) a phone booking (no account) cancelled by the owner: nobody
insert into public.reservations (id, business_id, user_id, reserved_at, party_size, status) values
  (pg_temp.r(18), 'e2770000-0000-4000-8000-0000000000b1', null, now() + interval '3 days', 2, 'pending');
delete from public.notifications;
select pg_temp.login(1);
select public.set_reservation_status(pg_temp.r(18), 'cancelled');
select pg_temp.logout();
select pg_temp.chk((select count(*) = 0 from public.notifications), 'phone booking cancelled by the venue: no notification');
-- (i) what 274 did is intact: confirm / reject notify the customer, never the author
insert into public.reservations (id, business_id, user_id, reserved_at, party_size, status) values
  (pg_temp.r(19), 'e2770000-0000-4000-8000-0000000000b1', pg_temp.u(4), now() + interval '3 days', 2, 'pending'),
  (pg_temp.r(20), 'e2770000-0000-4000-8000-0000000000b1', pg_temp.u(4), now() + interval '3 days', 2, 'pending');
delete from public.notifications;
select pg_temp.login(1);
select public.set_reservation_status(pg_temp.r(19), 'confirmed');
select public.reject_reservation(pg_temp.r(20), 'no_availability');
select pg_temp.logout();
select pg_temp.chk((select count(*) = 2 from public.notifications where user_id = pg_temp.u(4) and type in ('reservation_confirmed', 'reservation_rejected'))
  and (select count(*) = 0 from public.notifications where type = 'reservation_cancelled_by_customer'), 'regression (274): confirmed / rejected still notify the customer (and nothing else)');
select pg_temp.chk((select payload->>'reason' = 'no_availability' from public.notifications where type = 'reservation_rejected'), 'regression (274): the rejection reason travels in the notice');
delete from public.reservations;
delete from public.notifications;

-- ───────── 3. H-030 / H-059: unanswered reservations expire ─────────
insert into public.reservations (id, business_id, user_id, reserved_at, party_size, status, is_waitlist) values
  (pg_temp.r(30), 'e2770000-0000-4000-8000-0000000000b1', pg_temp.u(4),  now() - interval '3 hours',  2, 'pending',   false),   -- expires
  (pg_temp.r(31), 'e2770000-0000-4000-8000-0000000000b1', pg_temp.u(4),  now() - interval '1 hour',   2, 'pending',   false),   -- still within the 2 h
  (pg_temp.r(32), 'e2770000-0000-4000-8000-0000000000b1', pg_temp.u(4),  now() - interval '5 hours',  2, 'confirmed', false),   -- confirmed: untouched
  (pg_temp.r(33), 'e2770000-0000-4000-8000-0000000000b1', null,          now() - interval '4 hours',  2, 'pending',   false),   -- phone booking, with table d1: expires and frees it
  (pg_temp.r(34), 'e2770000-0000-4000-8000-0000000000b1', pg_temp.u(10), now() + interval '2 days',   2, 'pending',   false),   -- future: untouched
  (pg_temp.r(35), 'e2770000-0000-4000-8000-0000000000b1', pg_temp.u(4),  now() - interval '5 hours',  2, 'arrived',   false),   -- arrived: untouched
  (pg_temp.r(36), 'e2770000-0000-4000-8000-0000000000b1', pg_temp.u(4),  now() - interval '6 hours',  2, 'cancelled', false),   -- cancelled: untouched
  (pg_temp.r(37), 'e2770000-0000-4000-8000-0000000000b2', pg_temp.u(10), now() - interval '9 hours',  2, 'pending',   true),    -- waitlist of another venue: expires too
  (pg_temp.r(38), 'e2770000-0000-4000-8000-0000000000b1', null,          now() - interval '3 hours',  2, 'pending',   false),   -- with table d2 that a LIVE reservation (r39) also holds: d2 stays reserved
  (pg_temp.r(39), 'e2770000-0000-4000-8000-0000000000b1', null,          now() + interval '1 day',    2, 'confirmed', false);
insert into public.reservation_tables (reservation_id, table_id) values
  (pg_temp.r(33), 'e2770000-0000-4000-8000-0000000000d1'),
  (pg_temp.r(38), 'e2770000-0000-4000-8000-0000000000d2'),
  (pg_temp.r(39), 'e2770000-0000-4000-8000-0000000000d2');
update public.tables set is_reserved = true, reserved_note = 'x', reserved_until = now() where id in ('e2770000-0000-4000-8000-0000000000d1', 'e2770000-0000-4000-8000-0000000000d2');
delete from public.notifications;
delete from public.table_reservation_log;
select pg_temp.chk((select reserved from public.reservation_slot_load('e2770000-0000-4000-8000-0000000000b1', now() - interval '3 hours'))
  = (select count(*) from public.reservations r where r.business_id = 'e2770000-0000-4000-8000-0000000000b1' and r.status in ('pending', 'confirmed', 'arrived') and not r.is_waitlist
        and (r.reserved_at at time zone public.business_tz(r.business_id))::date = ((now() - interval '3 hours') at time zone public.business_tz(r.business_id))::date), 'slot load: counts only pending / confirmed / arrived (before the run)');
create temp table t_e1 as select public.reservations_expire() as n;
select pg_temp.chk((select n = 4 from t_e1), 'expire: first run expires 4 (r30, r33, r37, r38)');
select pg_temp.chk((select count(*) = 4 and bool_and(status_changed_by is null) from public.reservations where status = 'expired' and id in (pg_temp.r(30), pg_temp.r(33), pg_temp.r(37), pg_temp.r(38))), 'expire: those 4 are expired with status_changed_by = null');
select pg_temp.chk((select status = 'pending' from public.reservations where id = pg_temp.r(31)) and (select status = 'confirmed' from public.reservations where id = pg_temp.r(32))
  and (select status = 'pending' from public.reservations where id = pg_temp.r(34)) and (select status = 'arrived' from public.reservations where id = pg_temp.r(35))
  and (select status = 'cancelled' from public.reservations where id = pg_temp.r(36)) and (select status = 'confirmed' from public.reservations where id = pg_temp.r(39)), 'expire: pending within 2 h, confirmed, future pending, arrived, cancelled are untouched');
select pg_temp.chk((select not is_reserved and reserved_note is null and reserved_until is null from public.tables where id = 'e2770000-0000-4000-8000-0000000000d1'), 'expire: the table of the expired reservation is released');
select pg_temp.chk((select count(*) = 1 from public.table_reservation_log where table_id = 'e2770000-0000-4000-8000-0000000000d1' and action = 'released' and changed_by is null), 'expire: ... and the release is logged');
select pg_temp.chk((select is_reserved from public.tables where id = 'e2770000-0000-4000-8000-0000000000d2'), 'expire: a table a live reservation also holds stays reserved');
select pg_temp.chk((select count(*) = 0 from public.notifications), 'expire: nobody is notified');
create temp table t_e2 as select public.reservations_expire() as n;
select pg_temp.chk((select n = 0 from t_e2), 'expire: the second run does nothing');
select pg_temp.chk((select reserved from public.reservation_slot_load('e2770000-0000-4000-8000-0000000000b1', now() - interval '3 hours'))
  = (select count(*) from public.reservations r where r.business_id = 'e2770000-0000-4000-8000-0000000000b1' and r.status in ('pending', 'confirmed', 'arrived') and not r.is_waitlist
        and (r.reserved_at at time zone public.business_tz(r.business_id))::date = ((now() - interval '3 hours') at time zone public.business_tz(r.business_id))::date), 'slot load: expired does not count');
-- reminders skip expired ones even inside the window
update public.reservations set reserved_at = now() + interval '24 hours', created_at = now() - interval '2 days' where id = pg_temp.r(30);
create temp table t_rem as select public.reservation_reminders() as n;
select pg_temp.chk((select count(*) = 0 from public.notifications where type = 'reservation_reminder' and payload->>'reservation_id' = pg_temp.r(30)::text), 'reminders: an expired reservation gets none');
update public.reservations set reserved_at = now() - interval '3 hours' where id = pg_temp.r(30);
-- terminal: nobody confirms / rejects / cancels / reopens it
select pg_temp.login(1);
select pg_temp.err($q$select public.set_reservation_status(pg_temp.r(30), 'confirmed')$q$, 'BAD_TRANSITION', 'terminal: the owner cannot confirm an expired one');
select pg_temp.err($q$select public.set_reservation_status(pg_temp.r(30), 'rejected')$q$, 'BAD_TRANSITION', 'terminal: ... nor reject it');
select pg_temp.err($q$select public.set_reservation_status(pg_temp.r(30), 'cancelled')$q$, 'BAD_TRANSITION', 'terminal: ... nor cancel it');
select pg_temp.err($q$select public.set_reservation_status(pg_temp.r(30), 'pending')$q$, 'BAD_TRANSITION', 'terminal: ... nor reopen it');
select pg_temp.err($q$select public.reject_reservation(pg_temp.r(30), 'no_availability')$q$, 'BAD_TRANSITION', 'terminal: reject_reservation neither');
select pg_temp.err($q$update public.reservations set status = 'cancelled' where id = pg_temp.r(30)$q$, 'RESERVATION_EXPIRED', 'terminal: a direct UPDATE by the owner is refused');
select pg_temp.logout();
select pg_temp.login(4);
select pg_temp.err($q$update public.reservations set status = 'cancelled' where id = pg_temp.r(30)$q$, 'RESERVATION_EXPIRED', 'terminal: the customer cannot cancel an expired one');
select pg_temp.logout();
select pg_temp.chk((select status = 'expired' from public.reservations where id = pg_temp.r(30)) and (select count(*) = 0 from public.notifications where type = 'reservation_cancelled_by_customer'), 'terminal: still expired, and no cancel notice');
-- who can run it
select pg_temp.login(1);
select pg_temp.err($q$select public.reservations_expire()$q$, 'permission denied', 'privileges: the owner (authenticated) cannot run reservations_expire()');
select pg_temp.logout();
set local role anon;
select pg_temp.err($q$select public.reservations_expire()$q$, 'permission denied', 'privileges: anon cannot run reservations_expire()');
reset role;
set local role service_role;
select pg_temp.chk(public.reservations_expire() = 0, 'privileges: service_role can run it');
reset role;
SQL
cat "$ROOT/supabase/rollbacks/277_reservation_cancel_notify_expire_rollback.sql"
cat <<'SQL'

-- ───────── 4. the rollback puts the 274 state back ─────────
select pg_temp.chk(pg_get_functiondef('public.set_reservation_status(uuid,text)'::regprocedure) = (select set_def from t_old), 'rollback: set_reservation_status = the 274 body');
select pg_temp.chk(pg_get_functiondef('public.reservations_notify()'::regprocedure) = (select notify_def from t_old), 'rollback: reservations_notify = the 274 body');
select pg_temp.chk(not exists (select 1 from pg_trigger where tgname = 'reservations_stamp_status_change') and not exists (select 1 from pg_proc where proname in ('reservations_stamp_status_change', 'reservations_expire')), 'rollback: the stamp trigger and the functions are gone');
select pg_temp.chk(not exists (select 1 from cron.job where jobname = 'reservations-expire') and exists (select 1 from cron.job where jobname = 'reservation-reminders'), 'rollback: the expire cron is gone, the reminders cron stays');
select pg_temp.chk((select pg_get_constraintdef(oid) not like '%expired%' from pg_constraint where conrelid = 'public.reservations'::regclass and conname = 'reservations_status_check') and not exists (select 1 from public.reservations where status = 'expired'), 'rollback: the CHECK has no expired and the expired rows became cancelled');
select pg_temp.chk((select count(*) = 4 from public.reservations where id in (pg_temp.r(30), pg_temp.r(33), pg_temp.r(37), pg_temp.r(38)) and status = 'cancelled'), 'rollback: the 4 expired reservations are now cancelled');
select pg_temp.chk((select pg_get_triggerdef(oid) !~ 'reservation_cancelled_by_customer' and pg_get_triggerdef(oid) ~ 'reservation_reminder' from pg_trigger where tgname = 'trg_push_on_notification_insert'), 'rollback: the push list is the 274 one (no cancelled_by_customer)');

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
