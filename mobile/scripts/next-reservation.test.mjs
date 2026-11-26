// Unit tests for utils/nextReservation.ts ("Your next reservation": which one, until when, how it reads). Run from mobile/:
//   node --test scripts/next-reservation.test.mjs
// The phone's zone is Tokyo on purpose: the card follows the VENUE's zone.
process.env.TZ = 'Asia/Tokyo';

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const dir = mkdtempSync(join(tmpdir(), 'next-reservation-'));
const opts = { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } };
for (const name of ['reservationFlow', 'nextReservation']) {
  let { outputText } = ts.transpileModule(readFileSync(new URL(`../utils/${name}.ts`, import.meta.url), 'utf8'), opts);
  outputText = outputText.replace(/from '\.\/reservationFlow'/g, "from './reservationFlow.mjs'");
  writeFileSync(join(dir, `${name}.mjs`), outputText);
}
const N = await import(pathToFileURL(join(dir, 'nextReservation.mjs')).href);

const NY = 'America/New_York';
const HOUR = 3600_000;
// Sat 2026-11-14 10:00 in New York (EST, UTC−5) = 15:00Z
const NOW = Date.parse('2026-11-14T15:00:00Z');
const R = (status, offsetMs, extra = {}) => ({ status, reserved_at: new Date(NOW + offsetMs).toISOString(), ...extra });
const WORDS = { en: { today: 'Today', tomorrow: 'Tomorrow' }, es: { today: 'Hoy', tomorrow: 'Mañana' } };

test('only pending and confirmed reservations can be on the card', () => {
  for (const s of ['cancelled', 'rejected', 'arrived', 'no_show', 'whatever']) assert.equal(N.isOnCard(R(s, HOUR), NOW), false, s);
  assert.equal(N.isOnCard(R('pending', HOUR), NOW), true);
  assert.equal(N.isOnCard(R('confirmed', HOUR), NOW), true);
});

test('it leaves 2 hours after its time (the exact instant is already gone)', () => {
  assert.equal(N.isOnCard(R('confirmed', -2 * HOUR + 1000), NOW), true);
  assert.equal(N.isOnCard(R('confirmed', -2 * HOUR), NOW), false);
  assert.equal(N.isOnCard(R('confirmed', -5 * HOUR), NOW), false);
  assert.equal(N.isOnCard(R('confirmed', -30 * 60_000), NOW), true); // started 30 min ago: still there
});

test('an unreadable time never shows', () => {
  assert.equal(N.isOnCard({ status: 'pending', reserved_at: 'nope' }, NOW), false);
});

test('pickNext: the nearest one, the others counted ("and 1 more")', () => {
  const rows = [R('pending', 48 * HOUR, { id: 'c' }), R('confirmed', 5 * HOUR, { id: 'a' }), R('pending', 8 * HOUR, { id: 'b' }), R('cancelled', HOUR, { id: 'x' }), R('confirmed', -9 * HOUR, { id: 'old' })];
  const { next, more } = N.pickNext(rows, NOW);
  assert.equal(next.id, 'a');
  assert.equal(more, 2);
});

test('pickNext: nothing coming → null and 0', () => {
  assert.deepEqual(N.pickNext([], NOW), { next: null, more: 0 });
  assert.deepEqual(N.pickNext([R('rejected', HOUR)], NOW), { next: null, more: 0 });
});

test('pickNext: a reservation that already started wins over a later one (it is the one to show until it expires)', () => {
  const { next } = N.pickNext([R('confirmed', HOUR, { id: 'later' }), R('confirmed', -HOUR, { id: 'started' })], NOW);
  assert.equal(next.id, 'started');
});

test('the card disappears on its own: the timer is set to the expiry of the shown reservation', () => {
  assert.equal(N.msUntilCardChanges([], NOW), null);
  assert.equal(N.msUntilCardChanges([R('confirmed', -HOUR)], NOW), HOUR); // expires 1 h from now
  assert.equal(N.msUntilCardChanges([R('confirmed', 3 * 24 * HOUR)], NOW), 24 * HOUR); // clamped to a day
  assert.equal(N.msUntilCardChanges([R('confirmed', -2 * HOUR + 10)], NOW), 1000); // never a busy loop
  // after the expiry nothing is picked
  const rows = [R('confirmed', -HOUR)];
  assert.notEqual(N.pickNext(rows, NOW).next, null);
  assert.equal(N.pickNext(rows, NOW + HOUR).next, null);
});

test('relative date: today / tomorrow / a date, in the venue zone (en)', () => {
  const at = (iso) => N.nextWhenLabel(iso, NY, NOW, 'en', WORDS.en);
  assert.equal(at('2026-11-15T01:00:00Z'), 'Today 8:00 PM'); // 20:00 NY on Sat 14th
  assert.equal(at('2026-11-15T22:00:00Z'), 'Tomorrow 5:00 PM'); // 17:00 NY on Sun 15th
  assert.equal(at('2026-11-22T01:00:00Z'), 'Sat, Nov 21 · 8:00 PM');
});

test('relative date: es reads the same way, with 24 h clock like the booking flow', () => {
  const at = (iso) => N.nextWhenLabel(iso, NY, NOW, 'es', WORDS.es);
  assert.equal(at('2026-11-15T01:00:00Z'), 'Hoy 20:00');
  assert.equal(at('2026-11-15T22:00:00Z'), 'Mañana 17:00');
  assert.match(at('2026-11-22T01:00:00Z'), /^sáb 21 nov · 20:00$/);
});

test('"today" is the venue\'s today, not the phone\'s (Tokyo is already on the 15th)', () => {
  // 2026-11-15T01:00Z is the 15th in Tokyo but 20:00 on the 14th in New York
  assert.equal(N.nextWhenLabel('2026-11-15T01:00:00Z', NY, NOW, 'en', WORDS.en), 'Today 8:00 PM');
  // and a Dominican venue (UTC−4) at the same instant: 21:00 on the 14th
  assert.equal(N.nextWhenLabel('2026-11-15T01:00:00Z', 'America/Santo_Domingo', NOW, 'en', WORDS.en), 'Today 9:00 PM');
});

test('a missing or invalid zone falls back to New York; an unreadable date gives an empty label', () => {
  assert.equal(N.nextWhenLabel('2026-11-15T01:00:00Z', null, NOW, 'en', WORDS.en), 'Today 8:00 PM');
  assert.equal(N.nextWhenLabel('2026-11-15T01:00:00Z', 'Not/AZone', NOW, 'en', WORDS.en), 'Today 8:00 PM');
  assert.equal(N.nextWhenLabel('nope', NY, NOW, 'en', WORDS.en), '');
});

test('directionsUrl: coordinates → a maps link; anything else → null', () => {
  assert.equal(N.directionsUrl(18.4861, -69.9312), 'https://www.google.com/maps/dir/?api=1&destination=18.4861,-69.9312');
  assert.equal(N.directionsUrl(null, -69.9), null);
  assert.equal(N.directionsUrl('18', '-69'), null);
  assert.equal(N.directionsUrl(NaN, 1), null);
  assert.equal(N.directionsUrl(91, 0), null);
  assert.equal(N.directionsUrl(0, 181), null);
});

test('H-031: the short date of a later day does not depend on Intl.formatToParts (own tables)', () => {
  const orig = Intl.DateTimeFormat.prototype.formatToParts;
  Intl.DateTimeFormat.prototype.formatToParts = function () { return []; };
  try {
    assert.equal(N.shortDateLabel('2026-11-15', 'en'), 'Sun, Nov 15');
    assert.equal(N.shortDateLabel('2026-11-15', 'es'), 'dom 15 nov');
    assert.equal(N.shortDateLabel('2026-09-05', 'es'), 'sáb 5 sept');
    assert.equal(N.shortDateLabel('2026-09-05', 'en'), 'Sat, Sep 5');
  } finally {
    Intl.DateTimeFormat.prototype.formatToParts = orig;
  }
});
