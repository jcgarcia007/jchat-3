// Unit tests for closesAtLabel / opensAtLabel in utils/hours.ts (the status chip of the business card).
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
const { closesAtLabel, opensAtLabel, DAY_ORDER } = await import(pathToFileURL(join(dir, 'hours.mjs')).href);

// Intl may put a narrow no-break space before AM / PM: compare with plain spaces.
const plain = (text) => (text === null ? null : text.replace(/\s/g, ' '));

/** Local date at a time of day (the day itself does not matter: the hours below cover every weekday). */
const at = (hour, minute = 0) => new Date(2026, 9, 22, hour, minute);
const everyDay = (entry) => Object.fromEntries(DAY_ORDER.map((day) => [day, entry]));

test('closes today: open 18:00–23:00, at 20:00 it closes at 11:00 PM', () => {
  const hours = everyDay({ open: '18:00', close: '23:00' });
  assert.equal(plain(closesAtLabel(hours, 'en', at(20))), '11:00 PM');
  assert.equal(opensAtLabel(hours, 'en', at(20)), null, 'open: no opening label');
});

test('closes after midnight: 20:00–02:00 closes at 2:00 AM, at 22:00 and also at 01:00', () => {
  const hours = everyDay({ open: '20:00', close: '02:00' });
  assert.equal(plain(closesAtLabel(hours, 'en', at(22))), '2:00 AM');
  assert.equal(plain(closesAtLabel(hours, 'en', at(1))), '2:00 AM');
});

test('closed before opening: opens later today at 6:00 PM', () => {
  const hours = everyDay({ open: '18:00', close: '23:00' });
  assert.equal(closesAtLabel(hours, 'en', at(10)), null, 'closed: no closing label');
  assert.equal(plain(opensAtLabel(hours, 'en', at(10))), '6:00 PM');
});

test('closed after closing: the next opening is tomorrow, 6:00 PM', () => {
  const hours = everyDay({ open: '18:00', close: '23:00' });
  assert.equal(plain(opensAtLabel(hours, 'en', at(23, 30))), '6:00 PM');
});

test('closed today and opens tomorrow: skips the closed day', () => {
  const now = at(12);
  const tomorrow = DAY_ORDER[(now.getDay() + 1) % 7];
  const hours = { [DAY_ORDER[now.getDay()]]: { open: '09:00', close: '17:00', closed: true }, [tomorrow]: { open: '10:30', close: '22:00' } };
  assert.equal(plain(opensAtLabel(hours, 'en', now)), '10:30 AM');
});

test('open all day has no closing time', () => {
  const hours = everyDay({ open: '00:00', close: '23:59' });
  assert.equal(closesAtLabel(hours, 'en', at(15)), null);
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

test('the locale decides the format: es is not the English am / pm text', () => {
  const hours = everyDay({ open: '18:00', close: '23:00' });
  assert.equal(plain(closesAtLabel(hours, 'es', at(20))), '23:00'); // es reads 24 h, as formatHourLabel does
});
