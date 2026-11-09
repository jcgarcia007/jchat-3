#!/usr/bin/env bash
# Prueba LOCAL de la migración 273 (franjas de reserva por servidor y aviso al personal). TODO dentro de UNA transacción que termina en ROLLBACK
# (258, 262, 265–272 se aplican dentro; la 273 dos veces: idempotente). Solo contra el contenedor local.   bash supabase/scripts/test_273_local.sh
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
for m in 258_storage_user_objects 262_review_mode 265_owner_account_close 266_stale_orders_and_email_retry 267_retention_and_report_evidence 268_users_plan_interval_trial_used 269_business_plan_requests 270_business_owner_is_pro 271_users_plan_status_past_due 272_report_evidence; do
  cat "$ROOT/supabase/migrations/$m.sql"
done
cat <<'SQL'
create temp table t_out (ok boolean, name text) on commit drop;
grant all on t_out to public;
create function pg_temp.chk(c boolean, n text) returns void language sql as $$ insert into t_out values (coalesce(c, false), n) $$;
-- the owner_close_business that production runs today (md5 of its definition, read 2026-11-08) must be the one 265 creates: 273 builds on that body
select pg_temp.chk(md5(pg_get_functiondef('public.owner_close_business(uuid,uuid)'::regprocedure)) = '89d0faab5a3bc2e64fad83287930b809', 'baseline: owner_close_business after 265 = production (md5)');
select pg_temp.chk((select pg_get_triggerdef(oid) from pg_trigger where tgname = 'trg_push_on_notification_insert') !~ 'staff_added', 'baseline: the push list has no staff types yet');
SQL
cat "$ROOT/supabase/migrations/273_reservation_slots_staff_notify.sql"
cat "$ROOT/supabase/migrations/273_reservation_slots_staff_notify.sql"
cat <<'SQL'

-- people (e273...): 01 owner, 02 staff, 03 staff 2, 04 customer, 05 owner 2, 06 spare
insert into auth.users (id, instance_id, aud, role, email)
  select ('e2730000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'u273' || n || '@example.com' from generate_series(1, 6) n;
insert into public.users (id, username) select ('e2730000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid, 'u273_' || n from generate_series(1, 6) n on conflict (id) do nothing;

-- the employee limit trigger reads the owner's plan: a pro owner can have 50
update public.users set plan = 'pro' where id in ('e2730000-0000-4000-8000-000000000001', 'e2730000-0000-4000-8000-000000000005');

-- hours helper: every day open..close, except the weekday index (0 = sun) given as closed_dow
create function pg_temp.hrs(o text, c text, closed_dow int default null) returns jsonb language sql as $$
  select jsonb_object_agg(k, case when closed_dow is not null and i = closed_dow then jsonb_build_object('open', o, 'close', c, 'closed', true) else jsonb_build_object('open', o, 'close', c, 'closed', false) end)
  from unnest(array['sun','mon','tue','wed','thu','fri','sat']) with ordinality as t(k, i0), lateral (select (i0 - 1)::int as i) x $$;

set local session_replication_role = replica;
insert into public.businesses (id, owner_id, name, slug, status, is_active, timezone, hours, reservation_capacity) values
  ('e2730000-0000-4000-8000-0000000000b1', 'e2730000-0000-4000-8000-000000000001', 'Bar NY',  'bar-273-ny', 'verified', true, 'America/New_York',      pg_temp.hrs('12:00', '15:00'), null),
  ('e2730000-0000-4000-8000-0000000000b2', 'e2730000-0000-4000-8000-000000000005', 'Bar RD',  'bar-273-rd', 'verified', true, 'America/Santo_Domingo', pg_temp.hrs('12:00', '15:00'), null),
  ('e2730000-0000-4000-8000-0000000000b3', 'e2730000-0000-4000-8000-000000000001', 'Night',   'bar-273-nt', 'verified', true, 'America/New_York',      pg_temp.hrs('18:00', '02:00'), null),
  ('e2730000-0000-4000-8000-0000000000b4', 'e2730000-0000-4000-8000-000000000001', 'Cap2',    'bar-273-c2', 'verified', true, 'America/New_York',      pg_temp.hrs('12:00', '15:00'), 2),
  ('e2730000-0000-4000-8000-0000000000b5', 'e2730000-0000-4000-8000-000000000001', 'NoHours', 'bar-273-nh', 'verified', true, 'America/New_York',      '{}'::jsonb, null),
  ('e2730000-0000-4000-8000-0000000000b6', null,                                   'Closed',  'bar-273-cl', 'closed',   false, 'America/New_York',     pg_temp.hrs('12:00', '15:00'), null),
  ('e2730000-0000-4000-8000-0000000000b7', 'e2730000-0000-4000-8000-000000000001', 'BadTz',   'bar-273-bz', 'verified', true, 'Not/AZone',             pg_temp.hrs('12:00', '15:00'), null),
  ('e2730000-0000-4000-8000-0000000000b8', 'e2730000-0000-4000-8000-000000000001', 'Today',   'bar-273-td', 'verified', true, 'America/New_York',      pg_temp.hrs('00:00', '23:30'), null);
set local session_replication_role = origin;

-- ───────── M1. business_tz and permissions ─────────
select pg_temp.chk(public.business_tz('e2730000-0000-4000-8000-0000000000b2') = 'America/Santo_Domingo', 'tz: a valid zone is returned');
select pg_temp.chk(public.business_tz('e2730000-0000-4000-8000-0000000000b7') = 'America/New_York', 'tz: an invalid zone falls back to America/New_York');
select pg_temp.chk(public.business_tz('e2730000-0000-4000-8000-0000000000ff') = 'America/New_York', 'tz: an unknown business falls back to America/New_York');
select pg_temp.chk(has_function_privilege('authenticated', 'public.reservation_slots(uuid,date)', 'execute') and not has_function_privilege('anon', 'public.reservation_slots(uuid,date)', 'execute'), 'slots: authenticated can run it, anon cannot');
select pg_temp.chk(has_function_privilege('authenticated', 'public.reservation_slot_load(uuid,timestamptz)', 'execute'), 'slot_load: still executable by authenticated');

-- ───────── M1. slots ─────────
create temp table t_d as select ((now() at time zone 'America/New_York')::date + 3) as d_ny, ((now() at time zone 'America/Santo_Domingo')::date + 3) as d_rd;
create temp table t_s1 as select * from public.reservation_slots('e2730000-0000-4000-8000-0000000000b1', (select d_ny from t_d));
select pg_temp.chk((select count(*) = 6 from t_s1), 'slots: 12:00–15:00 → 6 slots every 30 min (the last one 14:30)');
select pg_temp.chk((select min(slot_at) = ((select d_ny from t_d) + time '12:00') at time zone 'America/New_York' and max(slot_at) = ((select d_ny from t_d) + time '14:30') at time zone 'America/New_York' from t_s1), 'slots: first 12:00 and last 14:30 in the venue zone');
select pg_temp.chk((select bool_and(status = 'open') from t_s1), 'slots: all open when there is no capacity limit');
create temp table t_s2 as select * from public.reservation_slots('e2730000-0000-4000-8000-0000000000b2', (select d_rd from t_d));
select pg_temp.chk((select min(slot_at) = ((select d_rd from t_d) + time '12:00') at time zone 'America/Santo_Domingo' and count(*) = 6 from t_s2), 'slots: the Dominican venue uses its own zone (12:00 Santo Domingo)');
create temp table t_s3 as select * from public.reservation_slots('e2730000-0000-4000-8000-0000000000b3', (select d_ny from t_d));
select pg_temp.chk((select count(*) = 16 from t_s3), 'night: 18:00 → 02:00 gives 16 slots (the last one 01:30)');
select pg_temp.chk((select max(slot_at) = ((select d_ny from t_d) + 1 + time '01:30') at time zone 'America/New_York' and min(slot_at) = ((select d_ny from t_d) + time '18:00') at time zone 'America/New_York' from t_s3), 'night: it crosses midnight (the last slot is the next day 01:30)');
select pg_temp.chk((select count(*) = 0 from public.reservation_slots('e2730000-0000-4000-8000-0000000000b5', (select d_ny from t_d))), 'no hours ({}) → no slots');
select pg_temp.chk((select count(*) = 0 from public.reservation_slots('e2730000-0000-4000-8000-0000000000b6', (select d_ny from t_d))), 'a closed venue → no slots');
select pg_temp.chk((select count(*) = 0 from public.reservation_slots('e2730000-0000-4000-8000-0000000000ff', (select d_ny from t_d))), 'an unknown venue → no slots');
select pg_temp.chk((select count(*) = 6 from public.reservation_slots('e2730000-0000-4000-8000-0000000000b7', (select d_ny from t_d))), 'an invalid zone falls back to New York and still gives slots');
select pg_temp.chk((select count(*) = 0 from public.reservation_slots('e2730000-0000-4000-8000-0000000000b1', null)), 'a null date → no slots');
-- a closed weekday
update public.businesses set hours = pg_temp.hrs('12:00', '15:00', extract(dow from (select d_ny from t_d))::int) where id = 'e2730000-0000-4000-8000-0000000000b1';
select pg_temp.chk((select count(*) = 0 from public.reservation_slots('e2730000-0000-4000-8000-0000000000b1', (select d_ny from t_d))), 'a day marked closed → no slots');
select pg_temp.chk((select count(*) = 6 from public.reservation_slots('e2730000-0000-4000-8000-0000000000b1', (select d_ny from t_d) + 1)), 'the next day (open) → 6 slots');
update public.businesses set hours = pg_temp.hrs('12:00', '12:00') where id = 'e2730000-0000-4000-8000-0000000000b1';
select pg_temp.chk((select count(*) = 0 from public.reservation_slots('e2730000-0000-4000-8000-0000000000b1', (select d_ny from t_d))), 'open = close → no slots');
update public.businesses set hours = pg_temp.hrs('12:00', '15:00') where id = 'e2730000-0000-4000-8000-0000000000b1';
-- horizon: today + 60 yes, + 61 no, a past day no
select pg_temp.chk((select count(*) = 6 from public.reservation_slots('e2730000-0000-4000-8000-0000000000b1', (now() at time zone 'America/New_York')::date + 60)), 'horizon: today + 60 days is bookable');
select pg_temp.chk((select count(*) = 0 from public.reservation_slots('e2730000-0000-4000-8000-0000000000b1', (now() at time zone 'America/New_York')::date + 61)), 'horizon: today + 61 days is not');
select pg_temp.chk((select count(*) = 0 from public.reservation_slots('e2730000-0000-4000-8000-0000000000b1', (now() at time zone 'America/New_York')::date - 2)), 'a past day → no slots');
-- today with hours already gone: only slots from now + 30 min on
create temp table t_s4 as select * from public.reservation_slots('e2730000-0000-4000-8000-0000000000b8', (now() at time zone 'America/New_York')::date);
select pg_temp.chk((select count(*) = 0 or min(slot_at) >= now() + interval '30 minutes' from t_s4), 'today: no slot earlier than now + 30 minutes');
select pg_temp.chk((select count(*) = 0 or min(slot_at) < now() + interval '60 minutes' from t_s4), 'today: the first slot is the next one after now + 30 min (nothing skipped)');
select pg_temp.chk((select count(*) = 0 or max(slot_at) <= ((now() at time zone 'America/New_York')::date + time '23:00') at time zone 'America/New_York' from t_s4), 'today: the last slot is close − 30 min (23:00)');
-- capacity: 2 per day; waitlist and cancelled do not count
insert into public.reservations (business_id, user_id, reserved_at, party_size, status, is_waitlist)
  select 'e2730000-0000-4000-8000-0000000000b4', 'e2730000-0000-4000-8000-000000000004', ((select d_ny from t_d) + time '13:00') at time zone 'America/New_York', 2, 'pending', false;
select pg_temp.chk((select bool_and(status = 'open') and count(*) = 6 from public.reservation_slots('e2730000-0000-4000-8000-0000000000b4', (select d_ny from t_d))), 'capacity 2: one reservation → still open');
insert into public.reservations (business_id, user_id, reserved_at, party_size, status, is_waitlist) values
  ('e2730000-0000-4000-8000-0000000000b4', 'e2730000-0000-4000-8000-000000000004', ((select d_ny from t_d) + time '14:00') at time zone 'America/New_York', 2, 'pending', true),
  ('e2730000-0000-4000-8000-0000000000b4', 'e2730000-0000-4000-8000-000000000004', ((select d_ny from t_d) + time '14:00') at time zone 'America/New_York', 2, 'cancelled', false);
select pg_temp.chk((select bool_and(status = 'open') from public.reservation_slots('e2730000-0000-4000-8000-0000000000b4', (select d_ny from t_d))), 'capacity 2: a waitlist and a cancelled reservation do not count');
insert into public.reservations (business_id, user_id, reserved_at, party_size, status, is_waitlist)
  select 'e2730000-0000-4000-8000-0000000000b4', 'e2730000-0000-4000-8000-000000000004', ((select d_ny from t_d) + time '14:30') at time zone 'America/New_York', 4, 'confirmed', false;
select pg_temp.chk((select bool_and(status = 'full') and count(*) = 6 from public.reservation_slots('e2730000-0000-4000-8000-0000000000b4', (select d_ny from t_d))), 'capacity 2: the second counted reservation → every slot of the day is full');
select pg_temp.chk((select bool_and(status = 'open') and count(*) = 6 from public.reservation_slots('e2730000-0000-4000-8000-0000000000b4', (select d_ny from t_d) + 1)), 'capacity 2: the next day is open');

-- ───────── M1. slot_load uses the venue zone ─────────
-- 2026-12-15 04:30 UTC is Dec 15 00:30 in Santo Domingo (UTC−4) but Dec 14 23:30 in New York (UTC−5, winter)
set local session_replication_role = replica;
insert into public.reservations (business_id, user_id, reserved_at, party_size, status, is_waitlist) values
  ('e2730000-0000-4000-8000-0000000000b2', 'e2730000-0000-4000-8000-000000000004', timestamptz '2026-12-15 04:30:00+00', 2, 'pending', false),
  ('e2730000-0000-4000-8000-0000000000b1', 'e2730000-0000-4000-8000-000000000004', timestamptz '2026-12-15 04:30:00+00', 2, 'pending', false);
set local session_replication_role = origin;
select pg_temp.chk((select reserved = 1 from public.reservation_slot_load('e2730000-0000-4000-8000-0000000000b2', timestamptz '2026-12-15 17:00:00+00')), 'slot_load: Dominican venue → that instant belongs to Dec 15');
select pg_temp.chk((select reserved = 0 from public.reservation_slot_load('e2730000-0000-4000-8000-0000000000b1', timestamptz '2026-12-15 17:00:00+00')), 'slot_load: New York venue → Dec 15 has none (it was Dec 14 23:30 there)');
select pg_temp.chk((select reserved = 1 from public.reservation_slot_load('e2730000-0000-4000-8000-0000000000b1', timestamptz '2026-12-14 17:00:00+00')), 'slot_load: New York venue → it counts on Dec 14');
select pg_temp.chk((select reserved = 0 from public.reservation_slot_load('e2730000-0000-4000-8000-0000000000b2', timestamptz '2026-12-14 17:00:00+00')), 'slot_load: Dominican venue → nothing on Dec 14');
select pg_temp.chk((select capacity = 2 from public.reservation_slot_load('e2730000-0000-4000-8000-0000000000b4', now())), 'slot_load: capacity is still returned');
select pg_temp.chk((select reserved = 0 and capacity is null from public.reservation_slot_load('e2730000-0000-4000-8000-0000000000b5', now())), 'slot_load: a venue without reservations gives one row with 0');

-- ───────── M2. staff notices ─────────
insert into public.custom_roles (id, business_id, name) values ('e2730000-0000-4000-8000-0000000000c1', 'e2730000-0000-4000-8000-0000000000b3', 'Cajero');
delete from public.notifications;
insert into public.employees (id, business_id, user_id, role, status) values ('e2730000-0000-4000-8000-000000000e01', 'e2730000-0000-4000-8000-0000000000b3', 'e2730000-0000-4000-8000-000000000002', 'staff', 'accepted');
select pg_temp.chk((select count(*) = 1 from public.notifications where type = 'staff_added' and user_id = 'e2730000-0000-4000-8000-000000000002'
  and payload->>'business_id' = 'e2730000-0000-4000-8000-0000000000b3' and payload->>'business_name' = 'Night' and payload->>'role_label' = 'staff'), 'staff: INSERT accepted → staff_added with {business_id, business_name, role_label = role}');
update public.employees set custom_role_id = 'e2730000-0000-4000-8000-0000000000c1' where id = 'e2730000-0000-4000-8000-000000000e01';
select pg_temp.chk((select count(*) = 1 from public.notifications), 'staff: changing the role does not notify');
insert into public.employees (id, business_id, user_id, role, status, custom_role_id) values ('e2730000-0000-4000-8000-000000000e02', 'e2730000-0000-4000-8000-0000000000b3', 'e2730000-0000-4000-8000-000000000003', 'staff', 'pending', 'e2730000-0000-4000-8000-0000000000c1');
select pg_temp.chk((select payload->>'role_label' = 'Cajero' from public.notifications where user_id = 'e2730000-0000-4000-8000-000000000003' and type = 'staff_added'), 'staff: INSERT pending with a custom role → staff_added with the role name');
update public.employees set status = 'accepted' where id = 'e2730000-0000-4000-8000-000000000e02';
select pg_temp.chk((select count(*) = 1 from public.notifications where user_id = 'e2730000-0000-4000-8000-000000000003'), 'staff: pending → accepted does not notify twice');
update public.employees set status = 'removed' where id = 'e2730000-0000-4000-8000-000000000e02';
select pg_temp.chk((select count(*) = 1 and bool_and(payload->>'role_label' = 'Cajero' and payload->>'business_name' = 'Night') from public.notifications where user_id = 'e2730000-0000-4000-8000-000000000003' and type = 'staff_removed'), 'staff: accepted → removed → staff_removed');
update public.employees set status = 'accepted' where id = 'e2730000-0000-4000-8000-000000000e02';
select pg_temp.chk((select count(*) = 2 from public.notifications where user_id = 'e2730000-0000-4000-8000-000000000003' and type = 'staff_added'), 'staff: removed → accepted again → staff_added');
update public.employees set status = 'accepted' where id = 'e2730000-0000-4000-8000-000000000e02';
select pg_temp.chk((select count(*) = 2 from public.notifications where user_id = 'e2730000-0000-4000-8000-000000000003' and type = 'staff_added'), 'staff: an UPDATE that does not change the status does not notify');
-- pending → removed: never was on the staff, nothing to say
insert into public.employees (id, business_id, user_id, role, status) values ('e2730000-0000-4000-8000-000000000e03', 'e2730000-0000-4000-8000-0000000000b3', 'e2730000-0000-4000-8000-000000000006', 'staff', 'pending');
update public.employees set status = 'removed' where id = 'e2730000-0000-4000-8000-000000000e03';
select pg_temp.chk((select count(*) = 1 and bool_and(type = 'staff_added') from public.notifications where user_id = 'e2730000-0000-4000-8000-000000000006'), 'staff: pending → removed → no staff_removed (only the invitation notice)');
-- the owner is never notified
insert into public.employees (id, business_id, user_id, role, status) values ('e2730000-0000-4000-8000-000000000e04', 'e2730000-0000-4000-8000-0000000000b3', 'e2730000-0000-4000-8000-000000000001', 'manager', 'accepted');
update public.employees set status = 'removed' where id = 'e2730000-0000-4000-8000-000000000e04';
select pg_temp.chk((select count(*) = 0 from public.notifications where user_id = 'e2730000-0000-4000-8000-000000000001'), 'staff: the owner of the venue is never notified (added or removed)');
-- a 'declined' / 'removed' row inserted directly says nothing
insert into public.employees (id, business_id, user_id, role, status) values ('e2730000-0000-4000-8000-000000000e05', 'e2730000-0000-4000-8000-0000000000b1', 'e2730000-0000-4000-8000-000000000002', 'staff', 'removed');
select pg_temp.chk((select count(*) = 0 from public.notifications where payload->>'business_id' = 'e2730000-0000-4000-8000-0000000000b1'), 'staff: INSERT with status removed → nothing');

-- D4: closing the venue sends business_closed only
delete from public.notifications;
set local session_replication_role = replica;
insert into public.employees (id, business_id, user_id, role, status) values
  ('e2730000-0000-4000-8000-000000000e11', 'e2730000-0000-4000-8000-0000000000b8', 'e2730000-0000-4000-8000-000000000002', 'staff', 'accepted'),
  ('e2730000-0000-4000-8000-000000000e12', 'e2730000-0000-4000-8000-0000000000b8', 'e2730000-0000-4000-8000-000000000003', 'staff', 'accepted');
set local session_replication_role = origin;
select public.owner_close_business('e2730000-0000-4000-8000-0000000000b8', 'e2730000-0000-4000-8000-000000000001');
select pg_temp.chk((select count(*) = 2 and bool_and(type = 'business_closed') from public.notifications where payload->>'business_id' = 'e2730000-0000-4000-8000-0000000000b8'), 'D4: closing the venue sends exactly one business_closed per employee');
select pg_temp.chk((select count(*) = 0 from public.notifications where type = 'staff_removed'), 'D4: ... and no staff_removed');
select pg_temp.chk((select count(*) = 2 from public.employees where business_id = 'e2730000-0000-4000-8000-0000000000b8' and status = 'removed'), 'D4: the employees are removed');
select pg_temp.chk(coalesce(current_setting('jchat.silent_staff_notify', true), '') <> 'on', 'D4: the silence switch is off again after the closing');
update public.employees set status = 'accepted' where id = 'e2730000-0000-4000-8000-000000000e11';
select pg_temp.chk((select count(*) = 1 from public.notifications where type = 'staff_added' and user_id = 'e2730000-0000-4000-8000-000000000002' and payload->>'business_id' = 'e2730000-0000-4000-8000-0000000000b8'), 'D4: after the closing the trigger works again in the same transaction');
select pg_temp.chk(public.owner_close_business('e2730000-0000-4000-8000-0000000000b8', 'e2730000-0000-4000-8000-000000000001') ->> 'already' = 'true', 'D4: closing an already closed venue still answers already');

-- push trigger list
select pg_temp.chk((select count(*) = 1 from pg_trigger where tgname = 'trg_push_on_notification_insert' and not tgisinternal), 'push: one trigger');
select pg_temp.chk((select pg_get_triggerdef(oid) ~ 'staff_added' and pg_get_triggerdef(oid) ~ 'staff_removed' from pg_trigger where tgname = 'trg_push_on_notification_insert'), 'push: the list has staff_added and staff_removed');
select pg_temp.chk((select bool_and(pg_get_triggerdef(t.oid) ~ ('''' || x || '''')) from pg_trigger t, unnest(array['follower','like','comment','work_alert','match_like','match_super','match_match','match_new_people','order_status','gift_offer','gift_response','business_closed','reservation_cancelled']) x where t.tgname = 'trg_push_on_notification_insert'), 'push: the 13 types that were already there are still there');
select pg_temp.chk((select count(*) = 1 from pg_trigger where tgname = 'trg_employees_notify' and not tgisinternal) and (select count(*) = 1 from pg_trigger where tgname = 'trg_employees_plan_limit'), 'triggers: trg_employees_notify once (273 applied twice) and the plan-limit trigger untouched');

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
