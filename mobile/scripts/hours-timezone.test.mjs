// Unit tests for the time-zone clock of utils/hours.ts: "open / closed" is read in the BUSINESS's zone (businesses.timezone), not the phone's.
// Same cases, same instants as supabase/tests/08_business_open_now.sql: the app and business_is_open_now (migration 257) must agree.
// Run from mobile/:  node --test scripts/hours-timezone.test.mjs   (the result must not depend on the machine's own zone: also try TZ=Asia/Tokyo)
// 2026-01-07 is a WEDNESDAY, in winter (New York = UTC-5).

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const dir = mkdtempSync(join(tmpdir(), 'hours-tz-'));
const source = readFileSync(new URL('../utils/hours.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
writeFileSync(join(dir, 'hours.mjs'), outputText);
const { getOpenStatus, isOpenNow, closesAtLabel, opensAtLabel, todayIndexIn, DAY_ORDER } = await import(pathToFileURL(join(dir, 'hours.mjs')).href);

const NY = 'America/New_York';
/** A New York wall-clock instant: January <day>, <hour>:<minute> (EST = UTC-5). */
const ny = (day, hour, minute = 0) => new Date(Date.UTC(2026, 0, day, hour + 5, minute));
const everyDay = (entry) => Object.fromEntries(DAY_ORDER.map((d) => [d, entry]));
const closedAll = everyDay({ open: '00:00', close: '00:00', closed: true });
const nineToFive = everyDay({ open: '09:00', close: '17:00' });

test('open / closed inside one day (the closing minute is closed)', () => {
  assert.equal(getOpenStatus(nineToFive, ny(7, 14), NY), 'open');
  assert.equal(getOpenStatus(nineToFive, ny(7, 9), NY), 'open');
  assert.equal(getOpenStatus(nineToFive, ny(7, 8, 59), NY), 'closed');
  assert.equal(getOpenStatus(nineToFive, ny(7, 17), NY), 'closed');
  assert.equal(getOpenStatus(nineToFive, ny(7, 18), NY), 'closed');
});

test('across midnight: Wed 22:00–02:00 is open Wed 23:00 and Thu 01:00, closed Thu 02:00 and Wed 21:59', () => {
  const hours = { ...closedAll, wed: { open: '22:00', close: '02:00' } };
  assert.equal(getOpenStatus(hours, ny(7, 23), NY), 'open');
  assert.equal(getOpenStatus(hours, ny(8, 1), NY), 'open');
  assert.equal(getOpenStatus(hours, ny(8, 2), NY), 'closed');
  assert.equal(getOpenStatus(hours, ny(7, 21, 59), NY), 'closed');
});

test('all day (00:00–23:59)', () => {
  const hours = { ...closedAll, wed: { open: '00:00', close: '23:59' } };
  assert.equal(getOpenStatus(hours, ny(7, 3), NY), 'open');
  assert.equal(getOpenStatus(hours, ny(7, 23, 59), NY), 'open');
});

test('a closed day', () => {
  assert.equal(getOpenStatus(closedAll, ny(7, 14), NY), 'closed');
});

test('unknown hours → unknown (never "closed")', () => {
  assert.equal(getOpenStatus({}, ny(7, 14), NY), 'unknown');
  assert.equal(getOpenStatus({ ...nineToFive, wed: { open: '9am', close: '5pm' } }, ny(7, 14), NY), 'unknown');
  assert.equal(getOpenStatus({ ...nineToFive, wed: { open: '10:00', close: '10:00' } }, ny(7, 14), NY), 'unknown');
  assert.equal(getOpenStatus('not an object', ny(7, 14), NY), 'unknown');
  assert.equal(getOpenStatus(null, ny(7, 14), NY), 'unknown');
});

test("the venue's zone, not the device's: the same instant is Tue 22:00 in New York (closed) and Wed 12:00 in Tokyo (open)", () => {
  const instant = ny(6, 22);
  assert.equal(getOpenStatus(nineToFive, instant, NY), 'closed');
  assert.equal(getOpenStatus(nineToFive, instant, 'Asia/Tokyo'), 'open');
  assert.equal(isOpenNow(nineToFive, instant, 'Asia/Tokyo'), true);
  assert.equal(todayIndexIn(instant, NY), 2); // Tuesday
  assert.equal(todayIndexIn(instant, 'Asia/Tokyo'), 3); // Wednesday
});

test('blank / null zone → America/New_York; an unknown zone → unknown (not blocked, not "closed")', () => {
  const instant = ny(6, 22);
  assert.equal(getOpenStatus(nineToFive, instant, ''), 'closed');
  assert.equal(getOpenStatus(nineToFive, instant, null), 'closed');
  assert.equal(getOpenStatus(nineToFive, instant, 'Mars/Phobos'), 'unknown');
  assert.equal(todayIndexIn(instant, 'Mars/Phobos'), null);
});

test('midnight in the zone reads as 00:00 (not 24:00)', () => {
  const hours = { ...closedAll, thu: { open: '00:00', close: '23:59' } };
  assert.equal(getOpenStatus(hours, ny(8, 0), NY), 'open');
});

test('the labels follow the zone: closes at / opens at', () => {
  assert.equal(closesAtLabel(nineToFive, 'en', ny(7, 14), NY), '5:00 pm');
  assert.equal(closesAtLabel(nineToFive, 'en', ny(7, 14), 'Asia/Tokyo'), null); // 04:00 Thu in Tokyo: closed there
  assert.deepEqual(opensAtLabel(nineToFive, 'en', ny(7, 18), NY), { time: '9:00 am', when: 'tomorrow', dayIndex: 4 });
  assert.deepEqual(opensAtLabel(nineToFive, 'en', ny(7, 7), NY), { time: '9:00 am', when: 'today', dayIndex: 3 });
  assert.equal(opensAtLabel(nineToFive, 'en', ny(7, 7), 'Mars/Phobos'), null);
});

test('without a zone the device clock is used (callers that have none keep working)', () => {
  const local = new Date(2026, 0, 7, 14, 0);
  assert.equal(getOpenStatus(nineToFive, local), 'open');
  assert.equal(getOpenStatus(nineToFive, new Date(2026, 0, 7, 20, 0)), 'closed');
});
