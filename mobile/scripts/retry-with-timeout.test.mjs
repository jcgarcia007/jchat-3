// Unit tests for utils/retryWithTimeout.ts (hung requests after a network change). Run from mobile/:
//   node --test scripts/retry-with-timeout.test.mjs

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const dir = mkdtempSync(join(tmpdir(), 'retry-'));
const file = join(dir, 'retryWithTimeout.mjs');
writeFileSync(
  file,
  ts.transpileModule(readFileSync(new URL('../utils/retryWithTimeout.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  }).outputText,
);
const { retryWithTimeout, RequestTimeoutError } = await import(pathToFileURL(file).href);

const never = () => new Promise(() => {}); // a request that hangs forever

test('resolves with the first successful attempt', async () => {
  let calls = 0;
  const value = await retryWithTimeout(async () => { calls += 1; return 'ok'; }, { timeoutMs: 100, attempts: 3, delayMs: 0 });
  assert.equal(value, 'ok');
  assert.equal(calls, 1);
});

test('a hung first attempt is abandoned (and aborted) and the second attempt wins', async () => {
  const signals = [];
  let calls = 0;
  const value = await retryWithTimeout((signal) => {
    signals.push(signal);
    calls += 1;
    return calls === 1 ? never() : Promise.resolve('fresh');
  }, { timeoutMs: 30, attempts: 3, delayMs: 5 });
  assert.equal(value, 'fresh');
  assert.equal(calls, 2);
  assert.equal(signals[0].aborted, true, 'the hung attempt received an abort');
  assert.equal(signals[1].aborted, false);
});

test('a rejected attempt is retried too', async () => {
  let calls = 0;
  const value = await retryWithTimeout(async () => { calls += 1; if (calls < 3) throw new Error('boom'); return calls; }, { timeoutMs: 100, attempts: 3, delayMs: 0 });
  assert.equal(value, 3);
});

test('every attempt hangs: rejects with RequestTimeoutError after all attempts', async () => {
  let calls = 0;
  await assert.rejects(
    retryWithTimeout(() => { calls += 1; return never(); }, { timeoutMs: 20, attempts: 2, delayMs: 0 }),
    (err) => err instanceof RequestTimeoutError,
  );
  assert.equal(calls, 2);
});

test('every attempt rejects: the last error is thrown', async () => {
  let calls = 0;
  await assert.rejects(
    retryWithTimeout(async () => { calls += 1; throw new Error(`fail ${calls}`); }, { timeoutMs: 50, attempts: 2, delayMs: 0 }),
    /fail 2/,
  );
});

test('without timeoutMs it only retries on rejection and every attempt is a new request', async () => {
  let calls = 0;
  const value = await retryWithTimeout(async () => { calls += 1; if (calls < 3) throw new Error('timed out upstream'); return `req${calls}`; }, { attempts: 3, delayMs: 0 });
  assert.equal(value, 'req3');
  assert.equal(calls, 3);
});

test('without timeoutMs a request is not raced against any timer of its own', async () => {
  const value = await retryWithTimeout(() => new Promise((resolve) => setTimeout(() => resolve('slow but fine'), 60)), { attempts: 1, delayMs: 0 });
  assert.equal(value, 'slow but fine');
});
