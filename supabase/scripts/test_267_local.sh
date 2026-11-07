#!/usr/bin/env bash
# Prueba LOCAL de la migración 267 (retención, evidencia de reportes y huella de correos). TODO dentro de UNA transacción que termina en ROLLBACK
# (la 262, la 265, la 266 y la 267 se aplican dentro; la 267 dos veces: idempotente). Solo contra el contenedor local.   bash supabase/scripts/test_267_local.sh
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
cat "$ROOT/supabase/migrations/267_retention_and_report_evidence.sql"
cat "$ROOT/supabase/migrations/267_retention_and_report_evidence.sql"
cat <<'SQL'
create temp table t_out (ok boolean, name text) on commit drop;
grant all on t_out to public;
create function pg_temp.chk(c boolean, n text) returns void language sql as $$ insert into t_out values (coalesce(c, false), n) $$;

-- people (ids 267...): 01 reported, 02 reporter, 03 reported-2, 04 reporter-2, 05 admin, 06 plain user
insert into auth.users (id, instance_id, aud, role, email)
  select ('f2670000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'u267' || n || '@example.com' from generate_series(1, 6) n;
insert into public.users (id, username) select ('f2670000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid, 'u267_' || n from generate_series(1, 6) n on conflict (id) do nothing;
insert into public.admin_roles (user_id, role) values ('f2670000-0000-4000-8000-000000000005', 'admin');
set local session_replication_role = replica;
insert into public.businesses (id, owner_id, name, slug, status, is_active) values ('f2670000-0000-4000-8000-0000000000b1', 'f2670000-0000-4000-8000-000000000006', 'Bar 267', 'bar-267-xx', 'verified', true);
set local session_replication_role = origin;

-- ───────── A. evidence survives the deletion of the account ─────────
select pg_temp.chk((select confdeltype = 'n' from pg_constraint where conname = 'reports_reporter_id_fkey' and conrelid = 'public.reports'::regclass), 'A: reports.reporter_id FK is ON DELETE SET NULL');
select pg_temp.chk((select confdeltype = 'n' from pg_constraint where conname = 'reports_reported_user_id_fkey' and conrelid = 'public.reports'::regclass), 'A: reports.reported_user_id FK is ON DELETE SET NULL');
insert into public.reports (id, reporter_id, reported_user_id, content_type, content_id, reason, status, snapshot, details) values
  ('f2670000-0000-4000-8000-000000000a01', 'f2670000-0000-4000-8000-000000000002', 'f2670000-0000-4000-8000-000000000001', 'message', 'f2670000-0000-4000-8000-000000000e01', 'harassment', 'pending', '{"body":"evidence-1"}', 'details-1'),
  ('f2670000-0000-4000-8000-000000000a02', 'f2670000-0000-4000-8000-000000000004', 'f2670000-0000-4000-8000-000000000003', 'message', 'f2670000-0000-4000-8000-000000000e02', 'spam', 'pending', '{"body":"evidence-2"}', 'details-2');
delete from auth.users where id = 'f2670000-0000-4000-8000-000000000001';
select pg_temp.chk((select reported_user_id is null and reporter_id is not null and snapshot->>'body' = 'evidence-1' and details = 'details-1' from public.reports where id = 'f2670000-0000-4000-8000-000000000a01'), 'A: the reported user deletes the account → report kept, reported_user_id null, snapshot intact');
delete from auth.users where id = 'f2670000-0000-4000-8000-000000000004';
select pg_temp.chk((select reporter_id is null and reported_user_id is not null and snapshot->>'body' = 'evidence-2' from public.reports where id = 'f2670000-0000-4000-8000-000000000a02'), 'A: the reporter deletes the account → report kept, reporter_id null, snapshot intact');

-- ───────── B. NCMEC hold counts from the resolution ─────────
insert into public.reports (id, content_type, content_id, reason, status, resolution, created_at, resolved_at) values
  ('f2670000-0000-4000-8000-000000000a11', 'message', 'f2670000-0000-4000-8000-000000000c11', 'child_safety', 'resolved', 'escalated_ncmec', now() - interval '500 days', now() - interval '10 days'),
  ('f2670000-0000-4000-8000-000000000a12', 'message', 'f2670000-0000-4000-8000-000000000c12', 'child_safety', 'resolved', 'escalated_ncmec', now() - interval '500 days', now() - interval '400 days'),
  ('f2670000-0000-4000-8000-000000000a13', 'message', 'f2670000-0000-4000-8000-000000000c13', 'spam', 'pending', null, now() - interval '700 days', null),
  ('f2670000-0000-4000-8000-000000000a14', 'message', 'f2670000-0000-4000-8000-000000000c14', 'spam', 'resolved', 'no_action', now() - interval '500 days', now() - interval '10 days');
select pg_temp.chk(public.message_under_retention_hold('f2670000-0000-4000-8000-000000000c11'), 'B: created 500 d ago but resolved 10 d ago → still under hold');
select pg_temp.chk(not public.message_under_retention_hold('f2670000-0000-4000-8000-000000000c12'), 'B: resolved 400 d ago → hold over');
select pg_temp.chk(public.message_under_retention_hold('f2670000-0000-4000-8000-000000000c13'), 'B: pending report → hold, however old');
select pg_temp.chk(not public.message_under_retention_hold('f2670000-0000-4000-8000-000000000c14'), 'B: closed ordinary report → no hold');
delete from public.reports where id in ('f2670000-0000-4000-8000-000000000a11', 'f2670000-0000-4000-8000-000000000a12', 'f2670000-0000-4000-8000-000000000a13', 'f2670000-0000-4000-8000-000000000a14');
delete from public.reports;

-- ───────── C. retention_purge: one row inside and one outside the term, per table ─────────
select pg_temp.chk(not has_function_privilege('authenticated', 'public.retention_purge()', 'execute') and not has_function_privilege('anon', 'public.retention_purge()', 'execute') and has_function_privilege('service_role', 'public.retention_purge()', 'execute'), 'C: only service_role runs retention_purge');
delete from public.security_logs; delete from public.outbound_emails; delete from public.moderation_logs; delete from public.tod_moderation_log; delete from public.table_reservation_log; delete from public.photo_moderation_log; delete from public.review_bypass_log;
insert into public.outbound_emails (id, kind, status, created_at, sent_at) values
  ('f2670000-0000-4000-8000-000000000b01', 'reservation_cancelled_business_closed', 'sent',    now() - interval '40 days',  now() - interval '31 days'),
  ('f2670000-0000-4000-8000-000000000b02', 'reservation_cancelled_business_closed', 'sent',    now() - interval '20 days',  now() - interval '10 days'),
  ('f2670000-0000-4000-8000-000000000b03', 'reservation_cancelled_business_closed', 'failed',  now() - interval '91 days',  null),
  ('f2670000-0000-4000-8000-000000000b04', 'reservation_cancelled_business_closed', 'failed',  now() - interval '40 days',  null),
  ('f2670000-0000-4000-8000-000000000b05', 'reservation_cancelled_business_closed', 'skipped', now() - interval '100 days', null),
  ('f2670000-0000-4000-8000-000000000b06', 'reservation_cancelled_business_closed', 'pending', now() - interval '200 days', null);
insert into public.photo_moderation_log (kind, ref_id, attempts, last_attempt_at, alerted_at, notified_at) values
  ('match', 'f2670000-0000-4000-8000-000000000d01', 1, now() - interval '100 days', null, null),
  ('match', 'f2670000-0000-4000-8000-000000000d02', 1, now() - interval '100 days', null, now() - interval '10 days'),
  ('dm',    'f2670000-0000-4000-8000-000000000d03', 0, null, null, null),
  ('dm',    'f2670000-0000-4000-8000-000000000d04', 1, now() - interval '20 days', null, null);
insert into public.review_bypass_log (user_id, business_id, fn, at) values
  ('f2670000-0000-4000-8000-000000000006', 'f2670000-0000-4000-8000-0000000000b1', 'x', now() - interval '100 days'),
  ('f2670000-0000-4000-8000-000000000006', 'f2670000-0000-4000-8000-0000000000b1', 'y', now() - interval '10 days');
insert into public.security_logs (action, created_at, detail) values
  ('general_old', now() - interval '100 days', 'g1'), ('general_new', now() - interval '10 days', 'g2'),
  ('report_resolved', now() - interval '100 days', 'g3'), ('report_resolved', now() - interval '400 days', 'g4'),
  ('user_suspended', now() - interval '200 days', 'g5'), ('user_suspended', now() - interval '400 days', 'g6'),
  ('user_unsuspended', now() - interval '400 days', 'g7'), ('retention_purge', now() - interval '400 days', 'g8'),
  ('email_unbanned', now() - interval '200 days', 'g9'), ('email_unbanned', now() - interval '400 days', 'g10');
insert into public.moderation_logs (action, created_at) values ('mute', now() - interval '400 days'), ('mute', now() - interval '100 days');
insert into public.tod_moderation_log (business_id, action, created_at) values
  ('f2670000-0000-4000-8000-0000000000b1', 'hide', now() - interval '400 days'), ('f2670000-0000-4000-8000-0000000000b1', 'hide', now() - interval '100 days');
insert into public.table_reservation_log (business_id, table_label, action, created_at) values
  ('f2670000-0000-4000-8000-0000000000b1', 'T1', 'reserved', now() - interval '400 days'), ('f2670000-0000-4000-8000-0000000000b1', 'T1', 'reserved', now() - interval '100 days');
insert into public.reports (id, content_type, reason, status, resolution, resolved_at) values
  ('f2670000-0000-4000-8000-000000000a21', 'user', 'spam',         'dismissed', 'dismissed',        now() - interval '400 days'),
  ('f2670000-0000-4000-8000-000000000a22', 'user', 'spam',         'dismissed', 'dismissed',        now() - interval '100 days'),
  ('f2670000-0000-4000-8000-000000000a23', 'user', 'spam',         'pending',   null,               null),
  ('f2670000-0000-4000-8000-000000000a24', 'user', 'child_safety', 'resolved',  'user_suspended',   now() - interval '400 days'),
  ('f2670000-0000-4000-8000-000000000a25', 'user', 'child_safety', 'resolved',  'user_suspended',   now() - interval '800 days'),
  ('f2670000-0000-4000-8000-000000000a26', 'user', 'spam',         'resolved',  'escalated_ncmec',  now() - interval '400 days'),
  ('f2670000-0000-4000-8000-000000000a27', 'user', 'spam',         'resolved',  'content_removed',  null),
  ('f2670000-0000-4000-8000-000000000a28', 'user', 'spam',         'resolved',  'escalated_ncmec',  now() - interval '800 days');
update public.reports set created_at = now() - interval '900 days';
insert into public.banned_emails (fingerprint, reason, expires_at) values ('fp-expired-267', 'x', now() - interval '1 day'), ('fp-valid-267', 'x', now() + interval '100 days');
create temp table t_p1 as select public.retention_purge() as r;
select pg_temp.chk((select (r->>'outbound_emails')::int = 3 from t_p1), 'C: outbound_emails: sent 31 d, failed 91 d and skipped 100 d go; sent 10 d, failed 40 d and pending stay');
select pg_temp.chk((select count(*) = 3 from public.outbound_emails), 'C: outbound_emails: 3 rows left');
select pg_temp.chk((select (r->>'photo_moderation_log')::int = 1 from t_p1) and (select count(*) = 3 from public.photo_moderation_log), 'C: photo_moderation_log: only the row whose latest date is > 90 d; a recent notified_at or no dates at all stay');
select pg_temp.chk((select (r->>'review_bypass_log')::int = 1 from t_p1) and (select count(*) = 1 from public.review_bypass_log), 'C: review_bypass_log: 90 d');
select pg_temp.chk((select (r->>'security_logs')::int = 6 from t_p1), 'C: security_logs: general 100 d + report_% 400 d + user_suspended / user_unsuspended / retention_purge / email_unbanned 400 d go (6)');
select pg_temp.chk((select count(*) = 1 from public.security_logs where detail = 'g2') and (select count(*) = 1 from public.security_logs where detail = 'g3') and (select count(*) = 1 from public.security_logs where detail = 'g5'), 'C: security_logs: 10 d general, report_% 100 d and user_suspended 200 d stay (365 d class)');
select pg_temp.chk((select count(*) = 0 from public.security_logs where detail in ('g1', 'g4', 'g6', 'g7', 'g8', 'g10')), 'C: security_logs: the old ones are gone');
select pg_temp.chk((select count(*) = 1 from public.security_logs where detail = 'g9'), 'C: security_logs: email_unbanned of 200 days is NOT deleted (365 d class); of 400 days it is');
select pg_temp.chk((select (r->>'moderation_logs')::int = 1 from t_p1) and (select count(*) = 1 from public.moderation_logs), 'C: moderation_logs: 1 year');
select pg_temp.chk((select (r->>'tod_moderation_log')::int = 1 from t_p1) and (select count(*) = 1 from public.tod_moderation_log), 'C: tod_moderation_log: 1 year');
select pg_temp.chk((select (r->>'table_reservation_log')::int = 1 from t_p1) and (select count(*) = 1 from public.table_reservation_log), 'C: table_reservation_log: 1 year');
select pg_temp.chk((select (r->>'reports')::int = 3 from t_p1), 'C: reports: closed 400 d + child_safety 800 d + escalated_ncmec 800 d go');
select pg_temp.chk((select count(*) = 5 from public.reports where id::text like 'f2670000-0000-4000-8000-000000000a2%'), 'C: reports: 5 stay');
select pg_temp.chk((select status = 'pending' from public.reports where id = 'f2670000-0000-4000-8000-000000000a23'), 'C: a pending report is never purged (900 d old)');
select pg_temp.chk((select count(*) = 2 from public.reports where id in ('f2670000-0000-4000-8000-000000000a24', 'f2670000-0000-4000-8000-000000000a26')), 'C: child_safety / escalated_ncmec resolved 400 d ago stay (2 years)');
select pg_temp.chk((select count(*) = 1 from public.reports where id = 'f2670000-0000-4000-8000-000000000a27'), 'C: a resolved report without resolved_at is not purged');
select pg_temp.chk((select (r->>'banned_emails')::int = 1 from t_p1) and (select count(*) = 1 from public.banned_emails where fingerprint = 'fp-valid-267'), 'C: banned_emails: only the expired one goes');
select pg_temp.chk((select count(*) = 1 from public.security_logs where action = 'retention_purge' and detail like '%outbound_emails%'), 'C: ONE retention_purge row in security_logs with the counts');
select pg_temp.chk((select public.retention_purge()) = '{}'::jsonb, 'C: second pass deletes 0 (returns {})');
select pg_temp.chk((select count(*) = 1 from public.security_logs where action = 'retention_purge'), 'C: a pass with nothing to do writes no log');
select pg_temp.chk((select count(*) = 1 from cron.job where jobname = 'retention-purge' and schedule = '45 4 * * *'), 'C: cron job retention-purge scheduled once (45 4 * * *)');
-- the batch limit: 5001 old general logs → 5000 per pass, the rest on the next
insert into public.security_logs (action, created_at, detail) select 'bulk', now() - interval '200 days', 'bulk' from generate_series(1, 5001);
select pg_temp.chk((select (public.retention_purge()->>'security_logs')::int) = 5000, 'C: batch limit 5000 rows per table and pass');
select pg_temp.chk((select (public.retention_purge()->>'security_logs')::int) = 1, 'C: the rest goes on the next pass');
delete from public.security_logs where action = 'retention_purge';

-- ───────── D. e-mail fingerprint ─────────
-- without the key: the sign-up is NOT blocked and a deletion never fails
delete from vault.secrets where name = 'ban_email_hmac_key';
do $$ begin
  begin perform public.email_fingerprint('x@example.com'); perform pg_temp.chk(false, 'D: no key → email_fingerprint raises');
  exception when others then perform pg_temp.chk(sqlerrm = 'ban_key_missing', 'D: no key → email_fingerprint raises ban_key_missing'); end;
end $$;
insert into public.banned_emails (fingerprint, expires_at) values ('whatever-fp', now() + interval '10 days');
do $$ begin
  begin
    insert into auth.users (id, instance_id, aud, role, email) values ('f2670000-0000-4000-8000-000000000f01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'nokey@example.com');
    perform pg_temp.chk(true, 'D: no key in the vault → the sign-up is not blocked');
  exception when others then perform pg_temp.chk(false, 'D: no key in the vault → the sign-up is not blocked (' || sqlerrm || ')'); end;
end $$;
update auth.users set banned_until = now() + interval '30 days' where id = 'f2670000-0000-4000-8000-000000000f01';
do $$ begin
  begin
    delete from auth.users where id = 'f2670000-0000-4000-8000-000000000f01';
    perform pg_temp.chk(true, 'D: no key → deleting a suspended account does not fail');
  exception when others then perform pg_temp.chk(false, 'D: no key → deleting a suspended account does not fail (' || sqlerrm || ')'); end;
end $$;
select pg_temp.chk((select count(*) = 0 from public.banned_emails where fingerprint <> 'whatever-fp' and fingerprint <> 'fp-valid-267'), 'D: no key → nothing stored');
delete from public.banned_emails;

select vault.create_secret('test-key-for-267-only', 'ban_email_hmac_key', 'test');
select pg_temp.chk(not has_function_privilege('authenticated', 'public.email_fingerprint(text)', 'execute') and not has_function_privilege('anon', 'public.email_fingerprint(text)', 'execute'), 'D: clients cannot run email_fingerprint');
select pg_temp.chk(public.email_fingerprint('A.b+c@gmail.com') = public.email_fingerprint('ab@gmail.com'), 'D: A.b+c@gmail.com and ab@gmail.com → same fingerprint');
select pg_temp.chk(public.email_fingerprint(' AB@GoogleMail.com ') = public.email_fingerprint('ab@gmail.com'), 'D: case, spaces and googlemail.com → same as gmail.com');
select pg_temp.chk(public.email_fingerprint('a.b@example.com') <> public.email_fingerprint('ab@example.com'), 'D: a non-gmail domain keeps its dots');
select pg_temp.chk(public.email_fingerprint('a+tag@example.com') = public.email_fingerprint('a@example.com'), 'D: "+tag" is removed from any domain');
select pg_temp.chk(public.email_fingerprint('ab@example.com') <> public.email_fingerprint('ab@example.org') and length(public.email_fingerprint('ab@example.com')) = 64, 'D: different domain → different fingerprint; 64 hex chars');

-- a suspended account that is deleted leaves its fingerprint
insert into auth.users (id, instance_id, aud, role, email, banned_until) values
  ('f2670000-0000-4000-8000-000000000f11', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bad.actor+x@gmail.com', now() + interval '100 years'),
  ('f2670000-0000-4000-8000-000000000f12', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'short@example.com', now() + interval '30 days'),
  ('f2670000-0000-4000-8000-000000000f13', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'free@example.com', null),
  ('f2670000-0000-4000-8000-000000000f14', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'expired@example.com', now() - interval '1 day');
update public.users set suspended_reason = 'abuse' where id = 'f2670000-0000-4000-8000-000000000f11';
delete from auth.users where id in ('f2670000-0000-4000-8000-000000000f11', 'f2670000-0000-4000-8000-000000000f12', 'f2670000-0000-4000-8000-000000000f13', 'f2670000-0000-4000-8000-000000000f14');
select pg_temp.chk((select count(*) = 2 from public.banned_emails), 'D: only the two suspended accounts leave a fingerprint (not the free one, not the expired suspension)');
select pg_temp.chk((select expires_at between now() + interval '2 years' - interval '1 minute' and now() + interval '2 years' + interval '1 minute' and reason = 'abuse' from public.banned_emails where fingerprint = public.email_fingerprint('badactor@gmail.com')), 'D: permanent suspension → expires_at = now + 2 years (the minimum), reason kept');
select pg_temp.chk((select expires_at between now() + interval '29 days 23 hours' and now() + interval '30 days 1 hour' and reason = 'suspended' from public.banned_emails where fingerprint = public.email_fingerprint('short@example.com')), 'D: a 30-day suspension → expires_at = banned_until; default reason');
-- sign-up
do $$ begin
  begin
    insert into auth.users (id, instance_id, aud, role, email) values ('f2670000-0000-4000-8000-000000000f21', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'Bad.Actor@gmail.com');
    perform pg_temp.chk(false, 'D: sign-up with a live fingerprint → signup_blocked');
  exception when others then perform pg_temp.chk(sqlerrm = 'signup_blocked' and sqlstate = 'P0001', 'D: sign-up with a live fingerprint (same mailbox written differently) → signup_blocked (P0001)'); end;
end $$;
select pg_temp.chk((select count(*) = 0 from auth.users where id = 'f2670000-0000-4000-8000-000000000f21'), 'D: the blocked sign-up created nothing');
insert into auth.users (id, instance_id, aud, role, email) values ('f2670000-0000-4000-8000-000000000f22', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'someone.else@gmail.com');
select pg_temp.chk((select count(*) = 1 from auth.users where id = 'f2670000-0000-4000-8000-000000000f22'), 'D: any other e-mail signs up');
insert into auth.users (id, instance_id, aud, role) values ('f2670000-0000-4000-8000-000000000f23', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
select pg_temp.chk((select count(*) = 1 from auth.users where id = 'f2670000-0000-4000-8000-000000000f23'), 'D: a user without e-mail (anonymous) is not checked');
update public.banned_emails set expires_at = now() - interval '1 second' where fingerprint = public.email_fingerprint('badactor@gmail.com');
insert into auth.users (id, instance_id, aud, role, email) values ('f2670000-0000-4000-8000-000000000f24', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bad.actor@gmail.com');
select pg_temp.chk((select count(*) = 1 from auth.users where id = 'f2670000-0000-4000-8000-000000000f24'), 'D: an expired fingerprint does not block');
delete from auth.users where id = 'f2670000-0000-4000-8000-000000000f24';
update public.banned_emails set expires_at = now() + interval '1 year' where fingerprint = public.email_fingerprint('badactor@gmail.com');

-- admin_unban_email
select pg_temp.chk(has_function_privilege('authenticated', 'public.admin_unban_email(text)', 'execute') and not has_function_privilege('anon', 'public.admin_unban_email(text)', 'execute'), 'D: admin_unban_email: authenticated yes (checks the role inside), anon no');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f2670000-0000-4000-8000-000000000006","role":"authenticated"}', true);
do $$ begin
  begin perform public.admin_unban_email('bad.actor@gmail.com'); perform pg_temp.chk(false, 'D: a plain user cannot unban');
  exception when others then perform pg_temp.chk(sqlerrm = 'forbidden', 'D: a plain user cannot unban (forbidden)'); end;
end $$;
select set_config('request.jwt.claims', '{"sub":"f2670000-0000-4000-8000-000000000005","role":"authenticated"}', true);
create temp table t_unban as select public.admin_unban_email('Bad.Actor+zz@gmail.com') as r1;
reset role;
select set_config('request.jwt.claims', '', true);
select pg_temp.chk((select r1 from t_unban), 'D: the admin unbans (any way of writing the mailbox) → true');
select pg_temp.chk((select count(*) = 0 from public.banned_emails where fingerprint = public.email_fingerprint('badactor@gmail.com')), 'D: the fingerprint is gone');
select pg_temp.chk((select count(*) = 1 and bool_and(length(detail) = 8 and detail not like '%@%') from public.security_logs where action = 'email_unbanned' and detail <> 'g9'), 'D: security_logs email_unbanned stores 8 characters of the fingerprint, never the e-mail');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f2670000-0000-4000-8000-000000000005","role":"authenticated"}', true);
select pg_temp.chk(not public.admin_unban_email('bad.actor@gmail.com'), 'D: unbanning again → false');
reset role;
select set_config('request.jwt.claims', '', true);
insert into auth.users (id, instance_id, aud, role, email) values ('f2670000-0000-4000-8000-000000000f31', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bad.actor@gmail.com');
select pg_temp.chk((select count(*) = 1 from auth.users where id = 'f2670000-0000-4000-8000-000000000f31'), 'D: after the unban the person can sign up');
select pg_temp.chk((select relrowsecurity from pg_class where oid = 'public.banned_emails'::regclass) and not has_table_privilege('authenticated', 'public.banned_emails', 'select'), 'D: banned_emails: RLS on, closed to clients');
select pg_temp.chk((select count(*) = 1 from pg_trigger where tgrelid = 'auth.users'::regclass and tgname = 'trg_auth_user_ban_check') and (select count(*) = 1 from pg_trigger where tgrelid = 'auth.users'::regclass and tgname = 'trg_auth_user_ban_fingerprint'), 'D: both auth.users triggers exist once (migration applied twice)');

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
