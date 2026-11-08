// D6: the error a blocked sign-up produces is recognised (utils/signupError.ts), and both languages have the generic text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const dir = mkdtempSync(join(tmpdir(), 'signup-error-'));
const out = join(dir, 'signupError.mjs');
writeFileSync(out, ts.transpileModule(readFileSync(new URL('../utils/signupError.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText);
const { isSignupBlocked } = await import(pathToFileURL(out).href);

test('unexpected_failure and "Database error saving new user" are a blocked sign-up', () => {
  assert.equal(isSignupBlocked({ code: 'unexpected_failure', message: 'x' }), true);
  assert.equal(isSignupBlocked({ message: 'Database error saving new user' }), true);
  assert.equal(isSignupBlocked({ code: 'x', message: 'DATABASE ERROR SAVING NEW USER' }), true);
});

test('other errors are not', () => {
  assert.equal(isSignupBlocked(null), false);
  assert.equal(isSignupBlocked(undefined), false);
  assert.equal(isSignupBlocked({}), false);
  assert.equal(isSignupBlocked({ code: 'weak_password', message: 'Password is known to be weak' }), false);
  assert.equal(isSignupBlocked({ code: 'user_already_exists', message: 'User already registered' }), false);
  assert.equal(isSignupBlocked({ code: 'over_email_send_rate_limit', message: 'email rate limit exceeded' }), false);
});

test('the register screen uses it and the text exists in es and en without revealing the block', () => {
  const screen = readFileSync(new URL('../screens/auth/RegisterStep2Screen.tsx', import.meta.url), 'utf8');
  assert.match(screen, /isSignupBlocked\(signUpError\)/);
  assert.match(screen, /register\.alerts\.signupBlocked/);
  for (const lang of ['es', 'en']) {
    const json = JSON.parse(readFileSync(new URL(`../i18n/locales/${lang}/auth.json`, import.meta.url), 'utf8'));
    const text = json.register.alerts.signupBlocked;
    assert.match(text, /soporte@jchat\.cloud/);
    assert.doesNotMatch(text, /bloquead|blocked|banned|suspend|suspendid/i);
  }
});
