// Unit tests for polyfills/installWebCrypto.ts (WebCrypto pieces Hermes lacks, needed by Supabase's PKCE). Run from mobile/:
//   node --test scripts/webcrypto-polyfill.test.mjs
// The installer is TypeScript: it is transpiled with the repo's own `typescript` into a temp dir and imported. On device
// the backend is expo-crypto; here it is Node's crypto. The last tests run the REAL @supabase/auth-js helpers with the
// globals removed (what Hermes looks like) to prove the challenge goes from `plain` to `s256`.

import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const dir = mkdtempSync(join(tmpdir(), 'webcrypto-'));
const source = readFileSync(new URL('../polyfills/installWebCrypto.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
writeFileSync(join(dir, 'installWebCrypto.mjs'), outputText);
const { installWebCrypto } = await import(pathToFileURL(join(dir, 'installWebCrypto.mjs')).href);

// Stands in for expo-crypto's getRandomBytes / digest.
const backend = {
  getRandomBytes: (byteCount) => new Uint8Array(randomBytes(byteCount)),
  digest: async (algorithm, data) => {
    const bytes = ArrayBuffer.isView(data) ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : new Uint8Array(data);
    const out = createHash(algorithm.replace('-', '').toLowerCase()).update(bytes).digest();
    return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
  },
};

const hex = (buffer) => Buffer.from(buffer).toString('hex');
const install = () => {
  const target = {};
  const report = installWebCrypto(target, backend);
  return { target, report };
};

test('installs everything on an empty global (what Hermes looks like)', () => {
  const { target, report } = install();
  assert.deepEqual(report, { crypto: true, getRandomValues: true, subtle: true, textEncoder: true });
  assert.equal(typeof target.crypto.getRandomValues, 'function');
  assert.equal(typeof target.crypto.subtle.digest, 'function');
  assert.equal(typeof target.TextEncoder, 'function');
});

test('never replaces what the platform already has', () => {
  const getRandomValues = () => 'native';
  const subtle = { digest: () => 'native' };
  class NativeEncoder {}
  const target = { crypto: { getRandomValues, subtle }, TextEncoder: NativeEncoder };
  const report = installWebCrypto(target, backend);
  assert.deepEqual(report, { crypto: false, getRandomValues: false, subtle: false, textEncoder: false });
  assert.equal(target.crypto.getRandomValues, getRandomValues);
  assert.equal(target.crypto.subtle, subtle);
  assert.equal(target.TextEncoder, NativeEncoder);
});

test('fills only the missing piece of a partial crypto', () => {
  const getRandomValues = () => 'native';
  const target = { crypto: { getRandomValues }, TextEncoder: class {} };
  const report = installWebCrypto(target, backend);
  assert.deepEqual(report, { crypto: false, getRandomValues: false, subtle: true, textEncoder: false });
  assert.equal(target.crypto.getRandomValues, getRandomValues);
});

test('a sealed crypto is left alone and does not throw', () => {
  const sealed = Object.freeze({});
  const target = { crypto: sealed, TextEncoder: class {} };
  const report = installWebCrypto(target, backend);
  assert.deepEqual(report, { crypto: false, getRandomValues: false, subtle: false, textEncoder: false });
  assert.equal(target.crypto, sealed);
});

test('getRandomValues: fills the whole view in place and returns the same array', () => {
  const { target } = install();
  const array = new Uint32Array(56);
  const returned = target.crypto.getRandomValues(array);
  assert.equal(returned, array);
  assert.ok(array.some((value) => value !== 0), 'all zero: not filled');
});

test('getRandomValues: respects byteOffset / length of a subarray', () => {
  const { target } = install();
  const whole = new Uint8Array(32);
  target.crypto.getRandomValues(whole.subarray(8, 24));
  assert.ok(whole.subarray(0, 8).every((value) => value === 0), 'wrote before the view');
  assert.ok(whole.subarray(24).every((value) => value === 0), 'wrote after the view');
  assert.ok(whole.subarray(8, 24).some((value) => value !== 0), 'view not filled');
});

test('getRandomValues: spec errors (non-integer arrays, DataView, > 65 536 bytes)', () => {
  const { target } = install();
  assert.throws(() => target.crypto.getRandomValues(new Float64Array(4)), { name: 'TypeMismatchError' });
  assert.throws(() => target.crypto.getRandomValues(new Float32Array(4)), { name: 'TypeMismatchError' });
  assert.throws(() => target.crypto.getRandomValues(new DataView(new ArrayBuffer(4))), { name: 'TypeMismatchError' });
  assert.throws(() => target.crypto.getRandomValues(null), { name: 'TypeMismatchError' });
  assert.throws(() => target.crypto.getRandomValues(new Uint8Array(65537)), { name: 'QuotaExceededError' });
  assert.doesNotThrow(() => target.crypto.getRandomValues(new Uint8Array(65536)));
});

test('subtle.digest: SHA-256 / 384 / 512 match Node', async () => {
  const { target } = install();
  const data = new TextEncoder().encode('abc');
  assert.equal(hex(await target.crypto.subtle.digest('SHA-256', data)), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  for (const [name, node] of [['SHA-384', 'sha384'], ['SHA-512', 'sha512']]) {
    assert.equal(hex(await target.crypto.subtle.digest(name, data)), createHash(node).update(data).digest('hex'), name);
  }
});

test('subtle.digest: accepts { name } objects and any case', async () => {
  const { target } = install();
  const data = new TextEncoder().encode('abc');
  assert.equal(hex(await target.crypto.subtle.digest({ name: 'sha-256' }, data)), hex(await target.crypto.subtle.digest('SHA-256', data)));
});

test('subtle.digest: rejects algorithms it does not provide', async () => {
  const { target } = install();
  const data = new Uint8Array(1);
  await assert.rejects(target.crypto.subtle.digest('SHA-1', data), { name: 'NotSupportedError' });
  await assert.rejects(target.crypto.subtle.digest('MD5', data), { name: 'NotSupportedError' });
});

test('TextEncoder fallback encodes UTF-8 exactly like the native one', () => {
  const { target } = install();
  const Fallback = target.TextEncoder;
  const native = new TextEncoder();
  for (const text of ['', 'abc', 'ñandú', '€', 'a😀b', '日本語', 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk']) {
    assert.deepEqual([...new Fallback().encode(text)], [...native.encode(text)], JSON.stringify(text));
  }
  assert.deepEqual([...new Fallback().encode('\ud800')], [0xef, 0xbf, 0xbd], 'lone surrogate → U+FFFD');
  assert.deepEqual([...new Fallback().encode()], [], 'no argument');
});

// ── Integration with the real @supabase/auth-js (the version this app ships) ─────────────────────────────────────────
const helpersPath = fileURLToPath(new URL('../node_modules/@supabase/auth-js/dist/main/lib/helpers.js', import.meta.url));
const helpers = createRequire(import.meta.url)(helpersPath);

/** Runs `fn` with `crypto` and `TextEncoder` removed from globalThis (Hermes), restoring them afterwards. */
async function withoutWebCrypto(fn) {
  const saved = Object.fromEntries(['crypto', 'TextEncoder'].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const originalWarn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args.join(' '));
  for (const key of Object.keys(saved)) delete globalThis[key];
  try {
    return await fn(warnings);
  } finally {
    for (const [key, descriptor] of Object.entries(saved)) {
      delete globalThis[key];
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    }
    console.warn = originalWarn;
  }
}

const fakeStorage = () => {
  const items = new Map();
  return {
    items,
    getItem: async (key) => items.get(key) ?? null,
    setItem: async (key, value) => void items.set(key, value),
    removeItem: async (key) => void items.delete(key),
    /** auth-js stores the verifier JSON-encoded (`"abc…"`): this is the raw verifier. */
    verifier: () => JSON.parse(items.get('sb-code-verifier')),
  };
};

test('control: without the polyfill auth-js falls back to plain (the bug)', async () => {
  await withoutWebCrypto(async (warnings) => {
    const storage = fakeStorage();
    const [challenge, method] = await helpers.getCodeChallengeAndMethod(storage, 'sb', false);
    assert.equal(method, 'plain');
    assert.equal(challenge, storage.verifier(), 'challenge === verifier');
    assert.match(storage.verifier(), /^[A-Za-z0-9\-._~]{56}$/, 'with no crypto at all the verifier comes from Math.random');
    assert.ok(warnings.some((line) => line.includes('WebCrypto API is not supported')));
  });
});

test('with the polyfill auth-js uses s256 and no warning', async () => {
  await withoutWebCrypto(async (warnings) => {
    installWebCrypto(globalThis, backend);
    const storage = fakeStorage();
    const [challenge, method] = await helpers.getCodeChallengeAndMethod(storage, 'sb', false);
    const verifier = storage.verifier();
    assert.equal(method, 's256');
    assert.notEqual(challenge, verifier);
    assert.equal(challenge, createHash('sha256').update(verifier).digest('base64url'), 'challenge = base64url(SHA-256(verifier))');
    assert.match(verifier, /^[0-9a-f]{112}$/, 'verifier drawn from getRandomValues (56 x 2 hex digits)');
    assert.deepEqual(warnings, []);
  });
});

test('RFC 7636 appendix B vector through auth-js with the polyfill', async () => {
  await withoutWebCrypto(async () => {
    installWebCrypto(globalThis, backend);
    assert.equal(
      await helpers.generatePKCEChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'),
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });
});

test('two verifiers are never equal (it is random, not Math.random-seeded constant)', async () => {
  await withoutWebCrypto(async () => {
    installWebCrypto(globalThis, backend);
    assert.notEqual(helpers.generatePKCEVerifier(), helpers.generatePKCEVerifier());
  });
});
