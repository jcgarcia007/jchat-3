// W4 block 1: gifts from the browser — the gift_hold service for the web, the WEB_GIFTS_ENABLED switch (off) and the
// dependencies. Run from mobile/:  node --test scripts/web-w4-gifts.test.mjs

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const dir = mkdtempSync(join(tmpdir(), 'w4-gifts-'));
const compile = (rel, out) =>
  writeFileSync(join(dir, out), ts.transpileModule(read(rel), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText);
compile('utils/giftHold.ts', 'giftHold.mjs');
compile('constants/features.ts', 'features.mjs');
const { parseGiftHoldData, giftHoldFailure } = await import(pathToFileURL(join(dir, 'giftHold.mjs')).href);
const features = await import(pathToFileURL(join(dir, 'features.mjs')).href);

const OK = { clientSecret: 'pi_3Abc_secret_xyz', publishableKey: 'pk_test_123', serverTotalCents: 1234, ephemeralKey: 'ek', customer: 'cus_1' };

test('the web gifts switch ships OFF', () => {
  assert.equal(features.WEB_GIFTS_ENABLED, false);
  assert.match(read('constants/features.ts'), /export const WEB_GIFTS_ENABLED = false;/);
});

test('with the switch off the web never offers the gift; devices are never affected', () => {
  const hook = read('hooks/useGiftAvailable.ts');
  assert.match(hook, /const GIFTS_OFF_ON_THIS_PLATFORM = Platform\.OS === 'web' && !WEB_GIFTS_ENABLED;/);
  assert.match(hook, /if \(GIFTS_OFF_ON_THIS_PLATFORM \|\| !businessId \|\| !otherUserId\) \{\s*setAvailable\(false\);/);
});

test('parseGiftHoldData keeps only what Stripe.js needs', () => {
  assert.deepEqual(parseGiftHoldData(OK), { clientSecret: 'pi_3Abc_secret_xyz', publishableKey: 'pk_test_123', totalCents: 1234 });
  assert.equal('ephemeralKey' in parseGiftHoldData(OK), false, 'the ephemeral key (native only) is dropped');
});

test('parseGiftHoldData rejects incomplete or malformed answers', () => {
  assert.equal(parseGiftHoldData(null), null);
  assert.equal(parseGiftHoldData('x'), null);
  assert.equal(parseGiftHoldData({ ...OK, clientSecret: undefined }), null);
  assert.equal(parseGiftHoldData({ ...OK, clientSecret: 'not-a-secret' }), null);
  assert.equal(parseGiftHoldData({ ...OK, publishableKey: 'sk_live_nope' }), null, 'a secret key is never accepted as the publishable key');
  assert.equal(parseGiftHoldData({ ...OK, publishableKey: '' }), null);
  assert.equal(parseGiftHoldData({ ...OK, serverTotalCents: 'x' }).totalCents, 0);
});

test('giftHoldFailure carries the server code (so the app can translate that case) and falls back to the generic text', () => {
  assert.deepEqual(giftHoldFailure({ error: 'gift_unavailable', code: 'gift_unavailable' }, 'generic'), { code: 'gift_unavailable', message: 'gift_unavailable' });
  assert.deepEqual(giftHoldFailure({ error: 'Total is below Stripe minimum ($0.50)' }, 'generic'), { code: 'ServerError', message: 'Total is below Stripe minimum ($0.50)' });
  assert.deepEqual(giftHoldFailure(null, 'generic'), { code: 'ServerError', message: 'generic' });
  assert.deepEqual(giftHoldFailure({ error: 5, code: 7 }, 'generic'), { code: 'ServerError', message: 'generic' });
});

test('the web service calls the SAME server action as the app and never sends an amount', () => {
  const web = read('services/giftHold.web.ts');
  assert.match(web, /supabase\.functions\.invoke\('payments', \{\s*body: \{ action: 'gift_hold', gift_offer_id: giftOfferId \},/);
  const request = web.slice(web.indexOf("invoke('payments'"), web.indexOf('if (error)'));
  assert.doesNotMatch(request, /amount|total_cents|price/i, 'no amount in the request');
  assert.doesNotMatch(web, /stripe-react-native|@stripe\/stripe-js/);
  assert.doesNotMatch(web, /console\.(log|error)\([^)]*(clientSecret|publishableKey)/);
});

test('devices get an inert stub and stripe.ts (the native hold) is untouched by this block', () => {
  assert.match(read('services/giftHold.ts'), /code: 'NotSupported'/);
  const stripe = read('services/stripe.ts');
  assert.match(stripe, /export async function holdGiftPayment\(giftOfferId: string\): Promise<StripeResult>/);
  assert.doesNotMatch(stripe, /giftHold|fetchGiftHold/);
});

// ── Block 2: the card form ──────────────────────────────────────────────────────────────────────────────────────────────
compile('utils/giftPaymentResult.ts', 'giftPaymentResult.mjs');
const { giftPaymentOutcome, stripeLocale } = await import(pathToFileURL(join(dir, 'giftPaymentResult.mjs')).href);

test('requires_capture is the success of the card step: the card is HELD, nothing charged yet', () => {
  assert.deepEqual(giftPaymentOutcome({ paymentIntent: { status: 'requires_capture' } }), { kind: 'held' });
  assert.deepEqual(giftPaymentOutcome({ paymentIntent: { status: 'succeeded' } }), { kind: 'held' });
});

test('a refused or invalid card lets the person try again with Stripe\'s own message', () => {
  assert.deepEqual(giftPaymentOutcome({ error: { type: 'card_error', code: 'card_declined', message: 'Tu tarjeta fue rechazada.' } }), { kind: 'retry', message: 'Tu tarjeta fue rechazada.' });
  assert.deepEqual(giftPaymentOutcome({ error: { type: 'validation_error', message: 'Número incompleto.' } }), { kind: 'retry', message: 'Número incompleto.' });
  assert.deepEqual(giftPaymentOutcome({ error: { type: 'card_error' } }), { kind: 'retry', message: null });
  assert.deepEqual(giftPaymentOutcome({ paymentIntent: { status: 'requires_payment_method' } }), { kind: 'retry', message: null });
});

test('processing never counts as paid (and blocks a second payment)', () => {
  assert.deepEqual(giftPaymentOutcome({ paymentIntent: { status: 'processing' } }), { kind: 'processing' });
});

test('anything unexpected is a generic failure carrying a code for the logs only', () => {
  assert.deepEqual(giftPaymentOutcome({ error: { type: 'api_error', code: 'rate_limit' } }), { kind: 'failed', code: 'rate_limit' });
  assert.deepEqual(giftPaymentOutcome({ error: { type: 'api_connection_error' } }), { kind: 'failed', code: 'api_connection_error' });
  assert.deepEqual(giftPaymentOutcome({ paymentIntent: { status: 'canceled' } }), { kind: 'failed', code: 'canceled' });
  assert.deepEqual(giftPaymentOutcome({ paymentIntent: { status: 'requires_action' } }), { kind: 'failed', code: 'requires_action' });
  assert.deepEqual(giftPaymentOutcome({}), { kind: 'failed', code: 'no_payment_intent' });
});

test('Stripe.js locale follows the app language', () => {
  assert.equal(stripeLocale('es'), 'es');
  assert.equal(stripeLocale('es-MX'), 'es');
  assert.equal(stripeLocale('en'), 'en');
  assert.equal(stripeLocale(undefined), 'en');
});

test('the web form confirms the server\'s PaymentIntent in place and never sends an amount', () => {
  const form = read('components/gift/GiftPaymentForm.web.tsx');
  assert.match(form, /from '@stripe\/stripe-js\/pure'/, 'Stripe.js is downloaded only when the form opens');
  assert.match(form, /stripe\.confirmPayment\(\{\s*elements,\s*redirect: 'if_required',/);
  assert.match(form, /giftPaymentOutcome\(result\)/);
  assert.doesNotMatch(form, /^import (?!type)[^\n]*from '@stripe\/stripe-js';/m, 'no value import that loads Stripe.js at startup (types are erased)');
  assert.doesNotMatch(form, /stripe-react-native/);
  assert.doesNotMatch(form, /#[0-9a-fA-F]{3,8}\b/, 'colors come from the theme tokens, no hex');
  assert.doesNotMatch(form, /console\.(log|error)\([^)]*(clientSecret|publishableKey)/);
});

test('devices render nothing for the form, and nothing native imports it', () => {
  assert.match(read('components/gift/GiftPaymentForm.tsx'), /export function GiftPaymentForm\(_props: GiftPaymentFormProps\): null \{\s*return null;/);
  assert.doesNotMatch(read('components/gift/GiftPaymentForm.tsx'), /@stripe\//);
});

test('es / en have the same gift keys, with the card-form strings', () => {
  const j = (l) => JSON.parse(read(`i18n/locales/${l}/chat.json`)).gift;
  assert.deepEqual(Object.keys(j('es')), Object.keys(j('en')));
  for (const k of ['payTitle', 'payButton', 'payBack', 'payProcessing']) assert.ok(j('es')[k] && j('en')[k], k);
  assert.match(j('es').payButton, /\{\{amount\}\}/);
  assert.match(j('en').payButton, /\{\{amount\}\}/);
});

test('mobile has the two Stripe.js packages, at the versions the Next site already uses', () => {
  const mobile = JSON.parse(read('package.json')).dependencies;
  const web = JSON.parse(readFileSync(new URL('../../web/package.json', import.meta.url), 'utf8')).dependencies;
  assert.equal(mobile['@stripe/stripe-js'], web['@stripe/stripe-js']);
  assert.equal(mobile['@stripe/react-stripe-js'], web['@stripe/react-stripe-js']);
});

test('the server side keeps the manual-capture hold: a web card form only confirms the PaymentIntent gift_hold creates', () => {
  const payments = readFileSync(new URL('../../supabase/functions/payments/index.ts', import.meta.url), 'utf8');
  assert.match(payments, /capture_method: "manual" as const, \/\/ HOLD only: captured by gift-worker on accept/);
});
