// Unit tests for utils/reservationTime.ts (local date + time → the instant sent to the database). Run from mobile/:
//   node --test scripts/reservation-time.test.mjs
// The time zone is set through process.env.TZ BEFORE the first Date is built (Node re-reads it on assignment).
process.env.TZ = 'America/New_York';

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const dir = mkdtempSync(join(tmpdir(), 'reservation-time-'));
const source = readFileSync(new URL('../utils/reservationTime.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
writeFileSync(join(dir, 'reservationTime.mjs'), outputText);
const { reservedAtIso, isFutureReservation } = await import(pathToFileURL(join(dir, 'reservationTime.mjs')).href);

test('19:00 in New York in daylight time (EDT, UTC-4) is 23:00Z the same day', () => {
  assert.equal(reservedAtIso('2026-10-25', '19:00'), '2026-10-25T23:00:00.000Z');
});

test('19:00 in New York in standard time (EST, UTC-5) is 00:00Z the NEXT day', () => {
  assert.equal(reservedAtIso('2026-01-15', '19:00'), '2026-01-16T00:00:00.000Z');
});

test('the offset follows the date, not today: either side of the clock change', () => {
  // US clocks: forward on 2026-03-08 (2:00 → 3:00), back on 2026-11-01 (2:00 → 1:00)
  assert.equal(reservedAtIso('2026-03-07', '19:00'), '2026-03-08T00:00:00.000Z'); // EST
  assert.equal(reservedAtIso('2026-03-09', '19:00'), '2026-03-09T23:00:00.000Z'); // EDT
  assert.equal(reservedAtIso('2026-10-31', '19:00'), '2026-10-31T23:00:00.000Z'); // EDT
  assert.equal(reservedAtIso('2026-11-02', '19:00'), '2026-11-03T00:00:00.000Z'); // EST
});

test('on the spring-forward day the times around the jump are real, the skipped hour is not', () => {
  assert.equal(reservedAtIso('2026-03-08', '01:30'), '2026-03-08T06:30:00.000Z'); // EST
  assert.equal(reservedAtIso('2026-03-08', '03:30'), '2026-03-08T07:30:00.000Z'); // EDT
  assert.equal(reservedAtIso('2026-03-08', '02:30'), null); // does not exist on a New York clock
});

test('on the fall-back day the repeated hour still gives a valid instant', () => {
  const iso = reservedAtIso('2026-11-01', '01:30');
  assert.ok(iso === '2026-11-01T05:30:00.000Z' || iso === '2026-11-01T06:30:00.000Z', String(iso));
});

test('midnight and the last minute of the day', () => {
  assert.equal(reservedAtIso('2026-10-25', '00:00'), '2026-10-25T04:00:00.000Z');
  assert.equal(reservedAtIso('2026-10-25', '23:59'), '2026-10-26T03:59:00.000Z');
});

test('invalid dates and times give null', () => {
  for (const [date, time] of [
    ['2026-02-30', '19:00'],
    ['2026-13-01', '19:00'],
    ['2026-00-10', '19:00'],
    ['2026-10-32', '19:00'],
    ['2026-10-25', '24:00'],
    ['2026-10-25', '25:00'],
    ['2026-10-25', '19:60'],
    ['abc', '19:00'],
    ['2026-10-25', 'xx:yy'],
    ['2026-1-5', '19:00'],
    ['2026-10-25', '7:00'],
    ['', ''],
    ['0099-10-25', '19:00'],
  ]) {
    assert.equal(reservedAtIso(date, time), null, `${date} ${time}`);
  }
});

test('a leap day exists only in leap years', () => {
  assert.equal(reservedAtIso('2028-02-29', '12:00'), '2028-02-29T17:00:00.000Z');
  assert.equal(reservedAtIso('2027-02-29', '12:00'), null);
});

test('isFutureReservation compares the same local instant with now', () => {
  const now = new Date(2026, 9, 25, 18, 30, 0); // 6:30 pm local
  assert.equal(isFutureReservation('2026-10-25', '19:00', now), true);
  assert.equal(isFutureReservation('2026-10-25', '18:30', now), false); // the same minute is not the future
  assert.equal(isFutureReservation('2026-10-25', '18:00', now), false);
  assert.equal(isFutureReservation('2026-10-26', '00:00', now), true);
  assert.equal(isFutureReservation('2026-10-25', '19:00', now.getTime()), true);
  assert.equal(isFutureReservation('2026-02-30', '19:00', now), false);
});

test('another zone: 19:00 in Madrid (CEST, UTC+2) is 17:00Z', () => {
  process.env.TZ = 'Europe/Madrid';
  assert.equal(reservedAtIso('2026-07-10', '19:00'), '2026-07-10T17:00:00.000Z');
  assert.equal(reservedAtIso('2026-01-10', '19:00'), '2026-01-10T18:00:00.000Z'); // CET, UTC+1
  process.env.TZ = 'America/New_York';
});
