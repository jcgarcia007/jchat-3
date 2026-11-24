// Unit tests for services/secureSessionStore.ts (Supabase session in the Keychain / Keystore, in chunks; H-005). Run from mobile/:
//   node --test scripts/secure-session-store.test.mjs

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const dir = mkdtempSync(join(tmpdir(), 'secure-session-'));
const file = join(dir, 'secureSessionStore.mjs');
writeFileSync(file, ts.transpileModule(readFileSync(new URL('../services/secureSessionStore.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText);
const { createSecureSessionStorage, safeKey, CHUNK_SIZE } = await import(pathToFileURL(file).href);

/** In-memory backend; `fail` makes the named operations reject; `maxLen` records the longest value written. */
function memory(initial = {}) {
  const m = new Map(Object.entries(initial));
  const b = { map: m, fail: new Set(), maxLen: 0 };
  const guard = (op) => { if (b.fail.has(op)) throw new Error(`${op} failed`); };
  b.getItem = async (k) => { guard('get'); return m.has(k) ? m.get(k) : null; };
  b.setItem = async (k, v) => { guard('set'); b.maxLen = Math.max(b.maxLen, v.length); m.set(k, v); };
  b.removeItem = async (k) => { guard('remove'); m.delete(k); };
  return b;
}
const KEY = 'sb-abcdefgh-auth-token';
const session = (n) => JSON.stringify({ access_token: 'a'.repeat(n), refresh_token: 'r'.repeat(40), user: { id: 'u', identities: [] } });
const setup = (secure = memory(), legacy = memory()) => ({ secure, legacy, store: createSecureSessionStorage({ secure, legacy }) });

test('a 6 KB session round-trips; no stored piece is longer than the chunk size; nothing lands in AsyncStorage but the marker', async () => {
  const { secure, legacy, store } = setup();
  const value = session(6000);
  await store.setItem(KEY, value);
  assert.equal(await store.getItem(KEY), value);
  assert.ok(secure.maxLen <= CHUNK_SIZE && CHUNK_SIZE <= 1900, `longest piece ${secure.maxLen}`);
  assert.ok(secure.map.size >= 4, 'chunks + meta');
  assert.equal(legacy.map.get(KEY), undefined);
  assert.equal([...legacy.map.keys()].join(), `jchat.secure.${KEY}`);
});

test('a short value uses one chunk; an empty string round-trips', async () => {
  const { secure, store } = setup();
  await store.setItem(KEY, 'x');
  assert.equal(await store.getItem(KEY), 'x');
  assert.equal(secure.map.size, 2);
  await store.setItem(KEY, '');
  assert.equal(await store.getItem(KEY), '');
});

test('overwriting with a shorter value removes the leftover chunks', async () => {
  const { secure, store } = setup();
  await store.setItem(KEY, session(6000));
  await store.setItem(KEY, session(100));
  assert.equal(await store.getItem(KEY), session(100));
  assert.equal(secure.map.size, 2, [...secure.map.keys()].join());
});

test('removeItem deletes chunks, meta, marker and any old AsyncStorage copy', async () => {
  const { secure, legacy, store } = setup();
  await store.setItem(KEY, session(5000));
  legacy.map.set(KEY, 'stale');
  await store.removeItem(KEY);
  assert.equal(secure.map.size, 0);
  assert.equal(legacy.map.size, 0);
  assert.equal(await store.getItem(KEY), null);
});

test('migration: an old AsyncStorage session moves to the secure store, the marker is set and the old copy is deleted', async () => {
  const old = session(4000);
  const { secure, legacy, store } = setup(memory(), memory({ [KEY]: old }));
  assert.equal(await store.getItem(KEY), old);
  assert.equal(legacy.map.has(KEY), false, 'old copy deleted');
  assert.equal(legacy.map.get(`jchat.secure.${KEY}`), '1');
  assert.ok(secure.map.size >= 3);
  assert.equal(await store.getItem(KEY), old, 'second read comes from the secure store');
});

test('migration with a failing secure store keeps the old copy and still answers with it (the user stays signed in)', async () => {
  const old = session(4000);
  const secure = memory(); secure.fail.add('set');
  const { legacy, store } = setup(secure, memory({ [KEY]: old }));
  assert.equal(await store.getItem(KEY), old);
  assert.equal(legacy.map.get(KEY), old);
  assert.equal(legacy.map.has(`jchat.secure.${KEY}`), false);
});

test('setItem with a failing secure store falls back to AsyncStorage (no lost session) and the next read finds it', async () => {
  const secure = memory(); secure.fail.add('set');
  const { legacy, store } = setup(secure);
  await store.setItem(KEY, 'v1');
  assert.equal(legacy.map.get(KEY), 'v1');
  assert.equal(await store.getItem(KEY), 'v1');
});

test('corrupt data → signed out, never a crash: missing chunk, altered length, meta that is not JSON, meta with nonsense', async () => {
  for (const damage of [
    (s) => s.map.delete(`${KEY}.1`),
    (s) => s.map.set(`${KEY}.0`, s.map.get(`${KEY}.0`).slice(1)),
    (s) => s.map.set(`${KEY}.meta`, '{not json'),
    (s) => s.map.set(`${KEY}.meta`, JSON.stringify({ n: 'x', len: -1 })),
    (s) => s.map.set(`${KEY}.meta`, JSON.stringify({ n: 99999, len: 1 })),
  ]) {
    const { secure, store } = setup();
    await store.setItem(KEY, session(5000));
    damage(secure);
    assert.equal(await store.getItem(KEY), null);
  }
});

test('a secure store that throws on read answers null without throwing', async () => {
  const { secure, store } = setup();
  await store.setItem(KEY, 'v');
  secure.fail.add('get');
  assert.equal(await store.getItem(KEY), null);
});

test('a Keychain entry left by a previous install (no marker, no old copy) is wiped and reads as no session', async () => {
  const secure = memory();
  await createSecureSessionStorage({ secure, legacy: memory() }).setItem(KEY, session(3000)); // the previous install
  assert.ok(secure.map.size > 0);
  const fresh = createSecureSessionStorage({ secure, legacy: memory() }); // AsyncStorage is empty after the reinstall
  assert.equal(await fresh.getItem(KEY), null);
  assert.equal(secure.map.size, 0, 'leftover wiped');
});

test('the PKCE code verifier key is handled like the session (own chunks, own marker)', async () => {
  const { store } = setup();
  const V = `${KEY}-code-verifier`;
  await store.setItem(KEY, 'session');
  await store.setItem(V, 'verifier');
  assert.equal(await store.getItem(V), 'verifier');
  await store.removeItem(V);
  assert.equal(await store.getItem(V), null);
  assert.equal(await store.getItem(KEY), 'session');
});

test('safeKey keeps SecureStore-legal keys and replaces the rest', () => {
  assert.equal(safeKey('sb-abc.def_1'), 'sb-abc.def_1');
  assert.equal(safeKey('a b:c/d'), 'a_b_c_d');
});
