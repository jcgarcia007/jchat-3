// Delete account: the Edge Function answers coded reasons and the app shows the contact + the code (B2-5).
// Run from mobile/:  node --test scripts/delete-account-errors.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const readRepo = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const json = (lang, ns) => JSON.parse(read(`i18n/locales/${lang}/${ns}.json`));

const js = ts.transpileModule(read('utils/deleteAccountOutcome.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = { exports: {} };
new Function('module', 'exports', js)(mod, mod.exports);
const { deleteOutcomeFromResponse, sanitizeCode, NETWORK_FAILURE, NOT_CONFIGURED } = mod.exports;

test('ok → result ok, no code', () => {
  assert.deepEqual(deleteOutcomeFromResponse(200, true, null), { result: 'ok', code: null });
});

test('owner: 409 owner_has_business (new) and owns_business (old) both mean "close or transfer the business first"', () => {
  assert.equal(deleteOutcomeFromResponse(409, false, { error: 'owner_has_business', code: 'owner_has_business' }).result, 'owns_business');
  assert.equal(deleteOutcomeFromResponse(409, false, { error: 'owns_business' }).result, 'owns_business');
  assert.equal(deleteOutcomeFromResponse(500, false, { error: 'owner_has_business' }).result, 'error', 'only a 409 is the owner case');
});

test('database refusal: the code reaches the screen (fk_violation), and so do the other coded reasons', () => {
  assert.deepEqual(deleteOutcomeFromResponse(500, false, { error: 'fk_violation', code: 'fk_violation' }), { result: 'error', code: 'fk_violation' });
  assert.equal(deleteOutcomeFromResponse(500, false, { code: 'delete_failed' }).code, 'delete_failed');
  assert.equal(deleteOutcomeFromResponse(401, false, { error: 'invalid_session' }).code, 'invalid_session');
});

test('nothing but a short snake_case code is ever shown (sentences, HTML, stacks and non-JSON become http_<status>)', () => {
  assert.equal(sanitizeCode('Database error deleting user'), 'unknown');
  assert.equal(sanitizeCode('<html>502 Bad Gateway</html>'), 'unknown');
  assert.equal(deleteOutcomeFromResponse(502, false, null).code, 'http_502');
  assert.equal(deleteOutcomeFromResponse(500, false, { error: 'Database error deleting user' }).code, 'http_500');
  assert.equal(sanitizeCode('x'.repeat(80)), 'unknown');
  assert.equal(NETWORK_FAILURE.code, 'network');
  assert.equal(NOT_CONFIGURED.code, 'not_configured');
});

test('Settings shows "Write to us at <contact> … <code>" for every failure but the owner one, with the real contact', () => {
  const screen = read('screens/settings/SettingsScreen.tsx');
  assert.match(screen, /const failed = \(code: string\) => showAlert\(t\('alerts\.deleteErrorTitle'\), t\('alerts\.deleteErrorMessage', \{ contact: ACCOUNT_SUPPORT_EMAIL, code \}\)\)/);
  assert.match(screen, /deleteMyAccountWithCode\(\)/);
  assert.equal(read('constants/contact.ts').includes("ACCOUNT_SUPPORT_EMAIL = 'safety@jchat.cloud'"), true);
  for (const lang of ['en', 'es']) {
    const msg = json(lang, 'settings').alerts.deleteErrorMessage;
    assert.ok(msg.includes('{{contact}}') && msg.includes('{{code}}'), `${lang}: has the contact and the code`);
  }
  assert.match(json('es', 'settings').alerts.deleteErrorMessage, /^No pudimos borrar tu cuenta\. Escríbenos a /);
});

test('the Edge Function answers coded errors only (no raw error text) and the web client accepts the new owner code', () => {
  const fn = readRepo('supabase/functions/delete-account/index.ts');
  assert.doesNotMatch(fn, /error: (delErr\.message|String\(e\))/, 'no raw error text to the client');
  for (const code of ['owner_has_business', 'fk_violation', 'delete_failed', 'cleanup_failed', 'invalid_session', 'unexpected']) {
    assert.ok(fn.includes(code), `${code} is a code of the function`);
  }
  assert.match(fn, /classifyDeleteError\(delErr\.message\)/);
  assert.match(readRepo('web/lib/account.ts'), /owner_has_business/);
});
