// Unit tests for lib/passwordRecovery.ts (web password recovery: codes, limits, validation). Run from web/:  node --test scripts/password-recovery.test.mjs
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const dir = mkdtempSync(join(tmpdir(), 'password-recovery-'));
const out = join(dir, 'passwordRecovery.mjs');
writeFileSync(out, ts.transpileModule(readFileSync(new URL('../lib/passwordRecovery.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText);
const m = await import(pathToFileURL(out).href);

test('email: trimmed and lower-cased; a plausible address needs one @ and a dot after it', () => {
  assert.equal(m.normalizeEmail('  Test@Example.COM '), 'test@example.com');
  assert.equal(m.isPlausibleEmail('a@b.co'), true);
  for (const bad of ['', 'abc', 'a@b', '@b.co', 'a b@c.co', 'a@b .co']) assert.equal(m.isPlausibleEmail(bad), false, bad);
});

test('code: only digits, at most 6; complete only with exactly 6', () => {
  assert.equal(m.normalizeCode('123 456'), '123456');
  assert.equal(m.normalizeCode('12-34-56-78'), '123456');
  assert.equal(m.normalizeCode('abc'), '');
  assert.equal(m.isCodeComplete('123456'), true);
  assert.equal(m.isCodeComplete('12345'), false);
  assert.equal(m.isCodeComplete('1234567'), false);
  assert.equal(m.isCodeComplete('12345a'), false);
});

test('password: at least 8 characters and the two fields equal', () => {
  assert.equal(m.passwordProblem('short', 'short'), 'tooShort');
  assert.equal(m.passwordProblem('longenough1', 'different1'), 'mismatch');
  assert.equal(m.passwordProblem('longenough1', 'longenough1'), null);
  assert.equal(m.passwordProblem('12345678', '12345678'), null);
});

test('resend wait: 60 s from the last send, never negative, 0 when nothing was sent', () => {
  assert.equal(m.RESEND_COOLDOWN_S, 60);
  assert.equal(m.cooldownRemaining(null, 1_000_000), 0);
  assert.equal(m.cooldownRemaining(1_000_000, 1_000_000), 60);
  assert.equal(m.cooldownRemaining(1_000_000, 1_000_000 + 59_001), 1);
  assert.equal(m.cooldownRemaining(1_000_000, 1_000_000 + 60_000), 0);
  assert.equal(m.cooldownRemaining(1_000_000, 1_000_000 + 999_000), 0);
});

test('wrong codes: the 5th locks the form for 15 minutes; an expired lock starts the count again', () => {
  let s = m.FRESH_ATTEMPTS;
  const t0 = 5_000_000;
  for (let i = 1; i <= 4; i += 1) {
    s = m.registerFailure(s, t0);
    assert.equal(s.fails, i);
    assert.equal(m.lockMinutesLeft(s, t0), 0);
  }
  s = m.registerFailure(s, t0);
  assert.equal(s.fails, 5);
  assert.equal(m.lockMinutesLeft(s, t0), 15);
  assert.equal(m.lockMinutesLeft(s, t0 + 14 * 60_000 + 1), 1);
  assert.equal(m.lockMinutesLeft(s, t0 + 15 * 60_000), 0);
  const again = m.registerFailure(s, t0 + 16 * 60_000);
  assert.equal(again.fails, 1);
  assert.equal(again.lockedUntil, null);
});

test('errors of resetPasswordForEmail: rate limit, captcha, anything else generic; no error → null', () => {
  assert.equal(m.recoveryErrorKind(null), null);
  assert.equal(m.recoveryErrorKind({ code: 'over_email_send_rate_limit' }), 'rateLimited');
  assert.equal(m.recoveryErrorKind({ status: 429 }), 'rateLimited');
  assert.equal(m.recoveryErrorKind({ code: 'captcha_failed' }), 'captcha');
  assert.equal(m.recoveryErrorKind({ code: 'unexpected_failure', status: 500 }), 'generic');
});
