// Unit tests for lib/businessHours.ts (weekly-hours editor helpers of the registration wizard).
// Run from web/:  node --test scripts/business-hours.test.mjs

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const dir = mkdtempSync(join(tmpdir(), 'business-hours-'));
const out = join(dir, 'businessHours.mjs');
writeFileSync(out, ts.transpileModule(readFileSync(new URL('../lib/businessHours.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText);
const { isOpen24h, isOvernight, copyHoursToAll, setOpen24h } = await import(pathToFileURL(out).href);

const ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const day = (open, close, closed = false) => ({ open, close, closed });
const week = (over = {}) => Object.fromEntries(ORDER.map((k) => [k, over[k] ?? day('09:00', '21:00')]));

test('isOvernight: only an open day whose close is earlier than its open', () => {
  assert.equal(isOvernight(day('18:00', '02:00')), true);
  assert.equal(isOvernight(day('09:00', '21:00')), false);
  assert.equal(isOvernight(day('09:00', '09:00')), false, 'same time is not overnight');
  assert.equal(isOvernight(day('18:00', '02:00', true)), false, 'a closed day never "closes tomorrow"');
  assert.equal(isOvernight(day('00:00', '23:59')), false, '24 h is not overnight');
  assert.equal(isOvernight(day('', '02:00')), false);
});

test('copyHoursToAll: first open day → every open day; closed days untouched', () => {
  const hours = week({ mon: day('10:00', '22:00', true), tue: day('11:30', '23:00'), sat: day('08:00', '12:00'), sun: day('09:00', '21:00', true) });
  const next = copyHoursToAll(hours, ORDER);
  assert.deepEqual(next.tue, day('11:30', '23:00'));
  for (const k of ['wed', 'thu', 'fri', 'sat']) assert.deepEqual(next[k], day('11:30', '23:00'), k);
  assert.deepEqual(next.mon, day('10:00', '22:00', true), 'closed Monday keeps its times and stays closed');
  assert.deepEqual(next.sun, day('09:00', '21:00', true));
  assert.deepEqual(hours.sat, day('08:00', '12:00'), 'the input is not mutated');
});

test('copyHoursToAll: no open day → nothing changes', () => {
  const hours = week(Object.fromEntries(ORDER.map((k) => [k, day('09:00', '21:00', true)])));
  assert.deepEqual(copyHoursToAll(hours, ORDER), hours);
});

test('setOpen24h: on → 00:00–23:59 and open; off → back to what the day had', () => {
  const fallback = { open: '09:00', close: '21:00' };
  const before = day('10:00', '20:00');
  const on = setOpen24h(before, true, null, fallback);
  assert.deepEqual(on, day('00:00', '23:59'));
  assert.equal(isOpen24h(on), true);
  assert.deepEqual(setOpen24h(on, false, { open: '10:00', close: '20:00' }, fallback), day('10:00', '20:00'));
  assert.deepEqual(setOpen24h(on, false, null, fallback), day('09:00', '21:00'), 'nothing remembered → default');
  assert.deepEqual(setOpen24h(on, false, { open: '00:00', close: '23:59' }, fallback), day('09:00', '21:00'), 'never restores 24 h as the "previous"');
});

test('isOpen24h: exactly 00:00–23:59 and not closed', () => {
  assert.equal(isOpen24h(day('00:00', '23:59')), true);
  assert.equal(isOpen24h(day('00:00', '23:59', true)), false);
  assert.equal(isOpen24h(day('00:00', '22:00')), false);
});
