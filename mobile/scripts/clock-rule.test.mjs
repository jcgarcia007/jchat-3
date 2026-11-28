// Lote G: THE one clock rule of the app (H-028 / H-032): Spanish 24 h ("20:00"), English 12 h ("8:00 PM").
// utils/hours.ts (the hours of a venue), utils/localTime.ts (times on the phone's clock) and utils/reservationFlow.ts (formatClock) must agree, and no screen
// may format a time with the platform's Intl (toLocaleTimeString / hour12 …), which Hermes, iOS and the server render differently.
//   node --test scripts/clock-rule.test.mjs

import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'clock-rule-'));
for (const name of ['hours', 'reservationFlow', 'localTime']) {
  const source = readFileSync(join(ROOT, 'utils', `${name}.ts`), 'utf8').replace(/from '\.\/reservationFlow'/g, "from './reservationFlow.mjs'");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
  writeFileSync(join(dir, `${name}.mjs`), outputText);
}
const load = (name) => import(pathToFileURL(join(dir, `${name}.mjs`)).href);
const { formatClockLabel } = await load('hours');
const { formatClock } = await load('reservationFlow');
const { clockLocale, formatLocalTime, formatLocalDayTime, formatLocalDateTime, formatLocalLongDateTime } = await load('localTime');

test('hours.ts formatClockLabel gives exactly what reservationFlow formatClock gives, for every minute of the day, in es and en', () => {
  for (let total = 0; total < 24 * 60; total += 1) {
    const hh = String(Math.floor(total / 60)).padStart(2, '0');
    const mm = String(total % 60).padStart(2, '0');
    for (const locale of ['es', 'en']) {
      assert.equal(formatClockLabel(`${hh}:${mm}`, locale), formatClock(Math.floor(total / 60), total % 60, locale), `${hh}:${mm} ${locale}`);
    }
  }
});

test('clockLocale: English for en…, Spanish for anything else', () => {
  assert.equal(clockLocale('en'), 'en');
  assert.equal(clockLocale('en-US'), 'en');
  assert.equal(clockLocale('es'), 'es');
  assert.equal(clockLocale('es-MX'), 'es');
  assert.equal(clockLocale(undefined), 'es');
  assert.equal(clockLocale(null), 'es');
});

test('formatLocalTime: the phone clock by the rule; an unreadable date is empty', () => {
  const d = new Date(2026, 10, 23, 20, 5);
  assert.equal(formatLocalTime(d, 'es'), '20:05');
  assert.equal(formatLocalTime(d, 'en'), '8:05 PM');
  assert.equal(formatLocalTime(d.toISOString(), 'en'), '8:05 PM');
  assert.equal(formatLocalTime(new Date(2026, 10, 23, 0, 0), 'es'), '00:00');
  assert.equal(formatLocalTime(new Date(2026, 10, 23, 0, 0), 'en'), '12:00 AM');
  assert.equal(formatLocalTime(new Date(2026, 10, 23, 12, 30), 'en'), '12:30 PM');
  assert.equal(formatLocalTime('not a date', 'es'), '');
  assert.equal(formatLocalTime(null, 'en'), '');
  assert.equal(formatLocalTime(undefined, 'es'), '');
});

test('formatLocalDayTime, formatLocalDateTime and formatLocalLongDateTime: our own tables, the order of the language', () => {
  const d = new Date(2026, 10, 23, 20, 0); // Monday 23 November 2026
  assert.equal(formatLocalDayTime(d, 'es'), '23 nov, 20:00');
  assert.equal(formatLocalDayTime(d, 'en'), 'Nov 23, 8:00 PM');
  assert.equal(formatLocalDateTime(d, 'es'), '23 de noviembre de 2026, 20:00');
  assert.equal(formatLocalDateTime(d, 'en'), 'November 23, 2026, 8:00 PM');
  assert.equal(formatLocalLongDateTime(d, 'es'), 'lunes 23 de noviembre de 2026, 20:00');
  assert.equal(formatLocalLongDateTime(d, 'en'), 'Monday, November 23, 2026, 8:00 PM');
  assert.equal(formatLocalDayTime('x', 'es') + formatLocalDateTime('x', 'en') + formatLocalLongDateTime(null, 'es'), '');
});

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'scripts' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

test('no screen, component or service formats a time with toLocaleTimeString / toLocaleString / hour12 / timeStyle (they skip the clock rule)', () => {
  const offenders = [];
  for (const dirName of ['screens', 'components', 'services', 'hooks', 'context', 'navigation']) {
    for (const file of walk(join(ROOT, dirName))) {
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        const code = line.replace(/\/\/.*$/, '');
        if (/toLocaleTimeString|hour12|timeStyle|hourCycle/.test(code)) offenders.push(`${relative(ROOT, file)}:${i + 1}`);
        // toLocaleString() on a Date prints the time too; on a number it is fine: only the Date forms we know are checked
        if (/new Date\([^)]*\)\.toLocaleString\(/.test(code)) offenders.push(`${relative(ROOT, file)}:${i + 1}`);
        if (/\bd\.toLocaleString\(/.test(code)) offenders.push(`${relative(ROOT, file)}:${i + 1}`);
      });
    }
  }
  assert.deepEqual(offenders, [], `use utils/localTime.ts (the one clock rule): ${offenders.join(', ')}`);
});
