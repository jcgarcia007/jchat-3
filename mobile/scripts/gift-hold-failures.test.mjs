// The "N attempts left" counter starts from what the SERVER already counted: payments/gift_hold returns payment_failures (migration 242)
// and the payment page starts its counter from it, so closing and reopening the same offer does not give 3 attempts again.
// Run from mobile/:  node --test scripts/gift-hold-failures.test.mjs

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const dir = mkdtempSync(join(tmpdir(), 'gift-hold-failures-'));
writeFileSync(join(dir, 'giftHold.mjs'), ts.transpileModule(read('utils/giftHold.ts'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText);
const { parseGiftHoldData } = await import(pathToFileURL(join(dir, 'giftHold.mjs')).href);

const body = { clientSecret: 'pi_1_secret_x', publishableKey: 'pk_test_1', serverTotalCents: 540 };

test('parseGiftHoldData reads paymentFailures, 0 by default (a new offer, or a server that does not send it yet)', () => {
  assert.equal(parseGiftHoldData(body).paymentFailures, 0);
  assert.equal(parseGiftHoldData({ ...body, paymentFailures: 0 }).paymentFailures, 0);
  assert.equal(parseGiftHoldData({ ...body, paymentFailures: 2 }).paymentFailures, 2);
  assert.deepEqual(parseGiftHoldData({ ...body, paymentFailures: 1 }), { clientSecret: 'pi_1_secret_x', publishableKey: 'pk_test_1', totalCents: 540, paymentFailures: 1 });
});

test('parseGiftHoldData never trusts a weird value: negative, fractional, text or NaN fall back safely', () => {
  assert.equal(parseGiftHoldData({ ...body, paymentFailures: -3 }).paymentFailures, 0);
  assert.equal(parseGiftHoldData({ ...body, paymentFailures: 1.9 }).paymentFailures, 1);
  assert.equal(parseGiftHoldData({ ...body, paymentFailures: '2' }).paymentFailures, 0);
  assert.equal(parseGiftHoldData({ ...body, paymentFailures: Number.NaN }).paymentFailures, 0);
  assert.equal(parseGiftHoldData({ ...body, paymentFailures: null }).paymentFailures, 0);
  // the rest of the contract is untouched
  assert.equal(parseGiftHoldData({ ...body, clientSecret: 'nope' }), null);
  assert.equal(parseGiftHoldData(null), null);
});

test('payments/gift_hold returns payment_failures in BOTH branches (existing PaymentIntent and a new one with 0)', () => {
  const fn = read('../supabase/functions/payments/index.ts');
  assert.match(fn, /\.select\("id, business_id, from_user_id, to_user_id, items, status, stripe_pi_id, payment_failures"\)/);
  assert.match(fn, /serverTotalCents: existing\.amount,\s*\/\/[^\n]*\n\s*paymentFailures: Number\(offer\.payment_failures \?\? 0\),/);
  assert.match(fn, /serverTotalCents: totalCents,\s*paymentFailures: 0,/);
  // nothing else of the money path changed: the PaymentIntent params, the idempotency key and the card-only types are as before
  assert.match(fn, /payment_method_types: \["card"\],\s*capture_method: "manual" as const/);
  assert.match(fn, /idempotencyKey: `gift:\$\{offerId\}`/);
});

test('the payment page starts the form\'s counter from the server\'s count', () => {
  const page = read('components/gift/GiftPayPage.web.tsx');
  assert.match(page, /initialFailures=\{payParams\.paymentFailures\}/);
  const form = read('components/gift/GiftPaymentForm.web.tsx');
  assert.match(form, /const \[declines, setDeclines\] = useState\(initialFailures\);\s*const \[closed, setClosed\] = useState\(false\);\s*const declinesRef = useRef\(initialFailures\);/);
  assert.match(read('components/gift/GiftPaymentForm.tsx'), /initialFailures\?: number;/);
});
