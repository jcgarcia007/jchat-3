// Unit tests for services/fetchWithTimeout.ts (supabase-js global.fetch: every request ends). Run from mobile/:
//   node --test scripts/fetch-with-timeout.test.mjs

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const dir = mkdtempSync(join(tmpdir(), 'fetch-timeout-'));
const file = join(dir, 'fetchWithTimeout.mjs');
writeFileSync(
  file,
  ts.transpileModule(readFileSync(new URL('../services/fetchWithTimeout.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  }).outputText,
);
const { createFetchWithTimeout, DEFAULT_FETCH_TIMEOUT_MS, STORAGE_FETCH_TIMEOUT_MS } = await import(pathToFileURL(file).href);

/** A fake fetch that answers after `afterMs` (never if null) and rejects like fetch does when its signal aborts. */
function fakeFetch(afterMs, record = {}) {
  return (input, init) =>
    new Promise((resolve, reject) => {
      record.signal = init?.signal;
      record.calls = (record.calls ?? 0) + 1;
      if (init?.signal?.aborted) { const e = new Error('aborted'); e.name = 'AbortError'; reject(e); return; } // like fetch
      const timer = afterMs === null ? null : setTimeout(() => resolve({ ok: true, url: String(input) }), afterMs);
      init?.signal?.addEventListener('abort', () => {
        if (timer) clearTimeout(timer);
        const err = new Error('aborted');
        err.name = 'AbortError';
        reject(err);
      });
    });
}

test('the defaults are 20 s and 120 s', () => {
  assert.equal(DEFAULT_FETCH_TIMEOUT_MS, 20_000);
  assert.equal(STORAGE_FETCH_TIMEOUT_MS, 120_000);
});

test('a request that answers in time resolves untouched', async () => {
  const f = createFetchWithTimeout({ defaultMs: 100, fetchImpl: fakeFetch(5) });
  const res = await f('https://x.supabase.co/rest/v1/messages');
  assert.equal(res.ok, true);
});

test('a hung request rejects with TimeoutError after the timeout and is aborted', async () => {
  const record = {};
  const f = createFetchWithTimeout({ defaultMs: 30, fetchImpl: fakeFetch(null, record) });
  const started = Date.now();
  await assert.rejects(f('https://x.supabase.co/rest/v1/messages'), (err) => err.name === 'TimeoutError');
  assert.ok(Date.now() - started >= 25, 'it waited for the timeout');
  assert.equal(record.signal.aborted, true, 'the underlying request got an abort');
});

test('it rejects with TimeoutError even if the platform never settles the aborted fetch', async () => {
  const stuck = () => new Promise(() => {}); // ignores the signal and never settles
  const f = createFetchWithTimeout({ defaultMs: 20, fetchImpl: stuck });
  await assert.rejects(f('https://x.supabase.co/auth/v1/health'), (err) => err.name === 'TimeoutError');
});

test('an external signal that is already aborted aborts the request (not a TimeoutError)', async () => {
  const external = new AbortController();
  external.abort();
  const f = createFetchWithTimeout({ defaultMs: 500, fetchImpl: fakeFetch(null) });
  await assert.rejects(f('https://x.supabase.co/rest/v1/messages', { signal: external.signal }), (err) => err.name === 'AbortError');
});

test('an external signal aborted while the request is in flight aborts it', async () => {
  const external = new AbortController();
  const f = createFetchWithTimeout({ defaultMs: 500, fetchImpl: fakeFetch(null) });
  const pending = f('https://x.supabase.co/rest/v1/messages', { signal: external.signal });
  setTimeout(() => external.abort(), 10);
  await assert.rejects(pending, (err) => err.name === 'AbortError');
});

test('storage object URLs use the long timeout', async () => {
  // Answers after 80 ms: too slow for the short default (30 ms) but fine for the storage timeout (500 ms).
  const f = createFetchWithTimeout({ defaultMs: 30, storageMs: 500, fetchImpl: fakeFetch(80) });
  await assert.rejects(f('https://x.supabase.co/rest/v1/messages'), (err) => err.name === 'TimeoutError');
  const res = await f('https://x.supabase.co/storage/v1/object/voice-notes/room/a.m4a');
  assert.equal(res.ok, true);
});

test('the timer is always cleared (no pending timers keep the process alive) and init is passed through', async () => {
  let seenInit;
  const f = createFetchWithTimeout({ defaultMs: 60_000, fetchImpl: (input, init) => { seenInit = init; return Promise.resolve({ ok: true }); } });
  await f('https://x.supabase.co/rest/v1/messages', { method: 'POST', headers: { a: 'b' } });
  assert.equal(seenInit.method, 'POST');
  assert.deepEqual(seenInit.headers, { a: 'b' });
  assert.ok(seenInit.signal instanceof AbortSignal);
  // If the 60 s timer were still pending, node --test would not exit promptly; reaching here quickly is the check.
});
