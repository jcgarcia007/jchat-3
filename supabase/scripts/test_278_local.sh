#!/usr/bin/env bash
# Prueba LOCAL de la migración 278 (borrado real de fotos y voces del chat, ofertas pausadas, cuentas de Stripe falsas). TODO dentro de UNA transacción que
# termina en ROLLBACK (258, 262, 265–272 se aplican dentro; la 278 dos veces: idempotente; después su rollback y otra vez la 278). Solo contra el contenedor local.
#   bash supabase/scripts/test_278_local.sh
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"
[ -S "$HOME/.docker/run/docker.sock" ] && export DOCKER_HOST="${DOCKER_HOST:-unix://$HOME/.docker/run/docker.sock}"
C="${SQL_TEST_CONTAINER:-supabase_db_jchat-local}"
case "$C" in *local*) ;; *) echo "REFUSING: container $C is not a local one"; exit 2 ;; esac
docker inspect "$C" >/dev/null 2>&1 || { echo "local database is not running (bash loadtest/local-up.sh)"; exit 2; }

M278="$ROOT/supabase/migrations/278_chat_media_purge_offers.sql"
R278="$ROOT/supabase/rollbacks/278_chat_media_purge_offers_rollback.sql"
STRIPE_STMT="$(grep -E '^update public.businesses set stripe_account_id' "$M278")"
[ -n "$STRIPE_STMT" ] || { echo "the Stripe statement is not in the migration"; exit 2; }

TMP=$(mktemp)
{
cat <<'SQL'
\set ON_ERROR_STOP on
begin;
SQL
for m in 258_storage_user_objects 262_review_mode 265_owner_account_close 266_stale_orders_and_email_retry 267_retention_and_report_evidence 268_users_plan_interval_trial_used 269_business_plan_requests 270_business_owner_is_pro 271_users_plan_status_past_due 272_report_evidence 278_chat_media_purge_offers 278_chat_media_purge_offers; do
  cat "$ROOT/supabase/migrations/$m.sql"
done
cat <<'SQL'
create temp table t_out (ok boolean, name text) on commit drop;
grant all on t_out to public;
create function pg_temp.chk(c boolean, n text) returns void language sql as $$ insert into t_out values (coalesce(c, false), n) $$;
grant execute on function pg_temp.chk(boolean, text) to public;
create function pg_temp.err(q text, expected text, n text) returns void language plpgsql as $$
begin
  execute q;
  insert into t_out values (false, n || ' (no error)');
exception when others then
  insert into t_out values (sqlerrm like '%' || expected || '%' or sqlstate = expected, n || ' [' || sqlerrm || ']');
end $$;
grant execute on function pg_temp.err(text, text, text) to public;
create function pg_temp.u(n int) returns uuid language sql as $$ select ('e2780000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
grant execute on function pg_temp.u(int) to public;
create function pg_temp.login(n int) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.u(n), 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
grant execute on function pg_temp.login(int) to public;

-- people: 1 = owner of the venue, 2 = other
insert into auth.users (id, instance_id, aud, role, email)
  select pg_temp.u(n), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'u278' || n || '@example.com' from generate_series(1, 2) n;
insert into public.users (id, username) select pg_temp.u(n), 'u278_' || n from generate_series(1, 2) n on conflict (id) do nothing;
set local session_replication_role = replica;
insert into public.businesses (id, owner_id, name, slug, status, is_active, stripe_account_id) values
  (pg_temp.u(500), pg_temp.u(1), 'Bar 278', 'bar-278-xx', 'verified', true, 'acct_STUB_one'),
  (pg_temp.u(501), pg_temp.u(1), 'Bar 278 b', 'bar-278-yy', 'verified', true, 'acct_STUB_two'),
  (pg_temp.u(502), pg_temp.u(1), 'Bar 278 c', 'bar-278-zz', 'verified', true, 'acct_1RealAccount'),
  (pg_temp.u(503), pg_temp.u(1), 'Bar 278 d', 'bar-278-ww', 'verified', true, null),
  (pg_temp.u(504), pg_temp.u(1), 'Bar 278 e', 'bar-278-vv', 'verified', true, 'acct_STUBBY_not_ours');
set local session_replication_role = origin;

-- ───────── 1. structure and permissions ─────────
select pg_temp.chk((select relrowsecurity from pg_class where oid = 'public.chat_media_purge_queue'::regclass)
  and not has_table_privilege('authenticated', 'public.chat_media_purge_queue', 'select') and not has_table_privilege('anon', 'public.chat_media_purge_queue', 'select')
  and has_table_privilege('service_role', 'public.chat_media_purge_queue', 'select')
  and (select count(*) = 0 from pg_policies where schemaname = 'public' and tablename = 'chat_media_purge_queue'), '1: queue: RLS on, no policies, closed to clients, service_role only');
select pg_temp.chk(bool_and(not has_function_privilege('authenticated', p, 'execute') and not has_function_privilege('anon', p, 'execute') and has_function_privilege('service_role', p, 'execute')),
  '1: the new functions are callable by service_role only')
  from unnest(array['public.chat_message_media_object(text,text)', 'public.chat_media_paths_in_use(text,text[])', 'public.chat_media_purge_retry()',
                    'public.chat_media_backlog_candidates()', 'public.chat_media_backlog_preview()', 'public.chat_media_backlog_enqueue()']) p;
select pg_temp.chk((select count(*) = 1 from cron.job where jobname = 'chat-media-purge' and schedule = '*/15 * * * *'), '1: cron chat-media-purge scheduled once (*/15 * * * *) after applying 278 twice');
select pg_temp.chk((select count(*) = 1 from pg_trigger where tgrelid = 'public.offers'::regclass and tgname = 'offers_sync_is_active' and not tgisinternal), '1: one offers_sync_is_active trigger after applying 278 twice');
select pg_temp.chk((select count(*) = 1 from cron.job where jobname = 'purge-expired-messages' and schedule = '*/15 * * * *'), '1: the existing purge-expired-messages cron is untouched');
select pg_temp.chk(pg_get_functiondef('public.purge_expired_messages()'::regprocedure) !~ 'storage\.objects' and pg_get_functiondef('public.purge_expired_messages()'::regprocedure) ~ 'chat_media_purge_queue',
  '1: purge_expired_messages no longer touches storage.objects and queues the files');

-- ───────── 2. which file a message has ─────────
select pg_temp.chk((select bucket = 'post-media' and path = pg_temp.u(1) || '/1790000000000.jpg' from public.chat_message_media_object('photo', 'https://x.supabase.co/storage/v1/object/public/post-media/' || pg_temp.u(1) || '/1790000000000.jpg')), '2: photo with the public URL → post-media + {uid}/{file}');
select pg_temp.chk(not exists (select 1 from public.chat_message_media_object('photo', 'https://x.supabase.co/storage/v1/object/public/post-media/' || pg_temp.u(1) || '/business/' || pg_temp.u(500) || '/1.jpg')), '2: a business post path (4 segments) is not a chat photo');
select pg_temp.chk(not exists (select 1 from public.chat_message_media_object('photo', 'https://x.supabase.co/storage/v1/object/public/avatars/' || pg_temp.u(1) || '/1.jpg')), '2: another bucket → nothing');
select pg_temp.chk((select bucket = 'voice-notes' and path = 'room/' || pg_temp.u(2) || '/' || pg_temp.u(1) || '/a.m4a' from public.chat_message_media_object('voice', 'room/' || pg_temp.u(2) || '/' || pg_temp.u(1) || '/a.m4a')), '2: voice with the room path → voice-notes + the path');
select pg_temp.chk(not exists (select 1 from public.chat_message_media_object('voice', pg_temp.u(1) || '/a.m4a')) and not exists (select 1 from public.chat_message_media_object('voice', null))
  and not exists (select 1 from public.chat_message_media_object('text', 'room/' || pg_temp.u(2) || '/' || pg_temp.u(1) || '/a.m4a')), '2: a wrong shape, null or another type → nothing');

-- ───────── 3. purge_expired_messages: the rows go as before, the files are queued (with the same exceptions) ─────────
set local session_replication_role = replica;
create function pg_temp.purl(n int) returns text language sql as $$ select 'https://x.supabase.co/storage/v1/object/public/post-media/' || pg_temp.u(1) || '/ph' || n || '.jpg' $$;
create function pg_temp.vpath(n int) returns text language sql as $$ select 'room/' || pg_temp.u(2) || '/' || pg_temp.u(1) || '/v' || n || '.m4a' $$;
insert into public.messages (id, room_id, user_id, body, type, media_url, created_at) values
  (pg_temp.u(11), pg_temp.u(900), pg_temp.u(1), '', 'photo', pg_temp.purl(1), now() - interval '25 hours'),   -- old photo → deleted + queued
  (pg_temp.u(12), pg_temp.u(900), pg_temp.u(1), '', 'voice', pg_temp.vpath(1), now() - interval '30 hours'),  -- old voice → deleted + queued
  (pg_temp.u(13), pg_temp.u(900), pg_temp.u(1), 'hi', 'text', null,           now() - interval '26 hours'),   -- old text → deleted, nothing queued
  (pg_temp.u(14), pg_temp.u(900), pg_temp.u(1), '', 'photo', pg_temp.purl(2), now() - interval '2 hours'),    -- new photo → stays, not queued
  (pg_temp.u(15), pg_temp.u(900), pg_temp.u(1), '', 'photo', pg_temp.purl(3), now() - interval '40 hours'),   -- old but PINNED → stays, not queued
  (pg_temp.u(16), pg_temp.u(900), pg_temp.u(1), '', 'voice', pg_temp.vpath(2), now() - interval '40 hours'),  -- old but under a report hold → stays, not queued
  (pg_temp.u(17), pg_temp.u(900), pg_temp.u(1), '', 'photo', 'https://x.supabase.co/storage/v1/object/public/post-media/' || pg_temp.u(1) || '/business/' || pg_temp.u(500) || '/p.jpg', now() - interval '50 hours'), -- odd shape → deleted, not queued
  (pg_temp.u(18), pg_temp.u(900), pg_temp.u(1), '', 'voice', null,            now() - interval '50 hours'),   -- voice without a path → deleted, nothing queued
  (pg_temp.u(19), pg_temp.u(900), pg_temp.u(1), '', 'photo', pg_temp.purl(1), now() - interval '28 hours'),   -- the SAME file as message 11 → one queue row
  (pg_temp.u(20), pg_temp.u(900), pg_temp.u(1), '', 'photo', pg_temp.purl(4), now() - interval '60 hours');   -- old photo but its report is closed (no hold) → deleted + queued
insert into public.pinned_messages (room_id, message_id, pinned_by) values (pg_temp.u(900), pg_temp.u(15), pg_temp.u(1));
insert into public.reports (reporter_id, reported_user_id, content_type, content_id, reason, status) values (pg_temp.u(2), pg_temp.u(1), 'message', pg_temp.u(16), 'harassment', 'pending');
insert into public.reports (reporter_id, reported_user_id, content_type, content_id, reason, status, resolution, resolved_at) values (pg_temp.u(2), pg_temp.u(1), 'message', pg_temp.u(20), 'spam', 'dismissed', 'dismissed', now() - interval '3 days');
set local session_replication_role = origin;
select public.purge_expired_messages();
select pg_temp.chk((select array_agg(id order by id) = array[pg_temp.u(14), pg_temp.u(15), pg_temp.u(16)] from public.messages where id between pg_temp.u(11) and pg_temp.u(20)),
  '3: the rows: only the new, the pinned and the held message remain (the deletion is as before)');
select pg_temp.chk((select count(*) = 3 from public.chat_media_purge_queue where path in (substring(pg_temp.purl(1) from '/post-media/(.+)$'), pg_temp.vpath(1), substring(pg_temp.purl(4) from '/post-media/(.+)$'))
                                                                            and bucket = case when path like 'room/%' then 'voice-notes' else 'post-media' end), '3: queued: the old photo (once even if two messages share it), the old voice and the one with a closed report');
select pg_temp.chk((select count(*) = 3 from public.chat_media_purge_queue), '3: nothing else is queued (not the new, pinned, held, odd-shaped or path-less ones)');
select pg_temp.chk((select count(*) = 0 from public.chat_media_purge_queue where path = pg_temp.vpath(2) or path like '%ph2.jpg' or path like '%ph3.jpg'), '3: the pinned and the held files are not queued');
select public.purge_expired_messages();
select pg_temp.chk((select count(*) = 3 from public.chat_media_purge_queue), '3: running it again is idempotent (no duplicates, nothing else deleted)');
select pg_temp.chk((select count(*) = 3 from public.messages where id between pg_temp.u(11) and pg_temp.u(20)), '3: second run: same 3 rows');
delete from public.chat_media_purge_queue;

-- ───────── 4. chat_media_paths_in_use ─────────
set local session_replication_role = replica;
insert into public.posts (id, user_id, media_urls) values
  (pg_temp.u(40), pg_temp.u(1), array['https://x.supabase.co/storage/v1/object/public/post-media/' || pg_temp.u(1) || '/business/' || pg_temp.u(500) || '/bp.jpg']),
  (pg_temp.u(41), pg_temp.u(1), array['https://x.supabase.co/storage/v1/object/public/post-media/' || pg_temp.u(1) || '/oldpost.jpg']);
insert into public.reports (reporter_id, reported_user_id, content_type, content_id, reason, status, snapshot) values
  (pg_temp.u(2), pg_temp.u(1), 'message', pg_temp.u(60), 'child_safety', 'pending', jsonb_build_object('media_url', 'https://x.supabase.co/storage/v1/object/public/post-media/' || pg_temp.u(1) || '/held.jpg', 'voice', 'room/' || pg_temp.u(2) || '/' || pg_temp.u(1) || '/heldv.m4a'));
set local session_replication_role = origin;
select pg_temp.chk((select array_agg(x order by x) = array[pg_temp.u(1) || '/ph3.jpg'] from public.chat_media_paths_in_use('post-media', array[pg_temp.u(1) || '/ph3.jpg', pg_temp.u(1) || '/free.jpg']) x),
  '4: a photo a pinned message still references is in use; a free one is not');
select pg_temp.chk((select array_agg(x order by x) = array[pg_temp.u(1) || '/oldpost.jpg'] from public.chat_media_paths_in_use('post-media', array[pg_temp.u(1) || '/oldpost.jpg', pg_temp.u(1) || '/free.jpg']) x), '4: a photo a post references is in use');
select pg_temp.chk((select array_agg(x order by x) = array[pg_temp.u(1) || '/business/' || pg_temp.u(500) || '/bp.jpg'] from public.chat_media_paths_in_use('post-media', array[pg_temp.u(1) || '/business/' || pg_temp.u(500) || '/bp.jpg']) x), '4: a business post file is in use');
select pg_temp.chk((select array_agg(x order by x) = array[pg_temp.vpath(2)] from public.chat_media_paths_in_use('voice-notes', array[pg_temp.vpath(2), pg_temp.vpath(1)]) x), '4: a voice note the held message still references is in use; a free one is not');
select pg_temp.chk((select array_agg(x order by x) = array[pg_temp.u(1) || '/held.jpg'] from public.chat_media_paths_in_use('post-media', array[pg_temp.u(1) || '/held.jpg', pg_temp.u(1) || '/free.jpg']) x), '4: a file a report in hold has in its snapshot is in use');
select pg_temp.chk((select count(*) = 0 from public.chat_media_paths_in_use('post-media', array[pg_temp.vpath(2)])) and (select count(*) = 0 from public.chat_media_paths_in_use('voice-notes', array[pg_temp.u(1) || '/ph3.jpg'])), '4: the bucket matters (a voice path is not a photo path)');

-- ───────── 5. chat_media_purge_retry: same backoff as evidence_purge_retry ─────────
delete from public.reports;
insert into public.chat_media_purge_queue (bucket, path) select 'post-media', pg_temp.u(1) || '/q' || n || '.jpg' from generate_series(1, 3) n;
select pg_temp.chk(public.chat_media_purge_retry() = 0, '5: without the vault secret → 0 and nothing touched');
select pg_temp.chk((select count(*) = 3 and bool_and(attempts = 0) from public.chat_media_purge_queue), '5: …and the attempts are not counted');
select vault.create_secret('test-secret-278', 'push_webhook_secret', 'test');
select pg_temp.chk(public.chat_media_purge_retry() = 3, '5: with the secret → picks the 3 (one call)');
select pg_temp.chk((select bool_and(attempts = 1 and last_attempt_at is not null) from public.chat_media_purge_queue), '5: the attempt is counted');
select pg_temp.chk(public.chat_media_purge_retry() = 0, '5: immediately again → 0 (backoff 10 min × 2^1)');
update public.chat_media_purge_queue set last_attempt_at = now() - interval '21 minutes';
select pg_temp.chk(public.chat_media_purge_retry() = 3, '5: after 21 min (backoff 20) → picked again');
update public.chat_media_purge_queue set attempts = 6, last_attempt_at = now() - interval '2 days';
select pg_temp.chk(public.chat_media_purge_retry() = 0, '5: attempts = 6 → never picked again');
select pg_temp.chk((select count(*) = 3 from public.security_logs where action = 'chat_media_purge_gave_up'), '5: the 3 that gave up are logged once each');
select public.chat_media_purge_retry();
select pg_temp.chk((select count(*) = 3 from public.security_logs where action = 'chat_media_purge_gave_up'), '5: …and not logged again');
delete from public.chat_media_purge_queue;
insert into public.chat_media_purge_queue (bucket, path) select 'post-media', pg_temp.u(1) || '/b' || n || '.jpg' from generate_series(1, 60) n;
select pg_temp.chk(public.chat_media_purge_retry() = 50, '5: 50 per batch');
select pg_temp.chk(public.chat_media_purge_retry() = 10, '5: the rest on the next pass');
select pg_temp.chk(public.chat_media_purge_retry() = 0, '5: queue idle → 0 (the cron calls nothing)');
delete from public.chat_media_purge_queue;

-- ───────── 6. the backlog (what accumulated before the fix) ─────────
insert into storage.objects (bucket_id, name, created_at, metadata) values
  ('voice-notes', 'room/' || pg_temp.u(2) || '/' || pg_temp.u(1) || '/old1.m4a', now() - interval '60 days', '{"size": 1000}'),          -- candidate
  ('voice-notes', 'room/' || pg_temp.u(2) || '/' || pg_temp.u(1) || '/old2.m4a', now() - interval '30 days', '{"size": 2000}'),          -- candidate
  ('voice-notes', 'room/' || pg_temp.u(2) || '/' || pg_temp.u(1) || '/v2.m4a',   now() - interval '60 days', '{"size": 500}'),           -- the held message references it → not
  ('voice-notes', 'room/' || pg_temp.u(2) || '/' || pg_temp.u(1) || '/fresh.m4a', now() - interval '2 hours', '{"size": 500}'),          -- younger than 24 h → not
  ('voice-notes', pg_temp.u(1) || '/wrongshape.m4a',                               now() - interval '60 days', '{"size": 500}'),          -- wrong shape → not
  ('post-media',  pg_temp.u(1) || '/orphan1.jpg',                                  now() - interval '90 days', '{"size": 3000}'),          -- candidate
  ('post-media',  pg_temp.u(1) || '/orphan2.png',                                  now() - interval '40 days', '{"size": 4000}'),          -- candidate
  ('post-media',  pg_temp.u(1) || '/ph3.jpg',                                      now() - interval '90 days', '{"size": 100}'),           -- the pinned message references it → not
  ('post-media',  pg_temp.u(1) || '/oldpost.jpg',                                  now() - interval '90 days', '{"size": 100}'),           -- a post references it → not
  ('post-media',  pg_temp.u(1) || '/business/' || pg_temp.u(500) || '/bp.jpg',     now() - interval '90 days', '{"size": 100}'),           -- business post (4 segments) → not
  ('post-media',  pg_temp.u(1) || '/business/' || pg_temp.u(500) || '/other.jpg',  now() - interval '90 days', '{"size": 100}'),           -- 4 segments even if nobody references it → not
  ('post-media',  pg_temp.u(1) || '/new.jpg',                                      now() - interval '1 hour',  '{"size": 100}'),           -- younger than 24 h → not
  ('avatars',     pg_temp.u(1) || '/old-avatar.png',                               now() - interval '90 days', '{"size": 100}');           -- another bucket → not
select pg_temp.chk((select count(*) = 4 from public.chat_media_backlog_candidates()), '6: 4 candidates (2 voice + 2 photos), none of the objects that are referenced, young, odd-shaped, business posts or of other buckets');
select pg_temp.chk((select count(*) = 2 and bool_and(objects = 2) from public.chat_media_backlog_preview()), '6: the preview gives one row per bucket with 2 objects each');
select pg_temp.chk((select objects = 2 and total_bytes = 3000 and oldest < now() - interval '59 days' from public.chat_media_backlog_preview() where bucket = 'voice-notes'), '6: the preview counts, sizes and dates the voice notes');
select pg_temp.chk((select count(*) = 0 from public.chat_media_purge_queue), '6: the preview does not write anything');
select pg_temp.chk((select count(*) = 13 from storage.objects where (bucket_id in ('voice-notes', 'post-media', 'avatars')) and (name like pg_temp.u(1) || '%' or name like 'room/' || pg_temp.u(2) || '%')), '6: and nothing is deleted from storage');
select pg_temp.chk(public.chat_media_backlog_enqueue() = 4, '6: the sweep queues the 4 candidates');
select pg_temp.chk(public.chat_media_backlog_enqueue() = 0, '6: running it again queues nothing (idempotent)');
select pg_temp.chk((select count(*) = 4 and count(*) filter (where bucket = 'voice-notes') = 2 from public.chat_media_purge_queue), '6: the queue has the 2 voice notes and the 2 photos');
delete from public.chat_media_purge_queue;

-- ───────── 7. offers: is_active follows status; no new column permission ─────────
insert into public.offers (id, business_id, title, status) values (pg_temp.u(70), pg_temp.u(500), 'o1', 'active'), (pg_temp.u(71), pg_temp.u(500), 'o2', 'paused'),
  (pg_temp.u(72), pg_temp.u(500), 'o3', 'scheduled'), (pg_temp.u(73), pg_temp.u(500), 'o4', 'ended');
select pg_temp.chk((select is_active from public.offers where id = pg_temp.u(70)) and not (select is_active from public.offers where id = pg_temp.u(71))
  and (select is_active from public.offers where id = pg_temp.u(72)) and not (select is_active from public.offers where id = pg_temp.u(73)), '7: insert: active/scheduled → true, paused/ended → false');
insert into public.offers (id, business_id, title, status, is_active) values (pg_temp.u(74), pg_temp.u(500), 'o5', 'paused', true), (pg_temp.u(75), pg_temp.u(500), 'o6', 'active', false);
select pg_temp.chk(not (select is_active from public.offers where id = pg_temp.u(74)) and (select is_active from public.offers where id = pg_temp.u(75)), '7: insert with an incoherent is_active → corrected from the status');
update public.offers set status = 'paused' where id = pg_temp.u(70);
update public.offers set status = 'active' where id = pg_temp.u(71);
select pg_temp.chk(not (select is_active from public.offers where id = pg_temp.u(70)) and (select is_active from public.offers where id = pg_temp.u(71)), '7: pause hides it (false), resume shows it (true)');
update public.offers set status = 'weird' where id = pg_temp.u(72);
select pg_temp.chk((select is_active from public.offers where id = pg_temp.u(72)), '7: an unknown status does not touch is_active');
update public.offers set title = 'renamed', is_active = false where id = pg_temp.u(75);
select pg_temp.chk(not (select is_active from public.offers where id = pg_temp.u(75)), '7: an update that does not set status is left alone (the trigger fires only on status)');
-- the owner, as the app does it
update public.offers set is_active = true, status = 'active' where id = pg_temp.u(70);
select pg_temp.login(1);
update public.offers set status = 'paused' where id = pg_temp.u(70);
select pg_temp.chk((select count(*) = 1 from public.offers where id = pg_temp.u(70) and not is_active and status = 'paused'), '7: the OWNER pausing (only status) hides the offer: is_active false');
update public.offers set status = 'active' where id = pg_temp.u(70);
select pg_temp.chk((select count(*) = 1 from public.offers where id = pg_temp.u(70) and is_active and status = 'active'), '7: the OWNER resuming shows it again');
select pg_temp.err('update public.offers set is_active = false where id = ''' || pg_temp.u(70) || '''', 'permission denied', '7: the owner still cannot write is_active directly');
select pg_temp.chk(not has_column_privilege('authenticated', 'public.offers', 'is_active', 'update') and has_column_privilege('authenticated', 'public.offers', 'status', 'update'), '7: the column permissions are the same (only status)');
reset role;

-- ───────── 8. Stripe: the fake accounts become NULL (the last statement of the migration) ─────────
SQL
echo "$STRIPE_STMT"
cat <<'SQL'
select pg_temp.chk((select stripe_account_id is null from public.businesses where id = pg_temp.u(500)) and (select stripe_account_id is null from public.businesses where id = pg_temp.u(501)), '8: the two acct_STUB_ accounts → NULL');
select pg_temp.chk((select stripe_account_id = 'acct_1RealAccount' from public.businesses where id = pg_temp.u(502)) and (select stripe_account_id is null from public.businesses where id = pg_temp.u(503))
  and (select stripe_account_id = 'acct_STUBBY_not_ours' from public.businesses where id = pg_temp.u(504)), '8: a real account, an empty one and one that only looks similar are left alone');

-- ───────── 9. the rollback puts production back, and 278 can be applied again ─────────
SQL
cat "$R278"
cat <<'SQL'
select pg_temp.chk(pg_get_functiondef('public.purge_expired_messages()'::regprocedure) ~ 'storage cleanup skipped' and pg_get_functiondef('public.purge_expired_messages()'::regprocedure) !~ 'chat_media_purge_queue', '9: rollback: purge_expired_messages is the production body again');
select pg_temp.chk(to_regclass('public.chat_media_purge_queue') is null and to_regprocedure('public.chat_media_purge_retry()') is null and to_regprocedure('public.chat_media_paths_in_use(text,text[])') is null
  and to_regprocedure('public.chat_media_backlog_enqueue()') is null and to_regprocedure('public.chat_message_media_object(text,text)') is null and to_regprocedure('public.offers_sync_is_active()') is null, '9: rollback: the queue and the new functions are gone');
select pg_temp.chk(not exists (select 1 from cron.job where jobname = 'chat-media-purge') and exists (select 1 from cron.job where jobname = 'purge-expired-messages'), '9: rollback: the new cron is gone, the old one stays');
select pg_temp.chk(not exists (select 1 from pg_trigger where tgrelid = 'public.offers'::regclass and tgname = 'offers_sync_is_active'), '9: rollback: the offers trigger is gone');
SQL
cat "$M278"
cat <<'SQL'
select pg_temp.chk(to_regclass('public.chat_media_purge_queue') is not null and exists (select 1 from cron.job where jobname = 'chat-media-purge') and exists (select 1 from pg_trigger where tgname = 'offers_sync_is_active'), '9: 278 applies again after the rollback');

select 'RESULT|' || (case when ok then 'ok' else 'FAIL' end) || '|' || name from t_out order by 1;
rollback;
SQL
} > "$TMP"
OUT=$(docker exec -i "$C" psql -U postgres -d postgres -At < "$TMP" 2>&1)
rm -f "$TMP"
echo "$OUT" | grep -E -B3 -A3 "ERROR|FATAL|psql:" | head -30
echo "$OUT" | grep '^RESULT|' | sed -e 's/^RESULT|ok|/  ✓ /' -e 's/^RESULT|FAIL|/  ✗ /'
N=$(echo "$OUT" | grep -c '^RESULT|ok|'); F=$(echo "$OUT" | grep -c '^RESULT|FAIL|'); E=$(echo "$OUT" | grep -c 'ERROR')
echo "$N ok, $F failed, $E errors"
[ "$F" = 0 ] && [ "$E" = 0 ] && [ "$N" -gt 0 ] && echo "ALL OK" || { echo "FAILED"; exit 1; }
