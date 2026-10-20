// Unit tests for utils/birthDate.ts (the Day / Month / Year boxes of ConfirmAgeScreen). Run from mobile/:
//   node --test scripts/birth-date.test.mjs
// The module is TypeScript: it is transpiled with the repo's own `typescript` into a temp dir and imported.

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const dir = mkdtempSync(join(tmpdir(), 'birth-date-'));
const source = readFileSync(new URL('../utils/birthDate.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
writeFileSync(join(dir, 'birthDate.mjs'), outputText);
const { parseBirthDate, splitPastedDate, fieldOrder } = await import(pathToFileURL(join(dir, 'birthDate.mjs')).href);

// A fixed "now" (afternoon, local time) so "today" and "tomorrow" never depend on when the test runs.
const NOW = new Date(2026, 9, 20, 15, 30, 0);
const parse = (day, month, year) => parseBirthDate({ day, month, year }, NOW);

test('a real date is ok and comes back as a LOCAL midnight Date', () => {
  const result = parse('14', '03', '1995');
  assert.equal(result.ok, true);
  assert.equal(result.date.getFullYear(), 1995);
  assert.equal(result.date.getMonth(), 2);
  assert.equal(result.date.getDate(), 14);
  assert.equal(result.date.getHours(), 0);
  assert.equal(result.date.getMinutes(), 0);
});

test('29/02 in a leap year is ok (2000 is a leap year, divisible by 400)', () => {
  const result = parse('29', '02', '2000');
  assert.equal(result.ok, true);
  assert.equal(result.date.getMonth(), 1);
  assert.equal(result.date.getDate(), 29);
});

test('29/02 in a non-leap year is invalid (1999, and 1900 which is not divisible by 400)', () => {
  assert.deepEqual(parse('29', '02', '1999'), { ok: false, reason: 'invalid' });
  assert.deepEqual(parse('29', '02', '1900'), { ok: false, reason: 'invalid' });
});

test('days that the month does not have are invalid (31/04, 30/02, 32/01)', () => {
  assert.deepEqual(parse('31', '04', '1990'), { ok: false, reason: 'invalid' });
  assert.deepEqual(parse('30', '02', '2000'), { ok: false, reason: 'invalid' });
  assert.deepEqual(parse('32', '01', '1990'), { ok: false, reason: 'invalid' });
  assert.equal(parse('31', '12', '1990').ok, true);
});

test('day 00 and month 00 or 13 are invalid', () => {
  assert.deepEqual(parse('00', '05', '1990'), { ok: false, reason: 'invalid' });
  assert.deepEqual(parse('0', '5', '1990'), { ok: false, reason: 'invalid' });
  assert.deepEqual(parse('10', '00', '1990'), { ok: false, reason: 'invalid' });
  assert.deepEqual(parse('10', '13', '1990'), { ok: false, reason: 'invalid' });
});

test('one-digit day and month are accepted', () => {
  const result = parse('5', '3', '1995');
  assert.equal(result.ok, true);
  assert.equal(result.date.getDate(), 5);
  assert.equal(result.date.getMonth(), 2);
});

test('a year with fewer than 4 digits is incomplete, a 5-digit year is invalid', () => {
  assert.deepEqual(parse('14', '03', '199'), { ok: false, reason: 'incomplete' });
  assert.deepEqual(parse('14', '03', '1'), { ok: false, reason: 'incomplete' });
  assert.deepEqual(parse('14', '03', '19955'), { ok: false, reason: 'invalid' });
});

test('an empty box is incomplete', () => {
  assert.deepEqual(parse('', '03', '1995'), { ok: false, reason: 'incomplete' });
  assert.deepEqual(parse('14', '', '1995'), { ok: false, reason: 'incomplete' });
  assert.deepEqual(parse('14', '03', ''), { ok: false, reason: 'incomplete' });
  assert.deepEqual(parse('', '', ''), { ok: false, reason: 'incomplete' });
  assert.deepEqual(parse('  ', '03', '1995'), { ok: false, reason: 'incomplete' });
});

test('the year must be 1900 or later', () => {
  assert.deepEqual(parse('31', '12', '1899'), { ok: false, reason: 'invalid' });
  assert.equal(parse('01', '01', '1900').ok, true);
});

test('anything that is not a digit is invalid', () => {
  assert.deepEqual(parse('1a', '03', '1995'), { ok: false, reason: 'invalid' });
  assert.deepEqual(parse('14', '0-', '1995'), { ok: false, reason: 'invalid' });
  assert.deepEqual(parse('14', '03', '19x5'), { ok: false, reason: 'invalid' });
  assert.deepEqual(parse('-1', '03', '1995'), { ok: false, reason: 'invalid' });
});

test('tomorrow is future, today is ok, yesterday is ok', () => {
  assert.deepEqual(parse('21', '10', '2026'), { ok: false, reason: 'future' });
  assert.equal(parse('20', '10', '2026').ok, true);
  assert.equal(parse('19', '10', '2026').ok, true);
});

test('today is ok even late at night and tomorrow is future even just after midnight', () => {
  const lateNight = new Date(2026, 9, 20, 23, 59, 59);
  const justAfterMidnight = new Date(2026, 9, 20, 0, 0, 1);
  assert.equal(parseBirthDate({ day: '20', month: '10', year: '2026' }, lateNight).ok, true);
  assert.deepEqual(parseBirthDate({ day: '21', month: '10', year: '2026' }, justAfterMidnight), { ok: false, reason: 'future' });
});

test('a later month or year is future', () => {
  assert.deepEqual(parse('01', '11', '2026'), { ok: false, reason: 'future' });
  assert.deepEqual(parse('01', '01', '2027'), { ok: false, reason: 'future' });
});

test('without the `now` seam it uses the real clock', () => {
  const now = new Date();
  const today = parseBirthDate({ day: String(now.getDate()), month: String(now.getMonth() + 1), year: String(now.getFullYear()) });
  assert.equal(today.ok, true);
});

// ── pasted dates ─────────────────────────────────────────────────────────────────────────────────────────────────
test('splitPastedDate: the 4 formats, day-month-year order', () => {
  const expected = { day: '14', month: '03', year: '1995' };
  assert.deepEqual(splitPastedDate('14/03/1995', 'dmy'), expected);
  assert.deepEqual(splitPastedDate('14-03-1995', 'dmy'), expected);
  assert.deepEqual(splitPastedDate('14031995', 'dmy'), expected);
  assert.deepEqual(splitPastedDate('14.03.1995', 'dmy'), expected);
  assert.deepEqual(splitPastedDate('14 03 1995', 'dmy'), expected);
});

test('splitPastedDate: month-day-year order reads 03/14/1995 as March 14th', () => {
  const expected = { day: '14', month: '03', year: '1995' };
  assert.deepEqual(splitPastedDate('03/14/1995', 'mdy'), expected);
  assert.deepEqual(splitPastedDate('03-14-1995', 'mdy'), expected);
  assert.deepEqual(splitPastedDate('03141995', 'mdy'), expected);
});

test('splitPastedDate: the same text lands differently in each order', () => {
  assert.deepEqual(splitPastedDate('05/06/1990', 'dmy'), { day: '05', month: '06', year: '1990' });
  assert.deepEqual(splitPastedDate('05/06/1990', 'mdy'), { day: '06', month: '05', year: '1990' });
});

test('splitPastedDate: one-digit parts and surrounding spaces', () => {
  assert.deepEqual(splitPastedDate('  5/3/1995  ', 'dmy'), { day: '5', month: '3', year: '1995' });
  assert.deepEqual(splitPastedDate('5/3/1995', 'mdy'), { day: '3', month: '5', year: '1995' });
});

test('splitPastedDate: what is not a date gives null', () => {
  for (const text of ['', '   ', 'hola', '14/03/95', '14/03', '1403199', '140319955', '14/03/19955', '14//03/1995x', '1995-03-14', 'a4/03/1995']) {
    assert.equal(splitPastedDate(text, 'dmy'), null, JSON.stringify(text));
  }
});

test('splitPastedDate only splits: whether the date exists is parseBirthDate', () => {
  const parts = splitPastedDate('31/02/1999', 'dmy');
  assert.deepEqual(parts, { day: '31', month: '02', year: '1999' });
  assert.deepEqual(parseBirthDate(parts, NOW), { ok: false, reason: 'invalid' });
});

test('a pasted date goes through splitPastedDate and parseBirthDate end to end', () => {
  const dmy = parseBirthDate(splitPastedDate('14/03/1995', 'dmy'), NOW);
  const mdy = parseBirthDate(splitPastedDate('03/14/1995', 'mdy'), NOW);
  assert.equal(dmy.ok, true);
  assert.equal(mdy.ok, true);
  assert.equal(dmy.date.getTime(), mdy.date.getTime());
});

// ── field order ──────────────────────────────────────────────────────────────────────────────────────────────────
test('fieldOrder: es is day-month-year, en is month-day-year', () => {
  assert.equal(fieldOrder('es'), 'dmy');
  assert.equal(fieldOrder('en'), 'mdy');
});

test('fieldOrder: regional codes follow their language, unknown ones fall back to month-day-year', () => {
  assert.equal(fieldOrder('es-MX'), 'dmy');
  assert.equal(fieldOrder('ES'), 'dmy');
  assert.equal(fieldOrder('en-US'), 'mdy');
  assert.equal(fieldOrder('pt'), 'mdy');
  assert.equal(fieldOrder(''), 'mdy');
});
