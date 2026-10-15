// Unit tests for the pure helpers of native Sign in with Apple (utils/appleNonce.ts, utils/appleName.ts). Run from mobile/:
//   node --test scripts/apple-signin.test.mjs

import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const dir = mkdtempSync(join(tmpdir(), 'apple-'));
const load = async (name) => {
  const out = join(dir, `${name}.mjs`);
  writeFileSync(out, ts.transpileModule(readFileSync(new URL(`../utils/${name}.ts`, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText);
  return import(pathToFileURL(out).href);
};
const { createAppleNonce, bytesToHex, NONCE_BYTES } = await load('appleNonce');
const { displayNameFromApple, shouldSaveAppleName } = await load('appleName');

const deps = {
  randomBytes: (n) => randomBytes(n),
  sha256Hex: async (value) => createHash('sha256').update(value).digest('hex'),
};

test('the nonce is random, long enough, and Apple gets sha256(raw)', async () => {
  const a = await createAppleNonce(deps);
  const b = await createAppleNonce(deps);
  assert.ok(a.raw.length >= 32, 'raw is at least 32 chars');
  assert.equal(a.raw.length, NONCE_BYTES * 2);
  assert.match(a.raw, /^[0-9a-f]+$/);
  assert.notEqual(a.raw, b.raw, 'two nonces differ');
  assert.equal(a.hashed, createHash('sha256').update(a.raw).digest('hex'), 'hashed = sha256(raw), hex');
  assert.match(a.hashed, /^[0-9a-f]{64}$/);
  assert.notEqual(a.raw, a.hashed, 'raw (Supabase) and hashed (Apple) are different strings');
});

test('the hash is lower-cased and the raw value is never the one sent to Apple', async () => {
  const n = await createAppleNonce({ randomBytes: () => new Uint8Array(32).fill(1), sha256Hex: async () => 'ABCDEF0123' });
  assert.equal(n.raw, '01'.repeat(32));
  assert.equal(n.hashed, 'abcdef0123');
});

test('bytesToHex pads and masks', () => {
  assert.equal(bytesToHex([0, 1, 15, 16, 255, 256]), '00010f10ff00');
  assert.equal(bytesToHex(new Uint8Array(0)), '');
});

test('the name Apple returns becomes the display name only when the profile has none', () => {
  assert.equal(displayNameFromApple({ givenName: 'Ana', middleName: null, familyName: 'García' }), 'Ana García');
  assert.equal(displayNameFromApple({ givenName: ' Ana ', middleName: 'M.', familyName: ' ' }), 'Ana M.');
  assert.equal(displayNameFromApple({ givenName: null, familyName: null }), null);
  assert.equal(displayNameFromApple(null), null);
  assert.equal(displayNameFromApple({ givenName: 'x'.repeat(100) }).length, 60);

  assert.equal(shouldSaveAppleName(null, 'Ana'), true);
  assert.equal(shouldSaveAppleName('  ', 'Ana'), true);
  assert.equal(shouldSaveAppleName('Juan', 'Ana'), false, 'never overwrite a name the person chose');
  assert.equal(shouldSaveAppleName(null, null), false, 'nothing from Apple (second sign-in)');
});
