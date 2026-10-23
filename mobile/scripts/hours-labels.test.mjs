// Unit tests for the hour labels of utils/hours.ts (the status chip and the hours grid of the business card):
// format12h, closesAtLabel, opensAtLabel (time + day), weekdayName and formatDayRange.
// Run from mobile/:  node --test scripts/hours-labels.test.mjs
// The module is TypeScript: it is transpiled with the repo's own `typescript` into a temp dir and imported.

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const dir = mkdtempSync(join(tmpdir(), 'hours-labels-'));
const source = readFileSync(new URL('../utils/hours.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
writeFileSync(join(dir, 'hours.mjs'), outputText);
const { format12h, closesAtLabel, opensAtLabel, weekdayName, formatDayRange, DAY_ORDER } = await import(pathToFileURL(join(dir, 'hours.mjs')).href);

/** Local date at a time of day (2026-10-22 is a Thursday; the hours below do not depend on the weekday unless said). */
const at = (hour, minute = 0) => new Date(2026, 9, 22, hour, minute);
const everyDay = (entry) => Object.fromEntries(DAY_ORDER.map((day) => [day, entry]));

// ── format12h ────────────────────────────────────────────────────────────────
test('format12h: lower-case am / pm, no leading zero on the hour', () => {
  assert.equal(format12h('09:00'), '9:00 am');
  assert.equal(format12h('14:05'), '2:05 pm');
  assert.equal(format12h('18:30'), '6:30 pm');
  assert.equal(format12h('02:00'), '2:00 am');
});

test('format12h: midnight and noon are 12', () => {
  assert.equal(format12h('00:00'), '12:00 am');
  assert.equal(format12h('12:00'), '12:00 pm');
  assert.equal(format12h('24:00'), '12:00 am');
  assert.equal(format12h(1440), '12:00 am');
  assert.equal(format12h(13 * 60 + 15), '1:15 pm');
});

test('format12h: an invalid time is null', () => {
  assert.equal(format12h('x'), null);
  assert.equal(format12h(null), null);
  assert.equal(format12h('25:00'), null);
  assert.equal(format12h(-5), null);
});

// ── closesAtLabel ────────────────────────────────────────────────────────────
test('closes today: open 18:00–23:00, at 20:00 it closes at 11:00 pm, the same in es and en', () => {
  const hours = everyDay({ open: '18:00', close: '23:00' });
  assert.equal(closesAtLabel(hours, 'en', at(20)), '11:00 pm');
  assert.equal(closesAtLabel(hours, 'es', at(20)), '11:00 pm');
  assert.equal(opensAtLabel(hours, 'en', at(20)), null, 'open: no opening label');
});

test('closes at 02:00: 20:00–02:00 reads 2:00 am at 22:00 and also at 01:00', () => {
  const hours = everyDay({ open: '20:00', close: '02:00' });
  assert.equal(closesAtLabel(hours, 'en', at(22)), '2:00 am');
  assert.equal(closesAtLabel(hours, 'es', at(1)), '2:00 am');
});

test('open all day has no closing time', () => {
  assert.equal(closesAtLabel(everyDay({ open: '00:00', close: '23:59' }), 'en', at(15)), null);
});

// ── opensAtLabel ─────────────────────────────────────────────────────────────
test('opens later today: closed at 10:00, opens at 6:00 pm today', () => {
  const hours = everyDay({ open: '18:00', close: '23:00' });
  assert.equal(closesAtLabel(hours, 'en', at(10)), null, 'closed: no closing label');
  assert.deepEqual(opensAtLabel(hours, 'en', at(10)), { time: '6:00 pm', when: 'today', dayIndex: at(10).getDay() });
  assert.deepEqual(opensAtLabel(hours, 'es', at(10)), { time: '6:00 pm', when: 'today', dayIndex: at(10).getDay() });
});

test('opens tomorrow: closed for the night, opens tomorrow at 6:00 pm', () => {
  const hours = everyDay({ open: '18:00', close: '23:00' });
  const now = at(23, 30);
  assert.deepEqual(opensAtLabel(hours, 'en', now), { time: '6:00 pm', when: 'tomorrow', dayIndex: (now.getDay() + 1) % 7 });
});

test('opens tomorrow when today is a closed day', () => {
  const now = at(12);
  const tomorrow = DAY_ORDER[(now.getDay() + 1) % 7];
  const hours = { [DAY_ORDER[now.getDay()]]: { open: '09:00', close: '17:00', closed: true }, [tomorrow]: { open: '10:30', close: '22:00' } };
  assert.deepEqual(opensAtLabel(hours, 'en', now), { time: '10:30 am', when: 'tomorrow', dayIndex: (now.getDay() + 1) % 7 });
});

test('opens in 3 days: another weekday, with its index', () => {
  const now = at(12);
  const inThree = (now.getDay() + 3) % 7;
  // The other days are closed (a missing day would read as "unknown", not "closed").
  const hours = { ...everyDay({ open: '09:00', close: '17:00', closed: true }), [DAY_ORDER[inThree]]: { open: '10:30', close: '22:00' } };
  const next = opensAtLabel(hours, 'es', now);
  assert.deepEqual(next, { time: '10:30 am', when: 'later', dayIndex: inThree });
  // The card writes the day with the language: the same index gives "domingo" in es and "Sunday" in en.
  assert.equal(weekdayName(0, 'es'), 'domingo');
  assert.equal(weekdayName(0, 'en'), 'Sunday');
});

test('no schedule or unreadable hours: both labels are null', () => {
  assert.equal(closesAtLabel(null, 'en', at(12)), null);
  assert.equal(opensAtLabel(null, 'en', at(12)), null);
  assert.equal(closesAtLabel({}, 'en', at(12)), null);
  assert.equal(opensAtLabel({}, 'en', at(12)), null);
  assert.equal(opensAtLabel(everyDay({ open: 'x', close: 'y' }), 'en', at(12)), null);
});

test('every day closed: nothing to announce', () => {
  assert.equal(opensAtLabel(everyDay({ open: '09:00', close: '17:00', closed: true }), 'en', at(12)), null);
});

// ── weekdayName, formatDayRange ──────────────────────────────────────────────
test('weekdayName: the full name in the language, any index wraps', () => {
  assert.equal(weekdayName(1, 'es'), 'lunes');
  assert.equal(weekdayName(1, 'en'), 'Monday');
  assert.equal(weekdayName(6, 'es'), 'sábado');
  assert.equal(weekdayName(7, 'en'), 'Sunday');
});

test('the hours grid reads 12 h too, in es and en', () => {
  const entry = { open: '09:00', close: '22:00' };
  assert.deepEqual(formatDayRange(entry, 'es'), { kind: 'range', text: '9:00 am – 10:00 pm' });
  assert.deepEqual(formatDayRange(entry, 'en'), { kind: 'range', text: '9:00 am – 10:00 pm' });
  assert.deepEqual(formatDayRange({ open: '09:00', close: '02:00' }, 'es'), { kind: 'range', text: '9:00 am – 2:00 am' });
  assert.deepEqual(formatDayRange({ open: '09:00', close: '17:00', closed: true }, 'en'), { kind: 'closed' });
  assert.deepEqual(formatDayRange(undefined, 'en'), { kind: 'unknown' });
});
