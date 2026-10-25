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
