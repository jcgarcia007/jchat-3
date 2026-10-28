// JChat 3.0 — the gift page's wallet diagnostic line (utils/walletDiagnostic.ts + GiftPaymentForm.web.tsx).
// Test-mode keys (pk_test_…) print one small line and a console.info with what Stripe's Express Checkout Element answered; with a live key
// (pk_live_…) NOTHING is drawn or logged. Neither the key nor the client secret ever goes into the line or the log.
// Run: node --test scripts/wallet-diagnostic.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const dir = mkdtempSync(join(tmpdir(), 'wallet-diag-'));
const source = readFileSync(new URL('../utils/walletDiagnostic.ts', import.meta.url), 'utf8');
writeFileSync(join(dir, 'walletDiagnostic.mjs'), ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText);
const { STRIPE_DIAG_STORAGE_KEY, WALLET_DIAG_TIMEOUT_MS, diagLineParts, isStripeTestKey, methodsFromChange, methodsFromReady, safeErrorParts, stripeDiagRequested } = await import(pathToFileURL(join(dir, 'walletDiagnostic.mjs')).href);

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const form = read('components/gift/GiftPaymentForm.web.tsx');
const locale = (l) => JSON.parse(read(`i18n/locales/${l}/chat.json`)).gift.diag;

test('only a pk_test_ key is a test key (live, empty, malformed and non-strings are not)', () => {
  assert.equal(isStripeTestKey('pk_test_51abc'), true);
  for (const k of ['pk_live_51abc', '', 'sk_test_x', 'PK_TEST_x', ' pk_test_x', undefined, null, 42]) assert.equal(isStripeTestKey(k), false, String(k));
});

test('with a live key the line has no parts at all, whatever Stripe answered', () => {
  for (const diag of [{ kind: 'timeout' }, { kind: 'methods', methods: ['applePay'] }, { kind: 'methods', methods: [] }, null]) {
    assert.equal(diagLineParts(false, diag), null);
  }
});

test('with a test key: nothing before an answer; wallets list; empty list; timeout', () => {
  assert.equal(diagLineParts(true, null), null);
  assert.deepEqual(diagLineParts(true, { kind: 'methods', methods: ['applePay', 'googlePay'] }), { key: 'wallets', list: ['applePay', 'googlePay'] });
  assert.deepEqual(diagLineParts(true, { kind: 'methods', methods: [] }), { key: 'wallets', list: [] });
  assert.deepEqual(diagLineParts(true, { kind: 'timeout' }), { key: 'noReply' });
  assert.equal(WALLET_DIAG_TIMEOUT_MS, 5000);
  assert.deepEqual(diagLineParts(true, { kind: 'error', type: 'invalid_request_error', message: 'boom' }), { key: 'error', type: 'invalid_request_error', message: 'boom' });
  assert.equal(diagLineParts(false, { kind: 'error', type: 'x', message: 'y' }), null, 'a live key draws no error either');
});

test('a loaderror shows only its type and message, with keys / client secrets redacted and the text cut short', () => {
  assert.deepEqual(safeErrorParts({ type: 'invalid_request_error', message: 'Invalid value for layout' }), { type: 'invalid_request_error', message: 'Invalid value for layout' });
  const dirty = safeErrorParts({ type: 'api_error', message: 'bad key pk_test_51ABCdefGHIjkl and sk_live_abcdef123456 for pi_3Abc_secret_XyZ123 end' });
  assert.doesNotMatch(dirty.message, /pk_test_51|sk_live_|_secret_XyZ/);
  assert.match(dirty.message, /\[redacted\]/);
  assert.equal(safeErrorParts(undefined).type, 'error');
  assert.equal(safeErrorParts({ message: 'x'.repeat(500) }).message.length, 140);
  assert.equal(safeErrorParts({ message: 'a\n  b\t c' }).message, 'a b c');
});

test('wallet names come out of both Stripe payloads, only the available ones, sorted', () => {
  assert.deepEqual(methodsFromReady({ applePay: true, googlePay: false, link: true }), ['applePay', 'link']);
  assert.deepEqual(methodsFromReady(undefined), []);
  assert.deepEqual(methodsFromChange({ googlePay: { available: true }, applePay: { available: true }, link: { available: false } }), ['applePay', 'googlePay']);
  assert.deepEqual(methodsFromChange(undefined), []);
});

test('the form logs and sets the diagnostic ONLY behind the test-key guard, and draws the line only through diagLineParts', () => {
  const report = form.slice(form.indexOf('const reportWallets'), form.indexOf('};', form.indexOf('const reportWallets')) + 2);
  assert.match(report, /if \(!testKey\) return;/);
  assert.ok(report.indexOf('if (!testKey) return;') < report.indexOf('console.info'), 'the guard comes before the log');
  const timer = form.slice(form.indexOf('if (!testKey) return undefined;'), form.indexOf('}, [testKey]);'));
  assert.ok(timer.length > 0 && timer.includes('console.info'), 'the 5 s timer exists and is behind the guard');
  assert.equal((form.match(/console\.info/g) ?? []).length, 3, 'exactly three console.info calls: the wallets report, the load error and the timeout');
  assert.match(form, /const reportLoadError = [\s\S]*?if \(!testKey\) return;[\s\S]*?console\.info/, 'the load error is logged behind the same guard');
  assert.match(form, /onLoadError=\{\(\{ error \}\) => reportLoadError\(error\)\}/);
  assert.match(form, /const parts = diagLineParts\(testKey, walletDiag\);\n\s+if \(!parts\) return null;/);
});

test('neither the key nor the client secret reaches the line or the logs', () => {
  const infoCalls = [...form.matchAll(/console\.info\([^;]*;/g)].map((m) => m[0]);
  assert.equal(infoCalls.length, 3);
  for (const call of infoCalls) assert.doesNotMatch(call, /publishableKey|clientSecret|secret/i, call);
  const line = form.slice(form.indexOf('const parts = diagLineParts'), form.indexOf('gift-wallet-diag') + 200);
  assert.doesNotMatch(line, /publishableKey|clientSecret/);
});

test('texts exist in es and en; the Spanish ones are exactly the requested ones', () => {
  assert.equal(locale('es').wallets, 'Stripe test · monederos: {{list}}');
  assert.equal(locale('es').noReply, 'Stripe test · sin respuesta del monedero (5 s)');
  assert.equal(locale('es').none, 'ninguno');
  assert.equal(locale('es').error, 'Stripe test · error del monedero: {{type}} {{message}}');
  for (const l of ['es', 'en']) for (const k of ['wallets', 'noReply', 'none', 'error']) assert.ok(locale(l)[k], `${l}.gift.diag.${k}`);
  assert.match(locale('en').wallets, /\{\{list\}\}/);
});

test('the line uses the secondary text colour and sits right after the retention note', () => {
  const after = form.slice(form.indexOf('{!note ? null'));
  assert.ok(after.indexOf('gift-wallet-diag') > 0 && after.indexOf('gift-wallet-diag') < 700, 'the diagnostic line follows the note');
  assert.match(after, /testID="gift-wallet-diag" style=\{\[styles\.fine, \{ color: c\.textSecondary \}\]\}/);
});

test('?stripe_diag=1 asks for the diagnostic (any position in the query), or the tab remembers it; nothing else does', () => {
  assert.equal(stripeDiagRequested('?stripe_diag=1', null), true);
  assert.equal(stripeDiagRequested('?venue=bar-x&stripe_diag=1', null), true);
  assert.equal(stripeDiagRequested('?stripe_diag=1&venue=bar-x', null), true);
  assert.equal(stripeDiagRequested('', '1'), true);
  for (const [search, remembered] of [['', null], [undefined, undefined], ['?stripe_diag=0', null], ['?stripe_diag=10', null], ['?xstripe_diag=1', null], ['?stripe_diag=', null], ['?venue=1', '0'], ['', 'true']]) {
    assert.equal(stripeDiagRequested(search, remembered), false, `${search} / ${remembered}`);
  }
  assert.equal(STRIPE_DIAG_STORAGE_KEY, 'jchat.stripeDiag');
});

test('the form needs BOTH a test key and the request to draw or log anything; captureWebEntry remembers the flag for the tab', () => {
  assert.match(form, /const testKey = isStripeTestKey\(publishableKey\) && diagRequested\(\);/);
  assert.match(form, /return stripeDiagRequested\(window\.location\.search, window\.sessionStorage\.getItem\(STRIPE_DIAG_STORAGE_KEY\)\);/);
  const capture = read('utils/captureWebEntry.web.ts');
  const iFlag = capture.indexOf('stripeDiagRequested(window.location.search, null)');
  assert.ok(iFlag > 0 && iFlag < capture.indexOf('parseEntryUrl('), 'the flag is read before the early return for non-entry URLs');
  assert.match(capture, /sessionStorage\.setItem\(STRIPE_DIAG_STORAGE_KEY, '1'\)/);
});
