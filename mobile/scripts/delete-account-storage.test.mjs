// Delete account purges the person's Storage objects BEFORE deleting the user (audit C-3 / B2-1). The list comes from storage.objects
// (RPC storage_user_object_paths, migration 258), never from the app's tables.
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
const { PERSON_BUCKETS, chunk, planFromRows, purgeUserObjects } = load('supabase/functions/_shared/deleteAccountStorage.ts');

const UID = '3ddf4a2e-1111-4222-8333-444455556666';
const rows = (bucket, n, prefix = UID) => Array.from({ length: n }, (_, i) => ({ bucket_id: bucket, name: `${prefix}/f${i}.jpg` }));

function fake(initial, { cap = 1000, rpcError = null, removeError = null } = {}) {
  const store = new Map(initial.map((r) => [`${r.bucket_id}\0${r.name}`, r]));
  const batches = [];
  let calls = 0;
  return {
    batches,
    left: () => store.size,
    calls: () => calls,
    admin: {
      rpc: async (fn, args) => {
        calls += 1;
        assert.equal(fn, 'storage_user_object_paths');
        assert.deepEqual(args, { p_user: UID });
        return rpcError ? { data: null, error: { message: rpcError } } : { data: [...store.values()].slice(0, cap), error: null };
      },
      storage: {
        from: (bucket) => ({
          remove: async (paths) => {
            if (removeError) return { error: { message: removeError } };
            batches.push({ bucket, size: paths.length });
            for (const p of paths) store.delete(`${bucket}\0${p}`);
            return { error: null };
          },
        }),
      },
    },
  };
}

test('objects in 3 buckets: batches of 100 per bucket, the count, nothing left', async () => {
  const f = fake([...rows('avatars', 250), ...rows('dm-media', 3, `conv/${UID}`), ...rows('voice-notes', 2, `room/r1/${UID}`)]);
  assert.equal(await purgeUserObjects(f.admin, UID), 255);
  assert.deepEqual(f.batches.filter((b) => b.bucket === 'avatars').map((b) => b.size), [100, 100, 50]);
  assert.equal(f.left(), 0);
});

test('an API cap on the answer is handled by asking again', async () => {
  const f = fake([...rows('post-media', 130), ...rows('covers', 130)], { cap: 120 });
  assert.equal(await purgeUserObjects(f.admin, UID), 260);
  assert.equal(f.left(), 0);
  assert.ok(f.calls() > 2);
});

test('menu-photos, unknown buckets, empty names and traversal are never deleted', () => {
  const plan = planFromRows([
    { bucket_id: 'menu-photos', name: `biz/${UID}/x.png` },
    { bucket_id: 'secrets', name: `${UID}/x.png` },
    { bucket_id: 'avatars', name: '' },
    { bucket_id: 'avatars', name: `${UID}/../other/x.png` },
    { bucket_id: 'avatars', name: `${UID}/ok.png` },
  ]);
  assert.deepEqual(plan.objects, [{ bucket: 'avatars', path: `${UID}/ok.png` }]);
  assert.equal(PERSON_BUCKETS.includes('menu-photos'), false);
  assert.deepEqual([...PERSON_BUCKETS].sort(), ['avatars', 'covers', 'dm-media', 'match-photos', 'post-media', 'profile-media', 'story-media', 'verification-selfies', 'voice-notes']);
});

test('an RPC error or a Storage error makes the purge throw; chunking is 100', async () => {
  await assert.rejects(() => purgeUserObjects(fake([], { rpcError: 'no such function' }).admin, UID), /storage_user_object_paths/);
  await assert.rejects(() => purgeUserObjects(fake(rows('avatars', 1), { removeError: 'boom' }).admin, UID), /remove avatars/);
  assert.deepEqual(chunk(Array.from({ length: 250 }, (_, i) => i)).map((c) => c.length), [100, 100, 50]);
});

test('delete-account: the purge runs BEFORE auth.users is deleted, uses the RPC and a failure stops everything (storage_purge_failed)', () => {
  const fn = readRepo('supabase/functions/delete-account/index.ts');
  const purge = fn.indexOf('await purgeUserObjects(admin as unknown as PurgeAdmin, userId)');
  const del = fn.indexOf('admin.auth.admin.deleteUser(userId)');
  assert.ok(purge > 0 && del > purge, 'purge first, then deleteUser');
  assert.match(fn.slice(purge, del), /return failure\("storage_purge_failed"\)/);
  assert.doesNotMatch(fn, /from\("dm_messages"\)|from\("messages"\)\s*\n?\s*\.select\("media_url"\)/, 'no longer derives paths from the app tables');
  assert.doesNotMatch(fn, /SET NULL\) anonymise themselves/, 'the stale comment about SET NULL messages is gone');
  assert.match(fn, /ON DELETE CASCADE too: a deleted account's messages disappear for everyone/);
});

test('the shared module calls the RPC with the uid and nothing else reads the app tables', () => {
  const mod = readRepo('supabase/functions/_shared/deleteAccountStorage.ts');
  const code = mod.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  assert.match(code, /admin\.rpc\("storage_user_object_paths", \{ p_user: userId \}\)/);
  assert.doesNotMatch(code, /dm_messages|media_url/, 'only storage.objects (through the RPC) tells which files are the person\'s');
});

test('the one-off cleanup script is dry-run by default and only deletes with --apply', () => {
  const script = readRepo('supabase/scripts/storage_orphans_cleanup.mjs');
  assert.match(script, /process\.argv\.includes\('--apply'\)/);
  assert.match(script, /SB_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(script, /console\.log\([^)]*(SECRET|KEY)\b[^)]*process\.env/i, 'never prints the key');
});
