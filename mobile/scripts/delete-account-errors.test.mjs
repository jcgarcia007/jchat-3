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
  assert.match(screen, /const failed = \(code: string\) =>\s+showAlert\(\s+t\('alerts\.deleteErrorTitle'\),\s+t\(code === 'storage_purge_failed' \? 'alerts\.deleteStorageErrorMessage' : 'alerts\.deleteErrorMessage', \{ contact: ACCOUNT_SUPPORT_EMAIL, code \}\),/);
  assert.match(screen, /deleteMyAccountWithCode\(\)/);
  assert.equal(read('constants/contact.ts').includes("ACCOUNT_SUPPORT_EMAIL = 'soporte@jchat.cloud'"), true, 'the delete error points to support, not to the safety mailbox');
  for (const lang of ['en', 'es']) {
    const msg = json(lang, 'settings').alerts.deleteErrorMessage;
    assert.ok(msg.includes('{{contact}}') && msg.includes('{{code}}'), `${lang}: has the contact and the code`);
  }
  assert.match(json('es', 'settings').alerts.deleteErrorMessage, /^No pudimos borrar tu cuenta\. Escríbenos a /);
});

test('the Edge Function answers coded errors only (no raw error text) and the web client accepts the new owner code', () => {
  const fn = readRepo('supabase/functions/delete-account/index.ts');
  assert.doesNotMatch(fn, /error: (delErr\.message|String\(e\))/, 'no raw error text to the client');
  for (const code of ['owner_has_business', 'fk_violation', 'delete_failed', 'cleanup_failed', 'invalid_session', 'unexpected', 'storage_purge_failed']) {
    assert.ok(fn.includes(code), `${code} is a code of the function`);
  }
  assert.match(fn, /classifyDeleteError\(delErr\.message\)/);
  assert.match(readRepo('web/lib/account.ts'), /owner_has_business/);
});

test('storage_purge_failed has its own es/en message with the contact and the code, and the app tells it apart', () => {
  for (const lang of ['en', 'es']) {
    const msg = json(lang, 'settings').alerts.deleteStorageErrorMessage;
    assert.ok(msg.includes('{{contact}}') && msg.includes('{{code}}'), `${lang}: has the contact and the code`);
  }
  assert.match(json('es', 'settings').alerts.deleteStorageErrorMessage, /^No pudimos borrar tus archivos\. Inténtalo de nuevo o escríbenos a /);
  assert.match(json('en', 'settings').alerts.deleteStorageErrorMessage, /^We couldn't delete your files\. Try again or write to us at /);
  assert.match(read('screens/settings/SettingsScreen.tsx'), /code === 'storage_purge_failed' \? 'alerts\.deleteStorageErrorMessage'/);
  assert.equal(deleteOutcomeFromResponse(500, false, { code: 'storage_purge_failed' }).code, 'storage_purge_failed');
});

test('B2-11: while the account is being deleted a blocking overlay says "Borrando tu cuenta…" and the delete row does nothing', () => {
  const screen = read('screens/settings/SettingsScreen.tsx');
  assert.match(screen, /const \[deleting, setDeleting\] = useState\(false\)/);
  assert.match(screen, /setDeleting\(true\);\n\s+try \{\n\s+const \{ result, code \} = await deleteMyAccountWithCode\(\);\n\s+setDeleting\(false\);/);
  assert.match(screen, /onPress=\{deleting \? undefined : handleDeleteAccount\}/);
  assert.match(screen, /testID="settings-deleting"/);
  assert.match(screen, /accessibilityViewIsModal/);
  assert.equal(json('es', 'settings').alerts.deleting, 'Borrando tu cuenta…');
  assert.equal(json('en', 'settings').alerts.deleting, 'Deleting your account…');
  assert.doesNotMatch(screen.slice(screen.indexOf('settings-deleting') - 200, screen.indexOf('settings-deleting') + 500), /#[0-9a-fA-F]{6}\b/, 'tokens, no hex');
});
