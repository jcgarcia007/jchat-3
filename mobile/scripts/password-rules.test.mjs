// Unit tests for utils/password.ts (rules shown on RegisterStep1Screen + the pure half of the HIBP leaked-password check).
// Run from mobile/:  node --test scripts/password-rules.test.mjs
// The module is TypeScript: it is transpiled with the repo's own `typescript` into a temp dir and imported.

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const dir = mkdtempSync(join(tmpdir(), 'password-rules-'));
const source = readFileSync(new URL('../utils/password.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
writeFileSync(join(dir, 'password.mjs'), outputText);
const { passwordRules, isPasswordValid, sha1Prefix, isHashInRange } = await import(pathToFileURL(join(dir, 'password.mjs')).href);

// ── rules ────────────────────────────────────────────────────────────────────────────────────────────────────────
test('7 characters is too short, 8 is enough', () => {
  assert.equal(passwordRules('abcde12').minLength, false);
  assert.equal(passwordRules('abcdef12').minLength, true);
  assert.equal(isPasswordValid('abcde12'), false);
});

test('no letter: digits and symbols only', () => {
  const rules = passwordRules('12345678');
  assert.deepEqual(rules, { minLength: true, hasLetter: false, hasNumber: true });
  assert.equal(isPasswordValid('12345678'), false);
  assert.equal(isPasswordValid('1234!@#$'), false);
});

test('no number: letters only', () => {
  const rules = passwordRules('abcdefgh');
  assert.deepEqual(rules, { minLength: true, hasLetter: true, hasNumber: false });
  assert.equal(isPasswordValid('abcdefgh'), false);
});

test('a valid password has all three', () => {
  assert.deepEqual(passwordRules('abcdefg1'), { minLength: true, hasLetter: true, hasNumber: true });
  assert.equal(isPasswordValid('abcdefg1'), true);
  assert.equal(isPasswordValid('Contraseña2026'), true);
});

test('accented letters count as letters', () => {
  assert.equal(passwordRules('ñññññññ1').hasLetter, true);
});

test('the empty string fails every rule', () => {
  assert.deepEqual(passwordRules(''), { minLength: false, hasLetter: false, hasNumber: false });
  assert.equal(isPasswordValid(''), false);
});

// ── sha1Prefix ───────────────────────────────────────────────────────────────────────────────────────────────────
test('sha1Prefix splits the known SHA-1("password") into 5 + 35 uppercase characters', () => {
  const { prefix, suffix } = sha1Prefix('5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8');
  assert.equal(prefix, '5BAA6');
  assert.equal(suffix, '1E4C9B93F3F0682250B6CF8331B7EE68FD8');
  assert.equal(suffix.length, 35);
});

test('sha1Prefix uppercases a lowercase digest (expo-crypto returns lowercase)', () => {
  const { prefix, suffix } = sha1Prefix('5baa61e4c9b93f3f0682250b6cf8331b7ee68fd8');
  assert.equal(prefix, '5BAA6');
  assert.equal(suffix, '1E4C9B93F3F0682250B6CF8331B7EE68FD8');
});

// ── isHashInRange ────────────────────────────────────────────────────────────────────────────────────────────────
const SUFFIX = '1E4C9B93F3F0682250B6CF8331B7EE68FD8';
const RANGE_WITH = [
  '0018A45C4D1DEF81644B54AB7F969B88D65:1',
  `${SUFFIX}:10434004`,
  '011053FD0102E94D6AE2F8B83D76FAF94F6:1',
].join('\r\n');
const RANGE_WITHOUT = ['0018A45C4D1DEF81644B54AB7F969B88D65:1', '011053FD0102E94D6AE2F8B83D76FAF94F6:3'].join('\r\n');

test('isHashInRange finds the suffix in the range body', () => {
  assert.equal(isHashInRange(SUFFIX, RANGE_WITH), true);
});

test('isHashInRange is false when the suffix is not there, and for an empty body', () => {
  assert.equal(isHashInRange(SUFFIX, RANGE_WITHOUT), false);
  assert.equal(isHashInRange(SUFFIX, ''), false);
});

test('isHashInRange is case-insensitive on both sides and accepts LF line endings', () => {
  assert.equal(isHashInRange(SUFFIX.toLowerCase(), RANGE_WITH), true);
  assert.equal(isHashInRange(SUFFIX, RANGE_WITH.toLowerCase().replace(/\r\n/g, '\n')), true);
});

test('isHashInRange matches the whole suffix, not a part of it, and ignores an empty suffix', () => {
  assert.equal(isHashInRange(SUFFIX.slice(0, 34), RANGE_WITH), false);
  assert.equal(isHashInRange('', RANGE_WITH), false);
});

test('padding lines (count 0, added by the Add-Padding header) are not breaches', () => {
  assert.equal(isHashInRange('ABCDEF0123456789ABCDEF0123456789ABC', 'ABCDEF0123456789ABCDEF0123456789ABC:0'), false);
  assert.equal(isHashInRange('ABCDEF0123456789ABCDEF0123456789ABC', 'ABCDEF0123456789ABCDEF0123456789ABC:2'), true);
});
