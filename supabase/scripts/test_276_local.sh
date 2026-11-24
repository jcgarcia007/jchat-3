#!/usr/bin/env bash
# Prueba LOCAL de la migración 276 (endurecimiento de anon: public_profiles, límite de solicitudes del plan Custom, privilegios por defecto, funciones de trigger, escrituras de anon, DELETE en businesses, INSERT en trials).
# TODO dentro de UNA transacción que termina en ROLLBACK (258, 262, 265–273 se aplican dentro; la 276 dos veces: idempotente). Solo contra el contenedor local.
#   bash supabase/scripts/test_276_local.sh   (debe terminar en ALL OK)
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
create function pg_temp.u(n int) returns uuid language sql as $$ select ('e2760000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid $$;
grant execute on function pg_temp.u(int) to public;
-- can role r execute EVERY overload of function f in public (and at least one exists)?
create function pg_temp.can_exec(r text, f text) returns boolean language sql as $$
  select count(*) > 0 and bool_and(has_function_privilege(r, p.oid, 'execute')) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = f $$;
grant execute on function pg_temp.can_exec(text, text) to public;
SQL
cat <<'SQL'
-- PRODUCTION PREREQUISITE not yet on main: migration 272_outbound_emails_subscriptions (branch web/correos-planes) widens outbound_emails (kind check, to_email, reply_to, dedupe_key,
-- recipient trigger). Production has it applied; the 276 function relies on it. Same DDL as that file (sections 1-4), so the test runs against production's shape.
do $$ begin
  if exists (select 1 from pg_constraint where conrelid = 'public.outbound_emails'::regclass and conname = 'outbound_emails_kind_chk' and pg_get_constraintdef(oid) not like '%subscription_started%') then
    alter table public.outbound_emails drop constraint outbound_emails_kind_chk;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.outbound_emails'::regclass and conname = 'outbound_emails_kind_chk') then
    alter table public.outbound_emails add constraint outbound_emails_kind_chk check (kind in ('reservation_cancelled_business_closed', 'subscription_started', 'trial_will_end', 'business_plan_request'));
  end if;
end $$;
alter table public.outbound_emails add column if not exists to_email text;
alter table public.outbound_emails add column if not exists reply_to text;
alter table public.outbound_emails add column if not exists dedupe_key text;
create or replace function public.outbound_emails_require_recipient() returns trigger language plpgsql set search_path = public as $f$
begin
  if new.user_id is null and new.to_email is null then raise exception 'outbound_emails: user_id or to_email is required' using errcode = 'check_violation'; end if;
  return new;
end; $f$;
create or replace trigger trg_outbound_emails_require_recipient before insert on public.outbound_emails for each row execute function public.outbound_emails_require_recipient();
create unique index if not exists outbound_emails_dedupe_key_uq on public.outbound_emails (dedupe_key);
SQL
cat "$ROOT/supabase/migrations/276_security_hardening_anon.sql"
cat "$ROOT/supabase/migrations/276_security_hardening_anon.sql"   # idempotent: the second run must not fail
cat <<'SQL'

-- people: 01 owner of the venue · 02 another signed-in user
insert into auth.users (id, instance_id, aud, role, email)
  select pg_temp.u(n), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'u276' || n || '@example.com' from generate_series(1, 2) n;
insert into public.users (id, username) select pg_temp.u(n), 'u276_' || n from generate_series(1, 2) n on conflict (id) do nothing;
set local session_replication_role = replica;
insert into public.businesses (id, owner_id, name, slug, status, is_active, timezone, hours) values
  ('e2760000-0000-4000-8000-0000000000b1', pg_temp.u(1), 'Bar 276', 'bar-276-1', 'verified', true, 'America/New_York', '{}'::jsonb);
set local session_replication_role = origin;

-- ── S-01 public_profiles ──────────────────────────────────────────────────────────────────────────────────────────────────────────
select pg_temp.chk(not has_table_privilege('anon', 'public.public_profiles', 'select'), 'S-01: anon has no SELECT on public_profiles');
select pg_temp.chk(has_table_privilege('authenticated', 'public.public_profiles', 'select'), 'S-01: authenticated keeps SELECT on public_profiles');
set local role anon;
select pg_temp.err($q$select * from public.public_profiles limit 1$q$, 'permission denied', 'S-01: anon reading public_profiles → permission denied');
reset role;
select pg_temp.login(2);
select pg_temp.chk((select count(*) >= 1 from public.public_profiles), 'S-01: a signed-in user still reads public_profiles');
select pg_temp.logout();

-- ── S-02 business plan requests ───────────────────────────────────────────────────────────────────────────────────────────────────
select pg_temp.chk(not has_function_privilege('anon', 'public.submit_business_plan_request(text,integer,text,text,text,text,text)', 'execute'), 'S-02: anon cannot execute the original RPC');
select pg_temp.chk(not has_function_privilege('authenticated', 'public.submit_business_plan_request(text,integer,text,text,text,text,text)', 'execute'), 'S-02: authenticated cannot execute the original RPC');
select pg_temp.chk(has_function_privilege('service_role', 'public.submit_business_plan_request(text,integer,text,text,text,text,text)', 'execute'), 'S-02: service_role keeps the original RPC (same signature)');
select pg_temp.chk(to_regprocedure('public.submit_business_plan_request_server(text,integer,text,text,text,text,text,uuid)') is not null
                   and not has_function_privilege('anon', 'public.submit_business_plan_request_server(text,integer,text,text,text,text,text,uuid)', 'execute')
                   and not has_function_privilege('authenticated', 'public.submit_business_plan_request_server(text,integer,text,text,text,text,text,uuid)', 'execute')
                   and has_function_privilege('service_role', 'public.submit_business_plan_request_server(text,integer,text,text,text,text,text,uuid)', 'execute'), 'S-02: the _server RPC exists and only service_role executes it');
set local role anon;
select pg_temp.err($q$select public.submit_business_plan_request('Bar', 1, null, 'a@example.com', null, 'es', 'chosen-by-the-attacker')$q$, 'permission denied', 'S-02: anon calling the RPC with its own ip_hash → permission denied');
reset role;
set local role authenticated;
select pg_temp.err($q$select public.submit_business_plan_request('Bar', 1, null, 'a@example.com', null, 'es', 'chosen-by-the-attacker')$q$, 'permission denied', 'S-02: authenticated calling the RPC directly → permission denied');
reset role;
set local role service_role;
select public.submit_business_plan_request_server('Bar Uno', 2, null, 'dueno@example.com', null, 'es', 'iphash-1', pg_temp.u(2)) as r1 \gset
select pg_temp.chk((:'r1'::jsonb)->>'ok' = 'true', 'S-02: valid request → ok');
reset role;
select pg_temp.chk((select user_id = pg_temp.u(2) and ip_hash = 'iphash-1' and email = 'dueno@example.com' from public.business_plan_requests limit 1), 'S-02: the user id comes from the parameter (service_role has no auth.uid())');
set local role service_role;
select pg_temp.chk((public.submit_business_plan_request_server('', 2, null, 'x@example.com', null, 'es', 'iphash-9', null))->>'code' = 'INVALID', 'S-02: invalid name → INVALID');
select public.submit_business_plan_request_server('Bar Uno', 2, null, 'DUENO@example.com', null, 'en', 'iphash-2', null);
select public.submit_business_plan_request_server('Bar Uno', 2, null, 'dueno@example.com', null, 'es', 'iphash-3', null);
select pg_temp.chk((public.submit_business_plan_request_server('Bar Uno', 2, null, 'dueno@example.com', null, 'es', 'iphash-4', null))->>'code' = 'RATE_LIMIT', 'S-02: 4th request of the same e-mail in an hour → RATE_LIMIT (changing the ip_hash does not help)');
select public.submit_business_plan_request_server('Local A', 1, null, 'a@example.com', null, 'es', 'same-ip', null);
select public.submit_business_plan_request_server('Local B', 1, null, 'b@example.com', null, 'es', 'same-ip', null);
select public.submit_business_plan_request_server('Local C', 1, null, 'c@example.com', null, 'es', 'same-ip', null);
select pg_temp.chk((public.submit_business_plan_request_server('Local D', 1, null, 'd@example.com', null, 'es', 'same-ip', null))->>'code' = 'RATE_LIMIT', 'S-02: 4th request of the same ip_hash with other e-mails → RATE_LIMIT');
-- global cap: 30 per hour in total, however the e-mail / ip_hash change
reset role;
insert into public.business_plan_requests (business_name, locations_count, email, ip_hash)
  select 'Flood ' || g, 1, 'flood' || g || '@example.com', 'flood-ip-' || g from generate_series(1, 30 - (select count(*) from public.business_plan_requests where created_at > now() - interval '1 hour')::int) g;
select pg_temp.chk((select count(*) = 30 from public.business_plan_requests where created_at > now() - interval '1 hour'), 'S-02: (setup) 30 requests in the last hour');
set local role service_role;
select pg_temp.chk((public.submit_business_plan_request_server('Otro', 1, null, 'brand-new@example.com', null, 'es', 'brand-new-ip', null))->>'code' = 'RATE_LIMIT', 'S-02: the 31st request of the hour, all-new e-mail and ip_hash → RATE_LIMIT (global cap)');
reset role;

-- ── sales e-mail (what production's function does after the insert; the first 276 lost it) ─────────────────────────────────────────
-- (the 31st-request check above ran with the hour full; start from a clean table so this block is independent)
delete from public.business_plan_requests;
delete from public.outbound_emails;
set local role service_role;
select public.submit_business_plan_request_server('Mail Bar', 3, '555-0100', 'Solicitante@Example.com', 'hola', 'es', 'mail-ip', pg_temp.u(2)) as rm \gset
reset role;
select pg_temp.chk((:'rm'::jsonb)->>'ok' = 'true', 'mail: a valid request answers ok');
select pg_temp.chk((select count(*) = 1 from public.outbound_emails where kind = 'business_plan_request'), 'mail: exactly ONE outbound_emails row of kind business_plan_request');
select pg_temp.chk((select to_email = 'ventas@jchat.cloud' and reply_to = 'solicitante@example.com' and user_id is null from public.outbound_emails where kind = 'business_plan_request'), 'mail: to_email = sales, reply_to = the requester (lower-cased)');
select pg_temp.chk((select payload->>'business_name' = 'Mail Bar' and (payload->>'locations_count')::int = 3 and payload->>'phone' = '555-0100' and payload->>'email' = 'solicitante@example.com'
                           and payload->>'message' = 'hola' and payload->>'locale' = 'es' and (payload->>'request_id')::uuid = r.id and payload ? 'created_at'
                      from public.outbound_emails e, public.business_plan_requests r where e.kind = 'business_plan_request'), 'mail: payload has business_name, locations_count, phone, email, message, locale, request_id (= the stored request), created_at');
-- a request refused by a limit creates no row
set local role service_role;
select public.submit_business_plan_request_server('Mail Bar', 3, null, 'solicitante@example.com', null, 'es', 'mail-ip-2', null);
select public.submit_business_plan_request_server('Mail Bar', 3, null, 'solicitante@example.com', null, 'es', 'mail-ip-3', null);
select pg_temp.chk((public.submit_business_plan_request_server('Mail Bar', 3, null, 'solicitante@example.com', null, 'es', 'mail-ip-4', null))->>'code' = 'RATE_LIMIT', 'mail: (setup) the 4th request is refused');
select pg_temp.chk((public.submit_business_plan_request_server('', 3, null, 'x@example.com', null, 'es', null, null))->>'code' = 'INVALID', 'mail: (setup) an invalid request is refused');
reset role;
select pg_temp.chk((select count(*) = 3 from public.outbound_emails where kind = 'business_plan_request'), 'mail: refused requests (RATE_LIMIT, INVALID) create no row (3 rows for 3 accepted requests)');
-- without the secret in the vault the request still answers ok; with it, the delivery trigger runs without breaking the request
select pg_temp.chk(not exists (select 1 from vault.decrypted_secrets where name = 'push_webhook_secret'), 'mail: (setup) the local vault has no push_webhook_secret');
set local role service_role;
select public.submit_business_plan_request_server('Sin secreto', 1, null, 'sin@example.com', null, 'en', 'no-secret-ip', null) as rn \gset
reset role;
select pg_temp.chk((:'rn'::jsonb)->>'ok' = 'true' and exists (select 1 from public.outbound_emails where payload->>'business_name' = 'Sin secreto'), 'mail: no push_webhook_secret in the vault → still ok, row queued (the cron delivers it)');
select vault.create_secret('local-test-secret', 'push_webhook_secret');
set local role service_role;
select public.submit_business_plan_request_server('Con secreto', 1, null, 'con@example.com', null, 'en', 'secret-ip', null) as rs \gset
reset role;
select pg_temp.chk((:'rs'::jsonb)->>'ok' = 'true' and exists (select 1 from public.outbound_emails where payload->>'business_name' = 'Con secreto'), 'mail: with the secret → ok, row queued, immediate delivery requested without error');
-- if queuing the e-mail fails the request is NOT lost
alter table public.outbound_emails add constraint zz_block_mail check (payload->>'business_name' <> 'Falla correo');
set local role service_role;
select public.submit_business_plan_request_server('Falla correo', 1, null, 'falla@example.com', null, 'en', 'fail-ip', null) as rf \gset
reset role;
select pg_temp.chk((:'rf'::jsonb)->>'ok' = 'true' and exists (select 1 from public.business_plan_requests where business_name = 'Falla correo') and not exists (select 1 from public.outbound_emails where payload->>'business_name' = 'Falla correo'), 'mail: if the e-mail cannot be queued the request is still stored and answers ok');
alter table public.outbound_emails drop constraint zz_block_mail;
select pg_temp.chk(not exists (select 1 from information_schema.role_table_grants where grantee = 'anon' and table_schema = 'public' and privilege_type = 'MAINTAIN'), 'MAINTAIN: anon has no MAINTAIN on any table of public');

-- ── H-108 default privileges ──────────────────────────────────────────────────────────────────────────────────────────────────────
create function public.zz_after_276_fn() returns int language sql as $$ select 1 $$;
select pg_temp.chk(not has_function_privilege('anon', 'public.zz_after_276_fn()', 'execute'), 'H-108: a function created after the migration is NOT executable by anon');
select pg_temp.chk(not exists (select 1 from pg_proc p, lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where p.oid = 'public.zz_after_276_fn()'::regprocedure and a.grantee = 0), 'H-108: ... nor by PUBLIC');
select pg_temp.chk(has_function_privilege('authenticated', 'public.zz_after_276_fn()', 'execute') and has_function_privilege('service_role', 'public.zz_after_276_fn()', 'execute'), 'H-108: ... but authenticated and service_role keep the default grant');
create function public.zz_explicit_fn() returns int language sql as $$ select 1 $$;
grant execute on function public.zz_explicit_fn() to anon;
select pg_temp.chk(has_function_privilege('anon', 'public.zz_explicit_fn()', 'execute'), 'H-108: an explicit grant to anon still works');

-- ── S-06 ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
select pg_temp.chk(not has_function_privilege('anon', 'public.auth_user_ban_check()', 'execute') and not has_function_privilege('authenticated', 'public.auth_user_ban_check()', 'execute'), 'S-06: nobody but the owner executes auth_user_ban_check()');
select pg_temp.chk(not has_function_privilege('anon', 'public.auth_user_ban_fingerprint()', 'execute') and not has_function_privilege('authenticated', 'public.auth_user_ban_fingerprint()', 'execute'), 'S-06: nobody but the owner executes auth_user_ban_fingerprint()');
-- the triggers still fire: Postgres checks EXECUTE only when the trigger is CREATED, never when it fires. Proof with the real thing and with a caller that has no EXECUTE:
insert into auth.users (id, instance_id, aud, role, email) values ('e2760000-0000-4000-8000-0000000000f1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'signup276@example.com');
delete from auth.users where id = 'e2760000-0000-4000-8000-0000000000f1';
select pg_temp.chk(true, 'S-06: sign-up and delete in auth.users still run through the ban triggers (as the owner, no error)');
create table public.zz_trg_t (id int);
create function public.zz_trg_fn() returns trigger language plpgsql security definer set search_path = '' as $$ begin new.id := coalesce(new.id, 0) + 1; return new; end $$;
revoke all on function public.zz_trg_fn() from public, anon, authenticated;
create trigger zz_trg before insert on public.zz_trg_t for each row execute function public.zz_trg_fn();
grant insert, select on public.zz_trg_t to authenticated;
select pg_temp.login(2);
insert into public.zz_trg_t (id) values (41);
select pg_temp.chk((select id = 42 from public.zz_trg_t), 'S-06: a signed-in caller WITHOUT execute on the trigger function still fires it (no permission error)');
select pg_temp.logout();
select pg_temp.chk((select proconfig = array['search_path=""'] from pg_proc where oid = 'public.match_fits(text,text)'::regprocedure), 'S-06: match_fits has search_path = ''''');
select pg_temp.chk(public.match_fits('all', 'man') and public.match_fits('women', 'woman') and not public.match_fits('men', 'woman') and public.match_fits(null, 'man') is null, 'S-06: match_fits still answers the same');
select pg_temp.chk(not exists (select 1 from information_schema.role_table_grants where grantee = 'anon' and table_schema = 'public' and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')), 'S-06: anon has no INSERT/UPDATE/DELETE/TRUNCATE on any table of public');
select pg_temp.chk(has_any_column_privilege('authenticated', 'public.businesses', 'update') and has_table_privilege('authenticated', 'public.posts', 'insert'), 'S-06: authenticated keeps its writes (businesses column update, posts insert)');
create table public.zz_after_276_t (id int);
select pg_temp.chk(not has_table_privilege('anon', 'public.zz_after_276_t', 'insert') and not has_table_privilege('anon', 'public.zz_after_276_t', 'delete') and has_table_privilege('authenticated', 'public.zz_after_276_t', 'insert'), 'S-06: a table created after the migration gives anon no writes (authenticated unchanged)');

-- ── S-03 / S-04 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
select pg_temp.chk(not has_table_privilege('authenticated', 'public.businesses', 'delete'), 'S-03: authenticated has no DELETE on businesses');
select pg_temp.login(1);
select pg_temp.err($q$delete from public.businesses where id = 'e2760000-0000-4000-8000-0000000000b1'$q$, 'permission denied', 'S-03: the OWNER deleting their venue → permission denied');
select pg_temp.chk((select count(*) = 1 from public.businesses where id = 'e2760000-0000-4000-8000-0000000000b1'), 'S-03: ... and the venue is still there');
select pg_temp.chk((select count(*) = 1 from public.businesses where owner_id = pg_temp.u(1)), 'S-03: ... and the owner still reads it');
select pg_temp.err($q$insert into public.trials (business_id, ends_at) values ('e2760000-0000-4000-8000-0000000000b1', now() + interval '365 days')$q$, 'permission denied', 'S-04: the owner inserting a trial → permission denied');
select pg_temp.logout();
set local role anon;
select pg_temp.err($q$insert into public.trials (business_id, ends_at) values ('e2760000-0000-4000-8000-0000000000b1', now() + interval '365 days')$q$, 'permission denied', 'S-04: anon inserting a trial → permission denied');
reset role;
select pg_temp.chk((select count(*) = 0 from public.trials), 'S-04: nobody inserted a trial');
select pg_temp.chk(has_table_privilege('authenticated', 'public.trials', 'select'), 'S-04: the table is still readable (nothing dropped)');

-- ── guest flows that use RPC without a session keep working ───────────────────────────────────────────────────────────────────────
select pg_temp.chk(pg_temp.can_exec('anon', 'resolve_table_qr'), 'guest: anon executes resolve_table_qr');
select pg_temp.chk(pg_temp.can_exec('anon', 'resolve_room_qr'), 'guest: anon executes resolve_room_qr');
select pg_temp.chk(pg_temp.can_exec('anon', 'get_public_receipt'), 'guest: anon executes get_public_receipt');
select pg_temp.chk(pg_temp.can_exec('anon', 'username_available'), 'guest: anon executes username_available');
select pg_temp.chk(pg_temp.can_exec('anon', 'resolve_venue_entry'), 'guest: anon executes resolve_venue_entry');
select pg_temp.chk(pg_temp.can_exec('anon', 'guest_order_view'), 'guest: anon executes guest_order_view');

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
