// Migration 258 (storage_user_object_paths): the function can read EVERY person's files, so only service_role may run it.
// Run from mobile/:  node --test scripts/migrations-storage-user-objects.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const readRepo = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const migration = readRepo('supabase/migrations/258_storage_user_objects.sql');
const code = migration.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');

test('258 defines the function as security definer with search_path public, storage, returning (bucket_id, name)', () => {
  assert.match(code, /create or replace function public\.storage_user_object_paths\(p_user uuid\)/);
  assert.match(code, /returns table \(bucket_id text, name text\)/);
  assert.match(code, /security definer/);
  assert.match(code, /set search_path = public, storage/);
  assert.match(code, /language sql/);
});

test('258 revokes everything from public, anon and authenticated and grants EXECUTE to service_role only', () => {
  assert.match(code, /revoke all on function public\.storage_user_object_paths\(uuid\) from public, anon, authenticated;/);
  assert.match(code, /grant execute on function public\.storage_user_object_paths\(uuid\) to service_role;/);
  const grants = [...code.matchAll(/grant\s+[^;]*;/gi)].map((m) => m[0]);
  assert.equal(grants.length, 1, 'exactly one grant');
  for (const grant of grants) assert.match(grant, /\sto service_role;$/, 'the only grantee is service_role (never authenticated, anon or public)');
});

test('258 covers the user folder of every person bucket at the right depth and never menu-photos', () => {
  assert.match(code, /o\.bucket_id in \('avatars', 'covers', 'profile-media', 'post-media', 'match-photos', 'story-media', 'verification-selfies'\)\s+and split_part\(o\.name, '\/', 1\) = p_user::text/);
  assert.match(code, /o\.bucket_id = 'dm-media' and split_part\(o\.name, '\/', 2\) = p_user::text/);
  assert.match(code, /o\.bucket_id = 'voice-notes' and split_part\(o\.name, '\/', 1\) = 'room' and split_part\(o\.name, '\/', 3\) = p_user::text/);
  assert.doesNotMatch(code, /menu-photos/, 'the code never touches menu-photos (only comments mention it)');
});

test('258 is idempotent and non-destructive; it ships a check and a rollback', () => {
  assert.doesNotMatch(code, /\b(delete from|truncate|drop table|insert into|update storage)\b/i);
  const check = readRepo('supabase/scripts/258_check.sql');
  assert.match(check, /has_function_privilege/);
  assert.match(check, /ok/);
  assert.doesNotMatch(check.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n'), /\b(insert|update|delete|drop|create|grant|revoke|alter)\b/i, 'the check only reads');
  assert.match(readRepo('supabase/rollbacks/258_storage_user_objects_rollback.sql'), /drop function if exists public\.storage_user_object_paths\(uuid\);/);
});
