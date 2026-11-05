// The Verified plan is not sold in the store v1 (decision 2026-10-14): no screen, text or link may send people to
// Stripe Checkout in the browser (App Store 3.1.1 / Google Play Payments). Run from mobile/:
//   node --test scripts/no-dead-pricing.test.mjs
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const SKIP = new Set(['node_modules', 'scripts', 'ios', 'android', '.expo', 'dist', 'coverage']);
const EXT = /\.(ts|tsx|js|jsx|json)$/;

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (EXT.test(name)) yield full;
  }
}

test('no source mentions the dead Stripe-in-browser purchase', () => {
  // 'stripe.com/pay' must not match the docs link 'docs.stripe.com/payments/...'
  const needles = [/checkout\.stripe\.com/, /stripe\.com\/pay(?![a-z])/, /Stripe Checkout/, /PricingScreen/];
  const hits = [];
  for (const file of walk(root)) {
    const text = readFileSync(file, 'utf8');
    for (const n of needles) if (n.test(text)) hits.push(`${file.slice(root.length)}: ${n}`);
  }
  assert.deepEqual(hits, []);
});

test('the screen and its texts are gone', () => {
  assert.equal(existsSync(join(root, 'screens/settings/PricingScreen.tsx')), false);
  for (const l of ['es', 'en']) assert.equal(existsSync(join(root, `i18n/locales/${l}/pricing.json`)), false);
});
