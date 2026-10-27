// The gift is CARD ONLY: no Link, so no Instant Bank Payments "Bank" tab (nor its cash-back badge) in the gift's PaymentElement.
// Stripe includes Link in card integrations, so the PaymentIntent being `card` is not enough: the PaymentElement gets `wallets.link: 'never'`.
// Run from mobile/:  node --test scripts/gift-card-only.test.mjs

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const form = read('components/gift/GiftPaymentForm.web.tsx');

test('the gift\'s PaymentElement is created with wallets.link: never (a constant, no extra type import)', () => {
  assert.match(form, /const CARD_ONLY_OPTIONS = \{ wallets: \{ applePay: 'never', googlePay: 'never', link: 'never' \} \} as const;/);
  assert.match(form, /<PaymentElement options=\{CARD_ONLY_OPTIONS\} onFocus=\{revealForm\} \/>/);
  assert.equal((form.match(/<PaymentElement/g) ?? []).length, 1, 'one PaymentElement in the form');
  assert.doesNotMatch(form, /import type \{[^}]*StripePaymentElementOptions/, 'no new type import: fewer merge conflicts');
});

test('only the gift form changes: the PaymentIntent stays card only with manual capture, and nothing else builds a PaymentElement', () => {
  const fn = read('../supabase/functions/payments/index.ts');
  assert.match(fn, /payment_method_types: \["card"\],\s*capture_method: "manual" as const/);
  assert.match(form, /@stripe\/react-stripe-js/);
  // the sheet and the page only host the form: they never build a PaymentElement of their own
  assert.doesNotMatch(read('components/gift/GiftSheet.tsx') + read('components/gift/GiftPayPage.web.tsx'), /<PaymentElement/);
});

test('devices unchanged: the native twin of the form still renders nothing', () => {
  assert.match(read('components/gift/GiftPaymentForm.tsx'), /export function GiftPaymentForm\(_props: GiftPaymentFormProps\): null \{\s*return null;/);
});
