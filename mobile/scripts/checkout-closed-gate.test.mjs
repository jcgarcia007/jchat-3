// Unit tests for utils/checkoutGate.ts: the checkout refuses an order when the venue's clock (read in ITS time zone) says closed
// OR the server answered 409 venue_closed. Run from mobile/:  node --test scripts/checkout-closed-gate.test.mjs  (also try TZ=Asia/Tokyo)
// 2026-01-07 is a WEDNESDAY in winter (New York = UTC-5).

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const dir = mkdtempSync(join(tmpdir(), 'checkout-gate-'));
const compile = (name) => {
  const src = readFileSync(new URL(`../utils/${name}.ts`, import.meta.url), 'utf8').replace(/from '\.\/hours'/, "from './hours.mjs'");
  writeFileSync(join(dir, `${name}.mjs`), ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText);
};
compile('hours');
compile('checkoutGate');
const { venueBlocksCheckout, VENUE_CLOSED_CODE } = await import(pathToFileURL(join(dir, 'checkoutGate.mjs')).href);
const { DAY_ORDER } = await import(pathToFileURL(join(dir, 'hours.mjs')).href);

const NY = 'America/New_York';
const ny = (hour, minute = 0) => new Date(Date.UTC(2026, 0, 7, hour + 5, minute));
const everyDay = (entry) => Object.fromEntries(DAY_ORDER.map((d) => [d, entry]));
const nineToFive = everyDay({ open: '09:00', close: '17:00' });
const closedAll = everyDay({ open: '00:00', close: '00:00', closed: true });

test('open by the venue clock: not blocked', () => {
  assert.equal(venueBlocksCheckout({ hours: nineToFive, timezone: NY, now: ny(12) }), false);
});
test('closed by the venue clock: blocked', () => {
  assert.equal(venueBlocksCheckout({ hours: nineToFive, timezone: NY, now: ny(22) }), true);
  assert.equal(venueBlocksCheckout({ hours: closedAll, timezone: NY, now: ny(12) }), true);
});
test('the clock is read in the venue zone, not the phone zone', () => {
  assert.equal(venueBlocksCheckout({ hours: nineToFive, timezone: NY, now: ny(12) }), false);
  assert.equal(venueBlocksCheckout({ hours: nineToFive, timezone: 'Asia/Tokyo', now: ny(12) }), true);
});
test('unknown hours are not "closed"', () => {
  assert.equal(venueBlocksCheckout({ hours: null, timezone: NY, now: ny(22) }), false);
  assert.equal(venueBlocksCheckout({ hours: undefined, timezone: null, now: ny(22) }), false);
});
test('server 409 venue_closed blocks even when the clock says open or hours are unknown', () => {
  assert.equal(venueBlocksCheckout({ hours: nineToFive, timezone: NY, now: ny(12), serverCode: VENUE_CLOSED_CODE }), true);
  assert.equal(venueBlocksCheckout({ hours: null, timezone: null, now: ny(12), serverCode: 'VENUE_CLOSED' }), true);
});
test('other server codes do not block on their own', () => {
  assert.equal(venueBlocksCheckout({ hours: nineToFive, timezone: NY, now: ny(12), serverCode: 'TOTAL_CHANGED' }), false);
  assert.equal(venueBlocksCheckout({ hours: nineToFive, timezone: NY, now: ny(12), serverCode: null }), false);
});
