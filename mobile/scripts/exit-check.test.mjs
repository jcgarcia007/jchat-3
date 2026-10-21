// Unit tests for utils/exitCheck.ts (silent exit verification of a venue session). Run from mobile/:
//   node --test scripts/exit-check.test.mjs
// The module is TypeScript: it is transpiled with the repo's own `typescript` into a temp dir and imported.

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const dir = mkdtempSync(join(tmpdir(), 'exit-check-'));
const source = readFileSync(new URL('../utils/exitCheck.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
writeFileSync(join(dir, 'exitCheck.mjs'), outputText);
const {
  evaluateExit,
  classifyReading,
  distanceMeters,
  isValidReading,
  pushReading,
  MAX_ACCURACY_M,
  OUTSIDE_MARGIN_M,
  BUFFER_MAX_AGE_MS,
  BUFFER_MAX_LENGTH,
} = await import(pathToFileURL(join(dir, 'exitCheck.mjs')).href);

const CENTER = { lat: 26.0830488, lng: -80.2237252 };
const RADIUS = 200;
const METERS_PER_DEGREE_LAT = (Math.PI / 180) * 6_371_000;
const MIN = 60 * 1000;
const T0 = Date.UTC(2026, 9, 20, 22, 0, 0);

/** A reading `meters` due north of the venue centre, `minutes` after T0, with the given accuracy. */
const at = (meters, minutes, accuracy = 10) => ({
  lat: CENTER.lat + meters / METERS_PER_DEGREE_LAT,
  lng: CENTER.lng,
  accuracy,
  timestamp: T0 + minutes * MIN,
});
const verdict = (readings) => evaluateExit(readings, CENTER, RADIUS);

test('the helper puts a reading at the requested distance', () => {
  assert.ok(Math.abs(distanceMeters(CENTER.lat, CENTER.lng, at(500, 0).lat, at(500, 0).lng) - 500) < 0.01);
});

test('no readings at all: uncertain', () => {
  assert.equal(verdict([]), 'uncertain');
});

test('ONE far-away reading never ends a session (a bad reading)', () => {
  assert.equal(verdict([at(900, 0)]), 'uncertain');
});

test('bad accuracy: readings above 50 m are ignored, even three of them far away over four minutes', () => {
  const readings = [at(900, 0, 80), at(900, 2, 80), at(900, 4, 80)];
  assert.equal(readings.every((r) => !isValidReading(r)), true);
  assert.equal(verdict(readings), 'uncertain');
});

test('unknown accuracy (null / undefined) is not a valid reading either', () => {
  assert.equal(verdict([at(900, 0, null), at(900, 2, undefined), at(900, 4, null)]), 'uncertain');
  assert.equal(isValidReading({ ...at(10, 0), accuracy: null }), false);
});

test('two readings outside, even five minutes apart: uncertain', () => {
  assert.equal(verdict([at(900, 0), at(900, 5)]), 'uncertain');
});

test('three readings outside within one minute: uncertain', () => {
  assert.equal(verdict([at(900, 0), at(900, 0.5), at(900, 1)]), 'uncertain');
});

test('three readings outside spanning three minutes: outside_confirmed', () => {
  assert.equal(verdict([at(900, 0), at(900, 1.5), at(900, 3)]), 'outside_confirmed');
});

test('the span is measured first to last: 2 min 59 s is not enough, 3 min is', () => {
  assert.equal(verdict([at(900, 0), at(900, 1), at(900, 2 + 59 / 60)]), 'uncertain');
  assert.equal(verdict([at(900, 0), at(900, 1), at(900, 3)]), 'outside_confirmed');
});

test('more than three readings: the whole run counts, the first three need not span three minutes', () => {
  assert.equal(verdict([at(900, 0), at(900, 1), at(900, 2), at(900, 4)]), 'outside_confirmed');
});

test('returning to the radius half way restarts the count', () => {
  // out, out, IN, out, out: only two outside after the reset
  assert.equal(verdict([at(900, 0), at(900, 2), at(50, 3), at(900, 4), at(900, 7)]), 'uncertain');
  // and three more after it confirm again
  assert.equal(verdict([at(900, 0), at(900, 2), at(50, 3), at(900, 4), at(900, 6), at(900, 7)]), 'outside_confirmed');
});

test('a valid reading inside the radius as the latest one: inside', () => {
  assert.equal(verdict([at(900, 0), at(900, 2), at(900, 4), at(60, 5)]), 'inside');
});

test('exact edge of the radius: 0.01 m inside is inside, 0.01 m outside is not', () => {
  assert.equal(classifyReading(at(RADIUS - 0.01, 0), CENTER, RADIUS), 'inside');
  assert.equal(classifyReading(at(RADIUS + 0.01, 0), CENTER, RADIUS), 'buffer');
  assert.equal(verdict([at(RADIUS - 0.01, 0)]), 'inside');
});

test('exact edge of the margin: radius + 30 m is still the buffer, a hair beyond is outside', () => {
  assert.equal(classifyReading(at(RADIUS + OUTSIDE_MARGIN_M - 0.01, 0), CENTER, RADIUS), 'buffer');
  assert.equal(classifyReading(at(RADIUS + OUTSIDE_MARGIN_M + 0.01, 0), CENTER, RADIUS), 'outside');
});

test('readings in the margin (radius .. radius + 30 m) never confirm an exit and they break a run', () => {
  assert.equal(verdict([at(RADIUS + 15, 0), at(RADIUS + 15, 2), at(RADIUS + 15, 4)]), 'uncertain');
  assert.equal(verdict([at(900, 0), at(900, 2), at(RADIUS + 15, 3), at(900, 4), at(900, 6)]), 'uncertain');
});

test('exact accuracy edge: 50 m counts, 50.01 m does not', () => {
  assert.equal(isValidReading(at(10, 0, MAX_ACCURACY_M)), true);
  assert.equal(isValidReading(at(10, 0, MAX_ACCURACY_M + 0.01)), false);
});

test('a bad-accuracy reading in the middle neither counts nor breaks the run', () => {
  assert.equal(verdict([at(900, 0), at(10, 1, 120), at(900, 2), at(900, 3)]), 'outside_confirmed');
});

test('readings are ordered by time, whatever the order they arrive in', () => {
  assert.equal(verdict([at(900, 3), at(900, 0), at(900, 1.5)]), 'outside_confirmed');
  assert.equal(verdict([at(60, 5), at(900, 0), at(900, 2), at(900, 4)]), 'inside');
});

test('classifyReading says why a reading is not used', () => {
  assert.equal(classifyReading(at(10, 0, 200), CENTER, RADIUS), 'invalid');
  assert.equal(classifyReading({ lat: Number.NaN, lng: 0, accuracy: 5, timestamp: T0 }, CENTER, RADIUS), 'invalid');
  assert.equal(classifyReading(at(10, 0), CENTER, RADIUS), 'inside');
  assert.equal(classifyReading(at(900, 0), CENTER, RADIUS), 'outside');
});

test('pushReading keeps the newest readings and drops the old ones', () => {
  let buffer = [];
  for (let i = 0; i < BUFFER_MAX_LENGTH + 5; i += 1) buffer = pushReading(buffer, at(10, i * 0.1));
  assert.equal(buffer.length, BUFFER_MAX_LENGTH);
  const old = at(10, 0);
  const fresh = at(10, BUFFER_MAX_AGE_MS / MIN + 1);
  assert.deepEqual(pushReading([old], fresh), [fresh]);
});
