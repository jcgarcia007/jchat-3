// Unit tests for utils/reservationSlot.ts (is a reservation day full, and which instant is asked for).
// Run from mobile/:  node --test scripts/reservation-slot.test.mjs
// The module is TypeScript: it is transpiled with the repo's own `typescript` into a temp dir and imported.

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const dir = mkdtempSync(join(tmpdir(), 'reservation-slot-'));
const source = readFileSync(new URL('../utils/reservationSlot.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
writeFileSync(join(dir, 'reservationSlot.mjs'), outputText);
const { isSlotFull, slotRequestInstant } = await import(pathToFileURL(join(dir, 'reservationSlot.mjs')).href);

test('capacity null (no limit) never makes a day full, however many reservations there are', () => {
  assert.equal(isSlotFull(0, null), false);
  assert.equal(isSlotFull(500, null), false);
  assert.equal(isSlotFull(500, undefined), false);
});

test('a day is full when the reservations reach the capacity, not before', () => {
  assert.equal(isSlotFull(19, 20), false);
  assert.equal(isSlotFull(20, 20), true);
  assert.equal(isSlotFull(25, 20), true);
  assert.equal(isSlotFull(0, 1), false);
  assert.equal(isSlotFull(1, 1), true);
});

test('a missing count is 0', () => {
  assert.equal(isSlotFull(null, 5), false);
  assert.equal(isSlotFull(undefined, 5), false);
});

test('an unusable capacity or count never blocks a customer (not full)', () => {
  assert.equal(isSlotFull(10, 0), false);
  assert.equal(isSlotFull(10, -3), false);
  assert.equal(isSlotFull(10, 'x'), false);
  assert.equal(isSlotFull('x', 5), false);
  assert.equal(isSlotFull(-1, 5), false);
});

test('numbers sent as text are read as numbers', () => {
  assert.equal(isSlotFull('20', '20'), true);
  assert.equal(isSlotFull('3', '20'), false);
});

test('the instant asked for is noon of the typed date (same calendar day in the phone zone)', () => {
  const iso = slotRequestInstant('2026-10-25');
  assert.ok(iso);
  const d = new Date(iso);
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 9);
  assert.equal(d.getDate(), 25);
  assert.equal(d.getHours(), 12);
});

test('a date that is not YYYY-MM-DD, or not a real date, gives no instant', () => {
  assert.equal(slotRequestInstant(''), null);
  assert.equal(slotRequestInstant('25/10/2026'), null);
  assert.equal(slotRequestInstant('2026-13-40'), null);
  assert.equal(slotRequestInstant('2026-10-5'), null);
});
