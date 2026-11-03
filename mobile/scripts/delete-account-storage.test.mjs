// Delete account purges the person's Storage objects BEFORE deleting the user (audit C-3 / B2-1).
// Run from mobile/:  node --test scripts/delete-account-storage.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const readRepo = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const load = (p) => {
  const js = ts.transpileModule(readRepo(p), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const mod = { exports: {} };
  new Function('module', 'exports', js)(mod, mod.exports);
  return mod.exports;
};
const { buildPurgePlan, chunk, listAllObjects, purgePlan, USER_FOLDER_BUCKETS } = load('supabase/functions/_shared/deleteAccountStorage.ts');

const UID = '3ddf4a2e-1111-4222-8333-444455556666';
const OTHER = '99999999-aaaa-4bbb-8ccc-dddddddddddd';
const CONV = 'c0c0c0c0-1111-4222-8333-444455556666';
const ROOM = 'aaaaaaaa-1111-4222-8333-444455556666';

test('plan per bucket from a uid: <uid>/ in the user buckets, <conversation>/<uid>/ in dm-media, never menu-photos', () => {
  const plan = buildPurgePlan(UID, { conversationIds: [CONV, CONV, 'nope'] });
  const folders = plan.folders.map((f) => `${f.bucket}:${f.prefix}`);
  assert.deepEqual(
    folders,
    [...USER_FOLDER_BUCKETS.map((b) => `${b}:${UID}`), `dm-media:${CONV}/${UID}`],
  );
  assert.deepEqual([...USER_FOLDER_BUCKETS], ['avatars', 'covers', 'profile-media', 'post-media', 'match-photos', 'story-media', 'verification-selfies']);
  assert.equal(folders.some((f) => f.startsWith('menu-photos')), false);
});

test('voice notes: only room/<room>/<uid>/<file> of THIS person; other uid, traversal and nested paths are dropped', () => {
  const own = `room/${ROOM}/${UID}/a.m4a`;
  const plan = buildPurgePlan(UID, { voiceRoomPaths: [own, own, `room/${ROOM}/${OTHER}/b.m4a`, `room/${ROOM}/${UID}/../x.m4a`, `x/${ROOM}/${UID}/c.m4a`, `room/${ROOM}/${UID}/d/e.m4a`] });
  assert.deepEqual(plan.objects, [{ bucket: 'voice-notes', path: own }]);
});

test('a malformed uid never becomes a path', () => {
  assert.throws(() => buildPurgePlan('../other'), /invalid_uid/);
  assert.throws(() => buildPurgePlan(''), /invalid_uid/);
});

test('chunking is 100 per remove call', () => {
  assert.deepEqual(chunk(Array.from({ length: 250 }, (_, i) => i)).map((c) => c.length), [100, 100, 50]);
});

function fake(tree, { failRemove = null, missing = [] } = {}) {
  const removed = {};
  return {
    removed,
    storage: {
      from: (bucket) => ({
        list: async (path, { limit, offset }) => (missing.includes(bucket) ? { data: null, error: { message: 'Bucket not found' } } : { data: (tree[bucket]?.[path] ?? []).slice(offset, offset + limit), error: null }),
        remove: async (paths) => {
          if (failRemove === bucket) return { error: { message: 'boom' } };
          (removed[bucket] ??= []).push(...paths);
          return { error: null };
        },
      }),
    },
  };
}

test('listing recurses through folders and pages of 100', async () => {
  const many = Array.from({ length: 150 }, (_, i) => ({ name: `f${i}.png`, id: `i${i}` }));
  const { storage } = fake({ covers: { [UID]: [{ name: 'biz', id: null }], [`${UID}/biz`]: [{ name: 'cover', id: null }], [`${UID}/biz/cover`]: many } });
  const paths = await listAllObjects(storage, 'covers', UID);
  assert.equal(paths.length, 150);
});

test('purge removes what the plan finds (a missing bucket is skipped) and a Storage error makes it throw', async () => {
  const ok = fake({ avatars: { [UID]: [{ name: '1.jpg', id: 'a' }] }, 'dm-media': { [`${CONV}/${UID}`]: [{ name: 'v.m4a', id: 'b' }] } }, { missing: ['story-media'] });
  const count = await purgePlan(ok.storage, buildPurgePlan(UID, { conversationIds: [CONV], voiceRoomPaths: [`room/${ROOM}/${UID}/n.m4a`] }));
  assert.equal(count, 3);
  assert.deepEqual(ok.removed['voice-notes'], [`room/${ROOM}/${UID}/n.m4a`]);
  const bad = fake({ avatars: { [UID]: [{ name: '1.jpg', id: 'a' }] } }, { failRemove: 'avatars' });
  await assert.rejects(() => purgePlan(bad.storage, buildPurgePlan(UID)), /remove avatars/);
});

test('delete-account: the purge runs BEFORE auth.users is deleted and a failure stops everything (storage_purge_failed)', () => {
  const fn = readRepo('supabase/functions/delete-account/index.ts');
  const purge = fn.indexOf('await purgeUserStorage(admin, userId)');
  const del = fn.indexOf('admin.auth.admin.deleteUser(userId)');
  assert.ok(purge > 0 && del > purge, 'purge first, then deleteUser');
  assert.match(fn.slice(purge, del), /return failure\("storage_purge_failed"\)/);
  assert.doesNotMatch(fn, /SET NULL\) anonymise themselves/, 'the stale comment about SET NULL messages is gone');
  assert.match(fn, /ON DELETE CASCADE too: a deleted account's messages disappear for everyone/);
  assert.match(fn, /\.eq\("sender_id", userId\)/);
  assert.match(fn, /\.like\("media_url", "room\/%"\)/);
});

test('the one-off cleanup script is dry-run by default and only deletes with --apply', () => {
  const script = readRepo('supabase/scripts/storage_orphans_cleanup.mjs');
  assert.match(script, /process\.argv\.includes\('--apply'\)/);
  assert.match(script, /SB_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(script, /console\.log\([^)]*(SECRET|KEY)\b[^)]*process\.env/i, 'never prints the key');
});
