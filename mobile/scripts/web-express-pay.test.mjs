// R5: Apple Pay / Google Pay (Express Checkout Element) on the gift's payment page, web only.
// Run from mobile/:  node --test scripts/web-express-pay.test.mjs

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const dir = mkdtempSync(join(tmpdir(), 'express-pay-'));
const opts = { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } };
for (const name of ['giftPaymentResult', 'giftPaymentFlow']) {
  writeFileSync(join(dir, `${name}.mjs`), ts.transpileModule(read(`utils/${name}.ts`), opts).outputText.replace(/from '\.\/giftPaymentResult'/g, "from './giftPaymentResult.mjs'"));
}
const { giftPaymentOutcome } = await import(pathToFileURL(join(dir, 'giftPaymentResult.mjs')).href);
const { nextGiftStep, walletAvailable } = await import(pathToFileURL(join(dir, 'giftPaymentFlow.mjs')).href);

const declined = giftPaymentOutcome({ error: { type: 'card_error', code: 'card_declined', message: 'Rechazada.' } });
const invalid = giftPaymentOutcome({ error: { type: 'validation_error', message: 'Incompleto.' } });

test('walletAvailable: only Apple Pay or Google Pay count; nothing at all (undefined) hides the button and the separator', () => {
  assert.equal(walletAvailable(undefined), false);
  assert.equal(walletAvailable(null), false);
  assert.equal(walletAvailable({}), false);
  assert.equal(walletAvailable({ applePay: { available: false }, googlePay: { available: false } }), false);
  assert.equal(walletAvailable({ applePay: { available: true } }), true);
  assert.equal(walletAvailable({ googlePay: { available: true } }), true);
  // Link / PayPal / Amazon Pay / Klarna are switched off in the options; even if reported they never show the wallet block
  assert.equal(walletAvailable({ link: { available: true }, paypal: { available: true }, klarna: { available: true }, amazonPay: { available: true } }), false);
});

test('nextGiftStep: held / processing / closed / failed map straight through', () => {
  assert.deepEqual(nextGiftStep(giftPaymentOutcome({ paymentIntent: { status: 'requires_capture' } }), 0), { kind: 'held' });
  assert.deepEqual(nextGiftStep(giftPaymentOutcome({ paymentIntent: { status: 'processing' } }), 0), { kind: 'processing' });
  assert.deepEqual(nextGiftStep(giftPaymentOutcome({ error: { type: 'invalid_request_error', code: 'payment_intent_unexpected_state' } }), 0), { kind: 'closed' });
  assert.deepEqual(nextGiftStep(giftPaymentOutcome({ error: { type: 'api_error', code: 'rate_limit' } }), 0), { kind: 'failed', code: 'rate_limit' });
});

test('nextGiftStep: a refusal counts (3 attempts), an invalid entry does not; the 3rd refusal exhausts the offer; counting starts from the server\'s count', () => {
  assert.deepEqual(nextGiftStep(declined, 0), { kind: 'retry', declines: 1, left: 2, exhausted: false, counted: true, message: 'Rechazada.' });
  assert.deepEqual(nextGiftStep(declined, 1), { kind: 'retry', declines: 2, left: 1, exhausted: false, counted: true, message: 'Rechazada.' });
  assert.deepEqual(nextGiftStep(declined, 2), { kind: 'retry', declines: 3, left: 0, exhausted: true, counted: true, message: 'Rechazada.' });
  assert.deepEqual(nextGiftStep(invalid, 1), { kind: 'retry', declines: 1, left: 2, exhausted: false, counted: false, message: 'Incompleto.' });
  // a reopened offer that already had 2 refusals (initialFailures) has 1 attempt left after the first new one is refused
  assert.equal(nextGiftStep(declined, 2).exhausted, true);
  assert.equal(nextGiftStep(declined, 5).left, 0, 'never negative');
});

test('form: ONE Express Checkout Element inside the same Elements, only Apple Pay + Google Pay, one column', () => {
  const form = read('components/gift/GiftPaymentForm.web.tsx');
  assert.match(form, /import \{ Elements, ExpressCheckoutElement, PaymentElement, useElements, useStripe \} from '@stripe\/react-stripe-js';/);
  assert.match(form, /paymentMethods: \{ applePay: 'auto', googlePay: 'auto', link: 'never', paypal: 'never', amazonPay: 'never', klarna: 'never' \}/);
  assert.match(form, /layout: \{ maxColumns: 1, maxRows: 1, overflow: 'never' \}/);
  assert.equal((form.match(/<Elements /g) ?? []).length, 1, 'the SAME Elements (same PaymentIntent) holds the wallet and the card');
  assert.equal((form.match(/<ExpressCheckoutElement/g) ?? []).length, 1);
  assert.doesNotMatch(form, /#[0-9a-fA-F]{3,8}\b/, 'theme tokens only');
});

test('form: no wallet → neither the button nor the separator is drawn; the element stays mounted (hidden) so Stripe can answer', () => {
  const form = read('components/gift/GiftPaymentForm.web.tsx');
  assert.match(form, /onAvailablePaymentMethodsChange=\{\(\{ paymentMethods \}\) => setWalletReady\(walletAvailable\(paymentMethods\)\)\}/);
  assert.match(form, /style=\{walletReady \? styles\.wallet : styles\.walletHidden\}/);
  assert.match(form, /walletHidden: \{ height: 0, overflow: 'hidden', opacity: 0 \}/);
  assert.match(form, /\{walletReady \? \(\s*<View testID="gift-wallet-or"/);
  // order in the tree: wallet → separator → card field → message → Pay → fine print
  const order = ['<ExpressCheckoutElement', 'gift-wallet-or', '<PaymentElement', '{message ? (', 'testID="gift-pay"', '{!note ? null'].map((k) => form.indexOf(k));
  assert.ok(order.every((v) => v > 0) && [...order].sort((a, b) => a - b).join() === order.join(), 'wallet, separator, card, message, Pay, note');
});

test('form: the Pay button and the wallet\'s confirm run the SAME function; a failure tells the wallet; cancel is not an attempt', () => {
  const form = read('components/gift/GiftPaymentForm.web.tsx');
  assert.equal((form.match(/stripe\.confirmPayment\(/g) ?? []).length, 1, 'one confirmPayment call in the whole form');
  assert.match(form, /onPress=\{\(\) => void confirm\(\)\}/);
  assert.match(form, /void confirm\(\)\.then\(\(outcome\) => \{\s*if \(outcome === 'failed'\) event\.paymentFailed\(\{ reason: 'fail' \}\);\s*\}\);/);
  assert.match(form, /onConfirm=\{onWalletConfirm\}/);
  assert.match(form, /const onWalletCancel = \(\) => undefined;/, 'closing the wallet sheet changes nothing and counts nothing');
  assert.match(form, /onCancel=\{onWalletCancel\}/);
  // the shared decision table
  assert.match(form, /import \{ nextGiftStep, walletAvailable \} from '\.\.\/\.\.\/utils\/giftPaymentFlow';/);
  assert.match(form, /const step = nextGiftStep\(giftPaymentOutcome\(result\), declinesRef\.current\);/);
  // a duplicate confirm while one runs is ignored and never tells the wallet it failed
  assert.match(form, /if \(busyRef\.current\) return 'busy';/);
  // the wallet is locked while paying / processing / closed (the shared `disabled`)
  assert.match(form, /pointerEvents=\{disabled \? 'none' : 'auto'\}/);
});

test('form: NO await before stripe.confirmPayment (Apple Pay opens its sheet from the tap); submit() is documented with the Stripe link', () => {
  const form = read('components/gift/GiftPaymentForm.web.tsx');
  const start = form.indexOf('const confirm = async');
  const call = form.indexOf('await stripe.confirmPayment(');
  assert.ok(start > 0 && call > start);
  assert.doesNotMatch(form.slice(start, call), /await /, 'nothing is awaited between the entry of confirm() and confirmPayment');
  const handler = form.slice(form.indexOf('const onWalletConfirm'), form.indexOf('const onWalletCancel'));
  assert.doesNotMatch(handler, /await /, 'the wallet\'s confirm handler awaits nothing before calling the shared function');
  assert.match(form, /elements\.submit\(\)/);
  assert.match(form, /https:\/\/docs\.stripe\.com\/elements\/express-checkout-element\/accept-a-payment\?payment-ui=elements/);
  assert.doesNotMatch(form.replace(/\/\*[\s\S]*?\*\//g, ''), /await elements\.submit/, 'not called today: the PaymentIntent already exists');
});

test('state shared by both paths: busy flag to the page, attempt counter, closed state', () => {
  const form = read('components/gift/GiftPaymentForm.web.tsx');
  assert.match(form, /const busy = paying \|\| processing;\s*useEffect\(\(\) => \{\s*onBusyChange\?\.\(busy\);/);
  assert.match(form, /declinesRef\.current = step\.declines;\s*setDeclines\(step\.declines\);/);
  assert.match(form, /if \(step\.exhausted\) \{\s*closedRef\.current = true;\s*setClosed\(true\);\s*setMessage\(t\('gift\.payNoAttemptsLeft'\)\);/);
  assert.match(form, /case 'closed':\s*closedRef\.current = true;\s*setClosed\(true\);\s*setMessage\(t\('gift\.payClosed'\)\);/);
  assert.match(form, /useState\(initialFailures\)/);
});

test('texts: "o con tarjeta" / "or pay with card"; devices unchanged (the native twins render nothing)', () => {
  const j = (lng) => JSON.parse(read(`i18n/locales/${lng}/chat.json`)).gift;
  assert.equal(j('es').payOrCard, 'o con tarjeta');
  assert.equal(j('en').payOrCard, 'or pay with card');
  assert.match(read('components/gift/GiftPaymentForm.tsx'), /export function GiftPaymentForm\(_props: GiftPaymentFormProps\): null \{\s*return null;/);
  assert.match(read('components/gift/GiftPayPage.tsx'), /export function GiftPayPage\(_props: GiftPayPageProps\): null \{\s*return null;/);
  assert.match(read('components/gift/GiftSheet.tsx'), /const result = await holdGiftPayment\(id\);/);
});
