// JChat 3.0 — every gift error code the client recognises has a translated message (es + en), and `not_found`
// (raised by gift_offer_view for a gift that is not yours / does not exist) is one of them, so it no longer falls into the generic text.
// Run: node --test scripts/gift-error-codes.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../services/giftOffers.ts', import.meta.url), 'utf8');
const known = [...src.slice(src.indexOf('const KNOWN'), src.indexOf('];', src.indexOf('const KNOWN'))).matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
const union = src.slice(src.indexOf('export type GiftErrorCode'), src.indexOf('const KNOWN'));
const errors = (l) => JSON.parse(readFileSync(new URL(`../i18n/locales/${l}/chat.json`, import.meta.url), 'utf8')).gift.errors;

test('not_found is a known gift error code (type and list)', () => {
  assert.ok(known.includes('not_found'), 'KNOWN lacks not_found');
  assert.match(union, /'not_found'/, 'GiftErrorCode lacks not_found');
});

test('every known code has a message in es and en, and not_found reads as a generic "gift not found"', () => {
  for (const l of ['es', 'en']) {
    const e = errors(l);
    for (const code of known) assert.ok(typeof e[code] === 'string' && e[code].length > 0, `${l}: no message for ${code}`);
  }
  assert.equal(errors('es').not_found, 'No encontramos este regalo.');
  assert.equal(errors('en').not_found, "We couldn't find this gift.");
});
