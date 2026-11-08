// D6: the error a blocked sign-up produces is recognised (lib/authErrors.ts), the page shows the generic text and both languages have it.
// Run from web/:  node --test scripts/signup-error.test.mjs
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const dir = mkdtempSync(join(tmpdir(), 'signup-error-'));
const out = join(dir, 'authErrors.mjs');
writeFileSync(out, ts.transpileModule(readFileSync(new URL('../lib/authErrors.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText);
const { isSignupBlocked, authErrorKey } = await import(pathToFileURL(out).href);

test('unexpected_failure and "Database error saving new user" are a blocked sign-up', () => {
  assert.equal(isSignupBlocked({ code: 'unexpected_failure', message: 'x' }), true);
  assert.equal(isSignupBlocked({ message: 'Database error saving new user' }), true);
  assert.equal(isSignupBlocked({ code: 'x', message: 'DATABASE ERROR SAVING NEW USER' }), true);
});

test('other errors are not (and keep their own mapping)', () => {
  assert.equal(isSignupBlocked(null), false);
  assert.equal(isSignupBlocked({}), false);
  assert.equal(isSignupBlocked({ code: 'weak_password', message: 'Password is known to be weak' }), false);
  assert.equal(isSignupBlocked({ code: 'user_already_exists' }), false);
  assert.equal(authErrorKey({ code: 'user_already_exists' }), 'user_already_exists');
});

test('the register page uses it and the text exists in es and en without revealing the block', () => {
  const page = readFileSync(new URL('../app/auth/register/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /isSignupBlocked\(signUpErr\) \? "signupBlocked"/);
  for (const lang of ['es', 'en']) {
    const text = JSON.parse(readFileSync(new URL(`../messages/${lang}.json`, import.meta.url), 'utf8')).authErrors.signupBlocked;
    assert.match(text, /soporte@jchat\.cloud/);
    assert.doesNotMatch(text, /bloquead|blocked|banned|suspend|suspendid/i);
  }
});
