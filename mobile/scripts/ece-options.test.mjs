// JChat 3.0 — the options of the gift form's Express Checkout Element, checked against the REAL types installed from @stripe/stripe-js.
// Two things: (1) every key and value used must exist in StripeExpressCheckoutElementOptions; (2) the combination that silenced the element on
// the real Stripe.js — layout.maxRows together with layout.overflow 'never', which fired neither `ready` nor `loaderror` — must not come back
// (found with e2e/real/ece-real-stripe.spec.ts, WebKit and Chromium).
// Run: node --test scripts/ece-options.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const form = read('components/gift/GiftPaymentForm.web.tsx');
const types = read('node_modules/@stripe/stripe-js/dist/stripe-js/elements/express-checkout.d.ts');

const literal = /const WALLET_OPTIONS[^=]*=\s*(\{[\s\S]*?\n\});/.exec(form);
assert.ok(literal, 'WALLET_OPTIONS not found in GiftPaymentForm.web.tsx');
const OPTIONS = new Function(`return (${literal[1]});`)();

/** The members of `export type <name> = { … };` as { key: 'type text' }. */
function members(name) {
  const m = new RegExp(`export type ${name} = \\{([\\s\\S]*?)\\n\\};`).exec(types);
  assert.ok(m, `type ${name} not found in express-checkout.d.ts`);
  return Object.fromEntries([...m[1].matchAll(/^\s*(\w+)\?:\s*([^;]+);/gm)].map((x) => [x[1], x[2].trim()]));
}
/** The string literals of `export type <name> = 'a' | 'b'`. */
function literals(name) {
  const m = new RegExp(`export type ${name} =([\\s\\S]*?);`).exec(types);
  assert.ok(m, `type ${name} not found`);
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}
const optionKeys = [...(/export interface StripeExpressCheckoutElementOptions \{([\s\S]*?)\n\}/.exec(types)?.[1] ?? '').matchAll(/^\s{2}(\w+)\??:/gm)].map((x) => x[1]);

test('the installed typings are the version this test was written against (9.x)', () => {
  assert.match(read('node_modules/@stripe/stripe-js/package.json'), /"version": "9\./);
  assert.ok(optionKeys.includes('paymentMethods') && optionKeys.includes('layout') && optionKeys.length > 10, 'could not read the options interface');
});

test('every top-level option the form passes exists in StripeExpressCheckoutElementOptions', () => {
  for (const key of Object.keys(OPTIONS)) assert.ok(optionKeys.includes(key), `unknown option "${key}"`);
});

test('paymentMethods: every key exists and every value is allowed for that key', () => {
  const allowed = members('ExpressCheckoutPaymentMethodsOption'); // key → type name
  for (const [key, value] of Object.entries(OPTIONS.paymentMethods ?? {})) {
    assert.ok(key in allowed, `paymentMethods.${key} does not exist`);
    const ok = allowed[key] === 'ExpressCheckoutPaymentMethodOptionWithAlways' ? ['always', 'auto', 'never'] : ['auto', 'never'];
    assert.ok(ok.includes(value), `paymentMethods.${key}="${value}" is not allowed (${allowed[key]})`);
  }
});

test("buttonType: every key exists and every value is a real button type ('plain' included)", () => {
  const keys = members('ButtonTypeOption');
  const byKey = { applePay: literals('ApplePayButtonType'), googlePay: literals('GooglePayButtonType'), paypal: literals('PayPalButtonType') };
  for (const [key, value] of Object.entries(OPTIONS.buttonType ?? {})) {
    assert.ok(key in keys, `buttonType.${key} does not exist`);
    assert.ok(byKey[key].includes(value), `buttonType.${key}="${value}" is not allowed`);
  }
});

test('layout: only real keys, overflow is auto | never, numbers are positive', () => {
  const keys = members('LayoutOption');
  for (const [key, value] of Object.entries(OPTIONS.layout ?? {})) {
    assert.ok(key in keys, `layout.${key} does not exist`);
    if (key === 'overflow') assert.ok(['auto', 'never'].includes(value));
    else assert.ok(Number.isInteger(value) && value > 0, `layout.${key} must be a positive integer`);
  }
});

test("REGRESSION: layout never combines maxRows with overflow 'never' (that silenced the element: no ready, no loaderror)", () => {
  const layout = OPTIONS.layout ?? {};
  assert.ok(!('maxRows' in layout && layout.overflow === 'never'), `layout = ${JSON.stringify(layout)}`);
  assert.deepEqual(layout, { maxColumns: 1, overflow: 'never' }, 'one column, no overflow menu');
});

test('the form hands the options object to the element, and onReady / onLoadError use the typed event shapes', () => {
  assert.match(form, /<ExpressCheckoutElement\s+options=\{WALLET_OPTIONS\}/);
  assert.match(form, /onReady=\{\(\{ availablePaymentMethods \}\) =>/);
  assert.match(form, /onLoadError=\{\(\{ error \}\) =>/);
  const react = read('node_modules/@stripe/react-stripe-js/dist/react-stripe.d.ts');
  const props = /interface ExpressCheckoutElementProps extends ElementProps \{([\s\S]*?)\n\}/.exec(react)?.[1] ?? '';
  assert.match(props, /onReady\?: \(event: stripeJs\.StripeExpressCheckoutElementReadyEvent\) => any;/);
  assert.match(props, /onLoadError\?: \(event: \{\s*elementType: "expressCheckout";\s*error: StripeError;\s*\}\) => any;/);
  assert.doesNotMatch(props, /onLoaderStart/, 'react-stripe-js has no onLoaderStart for this element (do not pass one)');
});
