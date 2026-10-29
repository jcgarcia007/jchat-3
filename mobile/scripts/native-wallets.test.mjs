// Native wallets: Apple Pay (entitlement from the Stripe plugin's merchantIdentifier) and Google Pay (plugin flag + test environment by KEY).
// Static check of the sources and of the installed Stripe plugin; nothing is built or called.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const mobile = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(mobile, p), 'utf8');
const config = read('app.config.ts');
const stripe = read('services/stripe.ts');

test('the Stripe plugin gets the Apple merchant id and turns Google Pay on', () => {
  assert.match(config, /'@stripe\/stripe-react-native',\s*\{[^}]*merchantIdentifier: 'merchant\.com\.otunitylabs\.jchat'[^}]*enableGooglePay: true/s);
});

test('the installed plugin turns that merchant id into the in-app-payments entitlement', () => {
  const require = createRequire(import.meta.url);
  const { setApplePayEntitlement, setGooglePayMetaData } = require(join(mobile, 'node_modules/@stripe/stripe-react-native/lib/commonjs/plugin/withStripe.js'));
  const ent = setApplePayEntitlement('merchant.com.otunitylabs.jchat', {});
  assert.deepEqual(ent['com.apple.developer.in-app-payments'], ['merchant.com.otunitylabs.jchat']);
  assert.equal(typeof setGooglePayMetaData, 'function');
});

test('Google Pay environment follows the publishable key, not __DEV__', () => {
  assert.match(stripe, /testEnv: isStripeTestKey\(params\.publishableKey\)/);
  assert.doesNotMatch(stripe, /testEnv: __DEV__/);
  assert.match(stripe, /import \{ isStripeTestKey \} from '\.\.\/utils\/walletDiagnostic'/);
});

test('orders and gifts share the PaymentSheet that carries applePay and googlePay', () => {
  const sheet = stripe.slice(stripe.indexOf('async function presentSheetForParams'));
  assert.match(sheet, /applePay: \{\s*merchantCountryCode: 'US'/);
  assert.match(sheet, /googlePay: \{\s*merchantCountryCode: 'US'/);
  const gift = stripe.slice(stripe.indexOf('export async function holdGiftPayment'));
  assert.match(gift, /return await presentSheetForParams\(data\)/);
  assert.match(stripe, /const params = await fetchPaymentSheetParams\(order\);\s*return await presentSheetForParams\(params\)/);
});
