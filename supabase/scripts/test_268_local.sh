#!/usr/bin/env bash
# Prueba LOCAL de la migración 268 (evidencia de reportes en archivos y DMs). TODO dentro de UNA transacción que termina en ROLLBACK
# (la 258, 262, 265, 266 y 267 se aplican dentro; la 268 dos veces: idempotente). Solo contra el contenedor local.   bash supabase/scripts/test_268_local.sh
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
for m in 258_storage_user_objects 262_review_mode 265_owner_account_close 266_stale_orders_and_email_retry 267_retention_and_report_evidence 268_report_evidence 268_report_evidence; do
  cat "$ROOT/supabase/migrations/$m.sql"
done
cat <<'SQL'
create temp table t_out (ok boolean, name text) on commit drop;
grant all on t_out to public;
create function pg_temp.chk(c boolean, n text) returns void language sql as $$ insert into t_out values (coalesce(c, false), n) $$;
insert into storage.buckets (id, name, public) values ('story-media', 'story-media', true) on conflict (id) do nothing;

-- people (d268...): 01 reported, 02 reporter, 03 other, 04 admin
insert into auth.users (id, instance_id, aud, role, email)
  select ('d2680000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'u268' || n || '@example.com' from generate_series(1, 4) n;
insert into public.users (id, username) select ('d2680000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid, 'u268_' || n from generate_series(1, 4) n on conflict (id) do nothing;
insert into public.admin_roles (user_id, role) values ('d2680000-0000-4000-8000-000000000004', 'admin');
set local session_replication_role = replica;
insert into public.businesses (id, owner_id, name, slug, status, is_active) values ('d2680000-0000-4000-8000-0000000000b1', 'd2680000-0000-4000-8000-000000000003', 'Bar 268', 'bar-268-xx', 'verified', true);
set local session_replication_role = origin;

-- ───────── A. hold by type ─────────
insert into public.reports (id, reporter_id, reported_user_id, content_type, content_id, reason, status, resolution, created_at, resolved_at) values
  ('d2680000-0000-4000-8000-000000000a01', 'd2680000-0000-4000-8000-000000000002', 'd2680000-0000-4000-8000-000000000001', 'post',       'd2680000-0000-4000-8000-000000000c01', 'spam',         'pending',   null, now(), null),
  ('d2680000-0000-4000-8000-000000000a02', 'd2680000-0000-4000-8000-000000000002', 'd2680000-0000-4000-8000-000000000001', 'comment',    'd2680000-0000-4000-8000-000000000c02', 'child_safety', 'resolved',  'escalated_ncmec', now() - interval '500 days', now() - interval '10 days'),
  ('d2680000-0000-4000-8000-000000000a03', 'd2680000-0000-4000-8000-000000000002', 'd2680000-0000-4000-8000-000000000001', 'dm_message',  'd2680000-0000-4000-8000-000000000c03', 'sexual_content','resolved', 'user_suspended', now() - interval '500 days', now() - interval '400 days'),
  ('d2680000-0000-4000-8000-000000000a04', 'd2680000-0000-4000-8000-000000000002', 'd2680000-0000-4000-8000-000000000001', 'story',      'd2680000-0000-4000-8000-000000000c04', 'spam',         'dismissed', 'dismissed', now() - interval '20 days', now() - interval '10 days'),
  ('d2680000-0000-4000-8000-000000000a05', 'd2680000-0000-4000-8000-000000000002', 'd2680000-0000-4000-8000-000000000001', 'message',    'd2680000-0000-4000-8000-000000000c05', 'harassment',   'pending',   null, now(), null),
  ('d2680000-0000-4000-8000-000000000a06', 'd2680000-0000-4000-8000-000000000002', 'd2680000-0000-4000-8000-000000000003', 'user',       null,                                  'harassment',   'pending',   null, now(), null);
select pg_temp.chk(public.content_under_retention_hold('post', 'd2680000-0000-4000-8000-000000000c01'), 'A: post with a pending report → hold');
select pg_temp.chk(public.content_under_retention_hold('comment', 'd2680000-0000-4000-8000-000000000c02'), 'A: comment child_safety escalated 10 d ago → hold');
select pg_temp.chk(not public.content_under_retention_hold('dm_message', 'd2680000-0000-4000-8000-000000000c03'), 'A: dm_message resolved 400 d ago → hold over');
select pg_temp.chk(not public.content_under_retention_hold('story', 'd2680000-0000-4000-8000-000000000c04'), 'A: story with an ordinary closed report → no hold');
select pg_temp.chk(public.content_under_retention_hold('message', 'd2680000-0000-4000-8000-000000000c05') and public.message_under_retention_hold('d2680000-0000-4000-8000-000000000c05'), 'A: message: the wrapper gives the same answer');
select pg_temp.chk(public.content_under_retention_hold('user', 'd2680000-0000-4000-8000-000000000003'), 'A: user (content_id is null) → found by reported_user_id');
select pg_temp.chk(not public.content_under_retention_hold('user', 'd2680000-0000-4000-8000-000000000002') and not public.content_under_retention_hold('post', 'd2680000-0000-4000-8000-000000000c99'), 'A: unreported user / content → no hold');
select pg_temp.chk(not public.content_under_retention_hold('comment', 'd2680000-0000-4000-8000-000000000c01'), 'A: the type must match (a post id is not a comment)');
select pg_temp.chk(public.report_in_hold('resolved', 'child_safety:csam', null, null, now() - interval '100 days'), 'A: reason with a ":detail" suffix counts; no resolved_at → counts from created_at');
select pg_temp.chk(not has_function_privilege('anon', 'public.dm_conversation_has_held_message(uuid)', 'execute') and not has_function_privilege('authenticated', 'public.report_in_hold(text,text,text,timestamptz,timestamptz)', 'execute'), 'A: the new helpers are not callable by clients');
delete from public.reports;

-- ───────── B. columns, bucket, permissions ─────────
select pg_temp.chk((select data_type = 'jsonb' and column_default like '''[]''%' and is_nullable = 'NO' from information_schema.columns where table_schema = 'public' and table_name = 'reports' and column_name = 'evidence'), 'B: reports.evidence jsonb not null default []');
select pg_temp.chk(exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'reports' and column_name = 'evidence_copied_at'), 'B: reports.evidence_copied_at exists');
select pg_temp.chk((select count(*) = 1 and bool_and(not public) from storage.buckets where id = 'report-evidence'), 'B: bucket report-evidence exists once and is private');
select pg_temp.chk((select count(*) = 0 from pg_policies where schemaname = 'storage' and tablename = 'objects' and (coalesce(qual, '') like '%report-evidence%' or coalesce(with_check, '') like '%report-evidence%')), 'B: no storage policy mentions report-evidence (service_role only)');
select pg_temp.chk(not has_function_privilege('authenticated', 'public.user_held_evidence(uuid)', 'execute') and not has_function_privilege('anon', 'public.user_held_evidence(uuid)', 'execute') and has_function_privilege('service_role', 'public.user_held_evidence(uuid)', 'execute'), 'B: user_held_evidence: service_role only');
select pg_temp.chk(not has_function_privilege('authenticated', 'public.evidence_purge_retry()', 'execute') and has_function_privilege('service_role', 'public.evidence_purge_retry()', 'execute'), 'B: evidence_purge_retry: service_role only');
select pg_temp.chk((select relrowsecurity from pg_class where oid = 'public.evidence_purge_queue'::regclass) and not has_table_privilege('authenticated', 'public.evidence_purge_queue', 'select') and has_table_privilege('service_role', 'public.evidence_purge_queue', 'select'), 'B: evidence_purge_queue: RLS on, closed to clients');
select pg_temp.chk((select count(*) = 1 from cron.job where jobname = 'evidence-purge-retry' and schedule = '*/10 * * * *'), 'B: cron evidence-purge-retry scheduled once (*/10 * * * *)');

-- ───────── C. user_held_evidence: one snapshot per type (URL and relative path), existing and missing objects ─────────
insert into storage.objects (bucket_id, name) values
  ('avatars',       'd2680000-0000-4000-8000-000000000001/avatar.png'),
  ('profile-media', 'd2680000-0000-4000-8000-000000000001/p1.jpg'),
  ('profile-media', 'd2680000-0000-4000-8000-000000000001/p2.jpg'),
  ('post-media',    'd2680000-0000-4000-8000-000000000001/business/b/x.png'),
  ('story-media',   'd2680000-0000-4000-8000-000000000001/s1.jpg'),
  ('dm-media',      'd2680000-0000-4000-8000-0000000000d1/d2680000-0000-4000-8000-000000000001/photo.jpg'),
  ('dm-media',      'd2680000-0000-4000-8000-0000000000d1/d2680000-0000-4000-8000-000000000001/voice.m4a'),
  ('voice-notes',   'room/d2680000-0000-4000-8000-0000000000e1/d2680000-0000-4000-8000-000000000001/vn.m4a'),
  ('match-photos',  'd2680000-0000-4000-8000-000000000001/match.jpg'),
  ('profile-media', 'd2680000-0000-4000-8000-000000000003/other.jpg');
insert into public.reports (id, reporter_id, reported_user_id, content_type, content_id, reason, status, snapshot) values
  ('d2680000-0000-4000-8000-000000000b01', 'd2680000-0000-4000-8000-000000000002', 'd2680000-0000-4000-8000-000000000001', 'user', null, 'harassment', 'pending',
    '{"avatar_url":"https://abcd.supabase.co/storage/v1/object/public/avatars/d2680000-0000-4000-8000-000000000001/avatar.png?t=1"}'),
  ('d2680000-0000-4000-8000-000000000b02', 'd2680000-0000-4000-8000-000000000002', 'd2680000-0000-4000-8000-000000000001', 'post', 'd2680000-0000-4000-8000-000000000c01', 'child_safety', 'pending',
    '{"caption":"x","media_urls":["https://abcd.supabase.co/storage/v1/object/public/profile-media/d2680000-0000-4000-8000-000000000001/p1.jpg","https://abcd.supabase.co/storage/v1/object/public/profile-media/d2680000-0000-4000-8000-000000000001/p2.jpg","https://abcd.supabase.co/storage/v1/object/public/profile-media/d2680000-0000-4000-8000-000000000001/gone.jpg","https://abcd.supabase.co/storage/v1/object/public/post-media/d2680000-0000-4000-8000-000000000001/business/b/x.png"]}'),
  ('d2680000-0000-4000-8000-000000000b03', 'd2680000-0000-4000-8000-000000000002', 'd2680000-0000-4000-8000-000000000001', 'story', 'd2680000-0000-4000-8000-000000000c04', 'sexual_content', 'pending',
    '{"media_url":"https://abcd.supabase.co/storage/v1/object/public/story-media/d2680000-0000-4000-8000-000000000001/s1.jpg"}'),
  ('d2680000-0000-4000-8000-000000000b04', 'd2680000-0000-4000-8000-000000000002', 'd2680000-0000-4000-8000-000000000001', 'dm_message', 'd2680000-0000-4000-8000-000000000c03', 'child_safety', 'pending',
    '{"body":"x","media_url":"d2680000-0000-4000-8000-0000000000d1/d2680000-0000-4000-8000-000000000001/photo.jpg","voice_url":"d2680000-0000-4000-8000-0000000000d1/d2680000-0000-4000-8000-000000000001/voice.m4a"}'),
  ('d2680000-0000-4000-8000-000000000b05', 'd2680000-0000-4000-8000-000000000002', 'd2680000-0000-4000-8000-000000000001', 'message', 'd2680000-0000-4000-8000-000000000c05', 'harassment', 'pending',
    '{"body":"x","media_url":"room/d2680000-0000-4000-8000-0000000000e1/d2680000-0000-4000-8000-000000000001/vn.m4a"}'),
  ('d2680000-0000-4000-8000-000000000b06', 'd2680000-0000-4000-8000-000000000002', 'd2680000-0000-4000-8000-000000000001', 'message', 'd2680000-0000-4000-8000-000000000c06', 'harassment', 'pending',
    '{"body":"photo in a room","media_url":"https://abcd.supabase.co/storage/v1/object/public/post-media/d2680000-0000-4000-8000-000000000001/business/b/x.png"}'),
  -- not in hold (closed ordinary) → ignored
  ('d2680000-0000-4000-8000-000000000b07', 'd2680000-0000-4000-8000-000000000002', 'd2680000-0000-4000-8000-000000000001', 'story', 'd2680000-0000-4000-8000-000000000c07', 'spam', 'dismissed',
    '{"media_url":"https://abcd.supabase.co/storage/v1/object/public/story-media/d2680000-0000-4000-8000-000000000001/s1.jpg"}'),
  -- tries to point at somebody else's file, at a forbidden bucket and at an external URL → ignored
  ('d2680000-0000-4000-8000-000000000b08', 'd2680000-0000-4000-8000-000000000002', 'd2680000-0000-4000-8000-000000000001', 'post', 'd2680000-0000-4000-8000-000000000c08', 'harassment', 'pending',
    '{"media_urls":["https://abcd.supabase.co/storage/v1/object/public/profile-media/d2680000-0000-4000-8000-000000000003/other.jpg","https://abcd.supabase.co/storage/v1/object/authenticated/match-photos/d2680000-0000-4000-8000-000000000001/match.jpg","https://evil.example.com/a/b/c.jpg"],"caption":"y"}'),
  ('d2680000-0000-4000-8000-000000000b09', 'd2680000-0000-4000-8000-000000000002', 'd2680000-0000-4000-8000-000000000003', 'post', 'd2680000-0000-4000-8000-000000000c09', 'harassment', 'pending',
    '{"media_urls":["https://abcd.supabase.co/storage/v1/object/public/profile-media/d2680000-0000-4000-8000-000000000003/other.jpg"]}');
create temp table t_ev as select * from public.user_held_evidence('d2680000-0000-4000-8000-000000000001');
select pg_temp.chk((select count(*) = 1 from t_ev where report_id = 'd2680000-0000-4000-8000-000000000b01' and content_type = 'user' and src_bucket = 'avatars' and src_path = 'd2680000-0000-4000-8000-000000000001/avatar.png'), 'C: user → avatar from a public URL (query string dropped)');
select pg_temp.chk((select count(*) = 3 from t_ev where report_id = 'd2680000-0000-4000-8000-000000000b02'), 'C: post → 3 files (two in profile-media, one in post-media); the missing object is omitted');
select pg_temp.chk((select count(*) = 1 from t_ev where report_id = 'd2680000-0000-4000-8000-000000000b02' and src_bucket = 'post-media' and src_path = 'd2680000-0000-4000-8000-000000000001/business/b/x.png'), 'C: post → the bucket comes from the URL (post-media)');
select pg_temp.chk((select count(*) = 0 from t_ev where src_path like '%gone.jpg'), 'C: an object that is not in storage.objects is omitted');
select pg_temp.chk((select count(*) = 1 from t_ev where report_id = 'd2680000-0000-4000-8000-000000000b03' and src_bucket = 'story-media'), 'C: story → story-media');
select pg_temp.chk((select count(*) = 2 from t_ev where report_id = 'd2680000-0000-4000-8000-000000000b04' and src_bucket = 'dm-media'), 'C: dm_message → media_url and voice_url (relative paths) both in dm-media');
select pg_temp.chk((select count(*) = 1 from t_ev where report_id = 'd2680000-0000-4000-8000-000000000b05' and src_bucket = 'voice-notes' and src_path like 'room/%'), 'C: message with a room/ path → voice-notes');
select pg_temp.chk((select count(*) = 1 from t_ev where report_id = 'd2680000-0000-4000-8000-000000000b06' and src_bucket = 'post-media'), 'C: message with a post-media URL → post-media');
select pg_temp.chk((select count(*) = 0 from t_ev where report_id = 'd2680000-0000-4000-8000-000000000b07'), 'C: a report not in hold gives nothing');
select pg_temp.chk((select count(*) = 0 from t_ev where report_id = 'd2680000-0000-4000-8000-000000000b08'), 'C: somebody else''s file, match-photos and an external URL are ignored');
select pg_temp.chk((select count(*) = 0 from t_ev where report_id = 'd2680000-0000-4000-8000-000000000b09'), 'C: a report of another person gives nothing for this one');
select pg_temp.chk((select count(*) = 1 from public.user_held_evidence('d2680000-0000-4000-8000-000000000003')), 'C: the other person gets exactly their own file');
select pg_temp.chk((select count(*) = 0 from public.user_held_evidence('d2680000-0000-4000-8000-000000000002')), 'C: a person without reports gets nothing');
-- already copied → not returned again
update public.reports set evidence = '[{"bucket":"report-evidence","path":"d2680000-0000-4000-8000-000000000b01/avatars/avatar.png","src_bucket":"avatars","src_path":"d2680000-0000-4000-8000-000000000001/avatar.png","copied_at":"2026-11-08T00:00:00Z"}]'::jsonb
  where id = 'd2680000-0000-4000-8000-000000000b01';
select pg_temp.chk((select count(*) = 0 from public.user_held_evidence('d2680000-0000-4000-8000-000000000001') where report_id = 'd2680000-0000-4000-8000-000000000b01'), 'C: a file already in reports.evidence is not returned again');
select pg_temp.chk((select count(*) = 8 from public.user_held_evidence('d2680000-0000-4000-8000-000000000001')), 'C: the rest is still returned (3 + 1 + 2 + 1 + 1 = 8)');

-- ───────── D. ephemeral purges respect the hold ─────────
-- two ephemeral conversations of the venue: d1 has a dm_message in hold, d2 does not
insert into public.dm_conversations (id, user_a, user_b, ephemeral_business_id, exit_hidden_at_a, exit_hidden_at_b) values
  ('d2680000-0000-4000-8000-0000000000d1', 'd2680000-0000-4000-8000-000000000001', 'd2680000-0000-4000-8000-000000000002', 'd2680000-0000-4000-8000-0000000000b1', now(), now()),
  ('d2680000-0000-4000-8000-0000000000d2', 'd2680000-0000-4000-8000-000000000001', 'd2680000-0000-4000-8000-000000000003', 'd2680000-0000-4000-8000-0000000000b1', now(), now());
insert into public.dm_messages (id, conversation_id, sender_id, body) values
  ('d2680000-0000-4000-8000-000000000c03', 'd2680000-0000-4000-8000-0000000000d1', 'd2680000-0000-4000-8000-000000000001', 'held'),
  ('d2680000-0000-4000-8000-000000000f02', 'd2680000-0000-4000-8000-0000000000d2', 'd2680000-0000-4000-8000-000000000001', 'free');
select pg_temp.chk(public.dm_conversation_has_held_message('d2680000-0000-4000-8000-0000000000d1') and not public.dm_conversation_has_held_message('d2680000-0000-4000-8000-0000000000d2'), 'D: dm_conversation_has_held_message tells the two apart');
insert into public.venue_exits (user_id, business_id, purge_at) values ('d2680000-0000-4000-8000-000000000001', 'd2680000-0000-4000-8000-0000000000b1', now() - interval '1 minute');
select public.venue_exits_purge();
select pg_temp.chk(exists (select 1 from public.dm_conversations where id = 'd2680000-0000-4000-8000-0000000000d1') and exists (select 1 from public.dm_messages where id = 'd2680000-0000-4000-8000-000000000c03'), 'D: venue_exits_purge keeps the conversation with a message in hold (and the message)');
select pg_temp.chk(not exists (select 1 from public.dm_conversations where id = 'd2680000-0000-4000-8000-0000000000d2') and not exists (select 1 from public.dm_messages where id = 'd2680000-0000-4000-8000-000000000f02'), 'D: venue_exits_purge deletes the other conversation and its messages');
select pg_temp.chk(not exists (select 1 from public.venue_exits where user_id = 'd2680000-0000-4000-8000-000000000001'), 'D: the venue_exits row is consumed anyway');
-- match_wipe_user_venue (conversation without a match)
insert into public.dm_conversations (id, user_a, user_b, ephemeral_business_id) values
  ('d2680000-0000-4000-8000-0000000000d3', 'd2680000-0000-4000-8000-000000000002', 'd2680000-0000-4000-8000-000000000003', 'd2680000-0000-4000-8000-0000000000b1'),
  ('d2680000-0000-4000-8000-0000000000d4', 'd2680000-0000-4000-8000-000000000002', 'd2680000-0000-4000-8000-000000000004', 'd2680000-0000-4000-8000-0000000000b1');
insert into public.dm_messages (id, conversation_id, sender_id, body) values
  ('d2680000-0000-4000-8000-000000000f03', 'd2680000-0000-4000-8000-0000000000d3', 'd2680000-0000-4000-8000-000000000003', 'held 2'),
  ('d2680000-0000-4000-8000-000000000f04', 'd2680000-0000-4000-8000-0000000000d4', 'd2680000-0000-4000-8000-000000000004', 'free 2');
insert into public.reports (id, reporter_id, reported_user_id, content_type, content_id, reason, status, snapshot) values
  ('d2680000-0000-4000-8000-000000000b10', 'd2680000-0000-4000-8000-000000000002', 'd2680000-0000-4000-8000-000000000003', 'dm_message', 'd2680000-0000-4000-8000-000000000f03', 'harassment', 'pending', '{"body":"held 2"}');
select public.match_wipe_user_venue('d2680000-0000-4000-8000-000000000002', 'd2680000-0000-4000-8000-0000000000b1');
select pg_temp.chk(exists (select 1 from public.dm_conversations where id = 'd2680000-0000-4000-8000-0000000000d3'), 'D: match_wipe_user_venue keeps the conversation with a held message');
select pg_temp.chk(not exists (select 1 from public.dm_conversations where id = 'd2680000-0000-4000-8000-0000000000d4'), 'D: match_wipe_user_venue deletes the one without hold');
-- match_remove_pair (with a match)
insert into public.dm_conversations (id, user_a, user_b, ephemeral_business_id) values
  ('d2680000-0000-4000-8000-0000000000d5', 'd2680000-0000-4000-8000-000000000001', 'd2680000-0000-4000-8000-000000000004', 'd2680000-0000-4000-8000-0000000000b1'),
  ('d2680000-0000-4000-8000-0000000000d6', 'd2680000-0000-4000-8000-000000000002', 'd2680000-0000-4000-8000-000000000004', 'd2680000-0000-4000-8000-0000000000b1');
insert into public.matches (business_id, user_a, user_b, conversation_id) values
  ('d2680000-0000-4000-8000-0000000000b1', 'd2680000-0000-4000-8000-000000000001', 'd2680000-0000-4000-8000-000000000004', 'd2680000-0000-4000-8000-0000000000d5'),
  ('d2680000-0000-4000-8000-0000000000b1', 'd2680000-0000-4000-8000-000000000002', 'd2680000-0000-4000-8000-000000000004', 'd2680000-0000-4000-8000-0000000000d6');
insert into public.dm_messages (id, conversation_id, sender_id, body) values
  ('d2680000-0000-4000-8000-000000000f05', 'd2680000-0000-4000-8000-0000000000d5', 'd2680000-0000-4000-8000-000000000001', 'held 3');
insert into public.reports (id, reporter_id, reported_user_id, content_type, content_id, reason, status, snapshot) values
  ('d2680000-0000-4000-8000-000000000b11', 'd2680000-0000-4000-8000-000000000004', 'd2680000-0000-4000-8000-000000000001', 'dm_message', 'd2680000-0000-4000-8000-000000000f05', 'child_safety', 'pending', '{"body":"held 3"}');
select public.match_remove_pair('d2680000-0000-4000-8000-0000000000b1', 'd2680000-0000-4000-8000-000000000001', 'd2680000-0000-4000-8000-000000000004');
select public.match_remove_pair('d2680000-0000-4000-8000-0000000000b1', 'd2680000-0000-4000-8000-000000000002', 'd2680000-0000-4000-8000-000000000004');
select pg_temp.chk(exists (select 1 from public.dm_conversations where id = 'd2680000-0000-4000-8000-0000000000d5') and not exists (select 1 from public.matches where conversation_id = 'd2680000-0000-4000-8000-0000000000d5'), 'D: match_remove_pair removes the match but keeps the conversation with a held message');
select pg_temp.chk(not exists (select 1 from public.dm_conversations where id = 'd2680000-0000-4000-8000-0000000000d6'), 'D: match_remove_pair deletes the conversation of a pair without hold');
-- once the hold ends, a later purge deletes it
update public.reports set status = 'dismissed', resolution = 'dismissed', resolved_at = now() where id = 'd2680000-0000-4000-8000-000000000b10';
select pg_temp.chk(not public.dm_conversation_has_held_message('d2680000-0000-4000-8000-0000000000d3'), 'D: after the report is closed (ordinary reason) the conversation has no hold');
select public.match_wipe_user_venue('d2680000-0000-4000-8000-000000000002', 'd2680000-0000-4000-8000-0000000000b1');
select pg_temp.chk(not exists (select 1 from public.dm_conversations where id = 'd2680000-0000-4000-8000-0000000000d3'), 'D: a later purge deletes the conversation once the hold is over');
delete from public.reports;

-- ───────── E. retention_purge enqueues the copies and deletes the report ─────────
insert into public.reports (id, content_type, reason, status, resolution, resolved_at, evidence) values
  ('d2680000-0000-4000-8000-000000000e01', 'user', 'spam', 'dismissed', 'dismissed', now() - interval '400 days',
    '[{"bucket":"report-evidence","path":"d2680000-0000-4000-8000-000000000e01/avatars/a.png","src_bucket":"avatars","src_path":"u/a.png"},{"bucket":"report-evidence","path":"d2680000-0000-4000-8000-000000000e01/dm-media/b.jpg","src_bucket":"dm-media","src_path":"c/u/b.jpg"}]'),
  ('d2680000-0000-4000-8000-000000000e02', 'user', 'spam', 'dismissed', 'dismissed', now() - interval '100 days',
    '[{"bucket":"report-evidence","path":"d2680000-0000-4000-8000-000000000e02/avatars/keep.png","src_bucket":"avatars","src_path":"u/keep.png"}]'),
  ('d2680000-0000-4000-8000-000000000e03', 'user', 'child_safety', 'resolved', 'escalated_ncmec', now() - interval '800 days',
    '[{"bucket":"report-evidence","path":"d2680000-0000-4000-8000-000000000e03/dm-media/c.jpg","src_bucket":"dm-media","src_path":"c/u/c.jpg"}]'),
  ('d2680000-0000-4000-8000-000000000e04', 'user', 'spam', 'pending', null, null,
    '[{"bucket":"report-evidence","path":"d2680000-0000-4000-8000-000000000e04/avatars/pending.png","src_bucket":"avatars","src_path":"u/pending.png"}]'),
  ('d2680000-0000-4000-8000-000000000e05', 'user', 'spam', 'dismissed', 'dismissed', now() - interval '400 days', '[]');
update public.reports set created_at = now() - interval '900 days' where id::text like 'd2680000-0000-4000-8000-000000000e0%';
create temp table t_rp as select public.retention_purge() as r;
select pg_temp.chk((select (r->>'reports')::int = 3 from t_rp), 'E: retention_purge deletes the 3 reports out of term');
select pg_temp.chk((select count(*) = 3 from public.evidence_purge_queue) and exists (select 1 from public.evidence_purge_queue where bucket = 'report-evidence' and path = 'd2680000-0000-4000-8000-000000000e03/dm-media/c.jpg'), 'E: their 3 copies are queued (bucket report-evidence + path)');
select pg_temp.chk((select count(*) = 0 from public.evidence_purge_queue where path like '%keep.png' or path like '%pending.png'), 'E: the copies of reports still inside the term or pending are NOT queued');
select pg_temp.chk((select count(*) = 2 from public.reports where id in ('d2680000-0000-4000-8000-000000000e02', 'd2680000-0000-4000-8000-000000000e04')), 'E: the in-term and the pending report stay');
select pg_temp.chk(public.retention_purge() = '{}'::jsonb and (select count(*) = 3 from public.evidence_purge_queue), 'E: a second pass does nothing and does not duplicate the queue');

-- ───────── F. queue with backoff ─────────
select pg_temp.chk(public.evidence_purge_retry() = 0, 'F: without the vault secret → 0 and nothing touched');
select pg_temp.chk((select count(*) = 3 and bool_and(attempts = 0) from public.evidence_purge_queue), 'F: no attempt counted without the secret');
select vault.create_secret('test-secret-268', 'push_webhook_secret', 'test');
select pg_temp.chk(public.evidence_purge_retry() = 3, 'F: with the secret → picks the 3 (one call)');
select pg_temp.chk((select count(*) = 3 and bool_and(attempts = 1 and last_attempt_at is not null) from public.evidence_purge_queue), 'F: attempts = 1 and last_attempt_at set');
select pg_temp.chk(public.evidence_purge_retry() = 0, 'F: immediately again → 0 (backoff 10 min × 2^1)');
update public.evidence_purge_queue set last_attempt_at = now() - interval '21 minutes';
select pg_temp.chk(public.evidence_purge_retry() = 3, 'F: after 21 min (backoff 20) → picked again');
update public.evidence_purge_queue set last_attempt_at = now() - interval '19 minutes' where attempts = 2;
select pg_temp.chk(public.evidence_purge_retry() = 0, 'F: attempts = 2 and 19 min ago → still waiting (backoff 40)');
update public.evidence_purge_queue set attempts = 5, last_attempt_at = now() - interval '7 hours';
select pg_temp.chk(public.evidence_purge_retry() = 3, 'F: the 6th attempt (cap 6 h) is made');
select pg_temp.chk((select bool_and(attempts = 6) from public.evidence_purge_queue), 'F: attempts = 6 after it');
update public.evidence_purge_queue set last_attempt_at = now() - interval '11 minutes';
select pg_temp.chk(public.evidence_purge_retry() = 0, 'F: attempts = 6 → never picked again');
select pg_temp.chk((select count(*) = 3 from public.security_logs where action = 'evidence_purge_gave_up' and detail = 'report-evidence'), 'F: gave up → one security_logs row per entry (bucket only in detail)');
select public.evidence_purge_retry();
select pg_temp.chk((select count(*) = 3 from public.security_logs where action = 'evidence_purge_gave_up'), 'F: the gave-up log is written once');
select pg_temp.chk((select count(*) = 3 from public.evidence_purge_queue), 'F: the rows stay in the queue (terminal)');
insert into public.evidence_purge_queue (bucket, path) select 'report-evidence', 'bulk/' || g from generate_series(1, 60) g;
select pg_temp.chk(public.evidence_purge_retry() = 50, 'F: 50 per batch');
select pg_temp.chk(public.evidence_purge_retry() = 10, 'F: the rest on the next pass');

select pg_temp.chk((select count(*) = 1 from pg_trigger where tgname = 'trg_auth_user_ban_check') and (select count(*) = 1 from cron.job where jobname = 'retention-purge'), 'G: the 267 triggers and cron survive; 268 applied twice without error');

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
