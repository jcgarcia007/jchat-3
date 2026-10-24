// Unit tests for utils/exitCheck.ts (silent exit verification of a venue session). Run from mobile/:
//   node --test scripts/exit-check.test.mjs
// The module is TypeScript: it is transpiled with the repo's own `typescript` into a temp dir and imported.
//
// The accuracy limits are tied to the venue's radius (renewAccuracyMax / exitAccuracyMax / exitMargin). The scenario tests
// use a 200 m radius; the last section checks the three functions and the decisions at radius 50, 100 and 200.

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
  outsideRunLength,
  classifyReading,
  distanceMeters,
  isValidReading,
  isRenewableReading,
  silentAction,
  pushReading,
  renewAccuracyMax,
  exitAccuracyMax,
  exitMargin,
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

// Accuracies relative to the 200 m radius of the scenarios: exit ≤ 100, renew ≤ 200.
const EXIT_MAX = exitAccuracyMax(RADIUS); // 100
const RENEW_MAX = renewAccuracyMax(RADIUS); // 200
const MID = EXIT_MAX + 10; // too coarse to count towards an exit, still good enough to renew from inside
const BAD = RENEW_MAX + 50; // too coarse for anything

test('the helper puts a reading at the requested distance', () => {
  assert.ok(Math.abs(distanceMeters(CENTER.lat, CENTER.lng, at(500, 0).lat, at(500, 0).lng) - 500) < 0.01);
});

test('no readings at all: uncertain', () => {
  assert.equal(verdict([]), 'uncertain');
});

test('ONE far-away reading never ends a session (a bad reading)', () => {
  assert.equal(verdict([at(900, 0)]), 'uncertain');
});

test('bad accuracy: readings worse than the renew limit are ignored, even three of them far away over four minutes', () => {
  const readings = [at(900, 0, BAD), at(900, 2, BAD), at(900, 4, BAD)];
  assert.equal(readings.every((r) => !isValidReading(r, RADIUS)), true);
  assert.equal(verdict(readings), 'uncertain');
});

test('unknown accuracy (null / undefined) is not a valid reading either', () => {
  assert.equal(verdict([at(900, 0, null), at(900, 2, undefined), at(900, 4, null)]), 'uncertain');
  assert.equal(isValidReading({ ...at(10, 0), accuracy: null }, RADIUS), false);
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

test('exact accuracy edge: exitAccuracyMax counts, a hair worse does not', () => {
  assert.equal(isValidReading(at(10, 0, EXIT_MAX), RADIUS), true);
  assert.equal(isValidReading(at(10, 0, EXIT_MAX + 0.01), RADIUS), false);
});

test('a reading too coarse for anything in the middle neither counts nor breaks the run', () => {
  assert.equal(verdict([at(900, 0), at(10, 1, BAD), at(900, 2), at(900, 3)]), 'outside_confirmed');
});

test('readings are ordered by time, whatever the order they arrive in', () => {
  assert.equal(verdict([at(900, 3), at(900, 0), at(900, 1.5)]), 'outside_confirmed');
  assert.equal(verdict([at(60, 5), at(900, 0), at(900, 2), at(900, 4)]), 'inside');
});

test('classifyReading says why a reading is not used', () => {
  assert.equal(classifyReading(at(10, 0, BAD), CENTER, RADIUS), 'invalid');
  assert.equal(classifyReading({ lat: Number.NaN, lng: 0, accuracy: 5, timestamp: T0 }, CENTER, RADIUS), 'invalid');
  assert.equal(classifyReading(at(10, 0), CENTER, RADIUS), 'inside');
  assert.equal(classifyReading(at(900, 0), CENTER, RADIUS), 'outside');
});

// ── Asymmetric rule: renew up to renewAccuracyMax inside the radius, exit only on readings up to exitAccuracyMax ──

test('renewing: an INSIDE reading up to renewAccuracyMax renews, a hair worse does not, outside never does', () => {
  assert.equal(isRenewableReading(at(60, 0, RENEW_MAX), CENTER, RADIUS), true);
  assert.equal(isRenewableReading(at(60, 0, RENEW_MAX + 0.01), CENTER, RADIUS), false);
  assert.equal(isRenewableReading(at(60, 0, MID), CENTER, RADIUS), true);
  assert.equal(isRenewableReading(at(900, 0, 10), CENTER, RADIUS), false);
  assert.equal(isRenewableReading(at(60, 0, null), CENTER, RADIUS), false);
  assert.equal(isRenewableReading({ lat: Number.NaN, lng: 0, accuracy: 5, timestamp: T0 }, CENTER, RADIUS), false);
});

test('what the automatic check does with a reading: renew, track (buffer only) or ignore', () => {
  assert.equal(silentAction(at(60, 0, 10), CENTER, RADIUS), 'renew');
  assert.equal(silentAction(at(60, 0, MID), CENTER, RADIUS), 'renew', 'inside with a coarse accuracy still renews');
  assert.equal(silentAction(at(900, 0, 30), CENTER, RADIUS), 'track', 'outside with a good accuracy: counts towards an exit, never sent');
  assert.equal(silentAction(at(RADIUS + 15, 0, 30), CENTER, RADIUS), 'track', 'the margin is tracked too (it breaks a run)');
  assert.equal(silentAction(at(900, 0, MID), CENTER, RADIUS), 'ignore', 'outside with a coarse accuracy: not counted, not sent');
  assert.equal(silentAction(at(60, 0, BAD), CENTER, RADIUS), 'ignore', 'worse than the renew limit: ignored even inside');
  assert.equal(silentAction(at(60, 0, null), CENTER, RADIUS), 'ignore');
});

test('outside readings too coarse for an exit never count towards one', () => {
  assert.equal(verdict([at(900, 0, MID), at(900, 2, MID), at(900, 4, MID)]), 'uncertain');
  assert.equal(verdict([at(900, 0, 30), at(900, 2, MID), at(900, 4, 30)]), 'uncertain', 'only two count');
});

test('outside readings too coarse for an exit, in the middle of a run, neither count nor break it', () => {
  assert.equal(verdict([at(900, 0, 10), at(900, 1, MID), at(900, 2, 10), at(900, 3, 10)]), 'outside_confirmed');
});

test('an INSIDE reading with a coarse accuracy as the latest one is "inside" and it ends a run', () => {
  assert.equal(verdict([at(900, 0), at(900, 2), at(900, 4), at(60, 5, MID)]), 'inside');
  // out, out, IN (coarse), out, out: only two outside after the reset
  assert.equal(verdict([at(900, 0), at(900, 2), at(60, 3, MID), at(900, 4), at(900, 7)]), 'uncertain');
});

test('exit still needs three outside readings of exitAccuracyMax or better over ≥ 3 minutes', () => {
  assert.equal(verdict([at(900, 0, EXIT_MAX), at(900, 1.5, EXIT_MAX), at(900, 3, EXIT_MAX)]), 'outside_confirmed');
  assert.equal(verdict([at(900, 0, EXIT_MAX + 0.01), at(900, 1.5, EXIT_MAX), at(900, 3, EXIT_MAX)]), 'uncertain');
});

// ── Limits tied to the radius (decision D): radius 50, 100 and 200 ──────────────────────────────────────────────

test('renewAccuracyMax(radius) = max(100, radius)', () => {
  assert.equal(renewAccuracyMax(50), 100);
  assert.equal(renewAccuracyMax(100), 100);
  assert.equal(renewAccuracyMax(200), 200);
  assert.equal(renewAccuracyMax(500), 500);
});

test('exitAccuracyMax(radius) = max(50, radius / 2)', () => {
  assert.equal(exitAccuracyMax(50), 50);
  assert.equal(exitAccuracyMax(100), 50);
  assert.equal(exitAccuracyMax(200), 100);
  assert.equal(exitAccuracyMax(500), 250);
});

test('exitMargin(radius) = radius + 30', () => {
  assert.equal(exitMargin(50), 80);
  assert.equal(exitMargin(100), 130);
  assert.equal(exitMargin(200), 230);
});

test('a missing or invalid radius falls back to the floors (100 / 50 / 30)', () => {
  assert.equal(renewAccuracyMax(Number.NaN), 100);
  assert.equal(exitAccuracyMax(-20), 50);
  assert.equal(exitMargin(0), 30);
});

for (const radius of [50, 100, 200]) {
  const renewMax = renewAccuracyMax(radius);
  const exitMax = exitAccuracyMax(radius);
  const margin = exitMargin(radius);
  const read = (meters, minutes, accuracy = 10) => at(meters, minutes, accuracy);
  const exitVerdict = (readings) => evaluateExit(readings, CENTER, radius);

  test(`radius ${radius}: an inside reading renews up to ${renewMax} m accuracy, not beyond`, () => {
    assert.equal(silentAction(read(radius - 1, 0, renewMax), CENTER, radius), 'renew');
    assert.equal(silentAction(read(radius - 1, 0, renewMax + 1), CENTER, radius), 'ignore');
  });

  test(`radius ${radius}: an outside reading is tracked up to ${exitMax} m accuracy and ignored beyond`, () => {
    assert.equal(silentAction(read(radius + 400, 0, exitMax), CENTER, radius), 'track');
    assert.equal(silentAction(read(radius + 400, 0, exitMax + 1), CENTER, radius), 'ignore');
  });

  test(`radius ${radius}: the margin is ${margin} m (buffer up to it, outside beyond it)`, () => {
    assert.equal(classifyReading(read(margin - 0.5, 0), CENTER, radius), 'buffer');
    assert.equal(classifyReading(read(margin + 0.5, 0), CENTER, radius), 'outside');
  });

  test(`radius ${radius}: three readings of ${exitMax} m accuracy beyond ${margin} m over 3 min confirm the exit; ${exitMax + 1} m do not`, () => {
    const far = radius + 400;
    assert.equal(exitVerdict([read(far, 0, exitMax), read(far, 1.5, exitMax), read(far, 3, exitMax)]), 'outside_confirmed');
    assert.equal(exitVerdict([read(far, 0, exitMax + 1), read(far, 1.5, exitMax + 1), read(far, 3, exitMax + 1)]), 'uncertain');
  });

  test(`radius ${radius}: readings inside the margin (${radius}–${margin} m) never confirm an exit`, () => {
    const inMargin = radius + 15;
    assert.equal(exitVerdict([read(inMargin, 0), read(inMargin, 2), read(inMargin, 4)]), 'uncertain');
  });
}

test('pushReading keeps the newest readings and drops the old ones', () => {
  let buffer = [];
  for (let i = 0; i < BUFFER_MAX_LENGTH + 5; i += 1) buffer = pushReading(buffer, at(10, i * 0.1));
  assert.equal(buffer.length, BUFFER_MAX_LENGTH);
  const old = at(10, 0);
  const fresh = at(10, BUFFER_MAX_AGE_MS / MIN + 1);
  assert.deepEqual(pushReading([old], fresh), [fresh]);
});

test('outsideRunLength: how many clearly-outside readings end the buffer (an exit is pending when > 0)', () => {
  assert.equal(outsideRunLength([], CENTER, RADIUS), 0);
  assert.equal(outsideRunLength([at(50, 0)], CENTER, RADIUS), 0); // inside
  assert.equal(outsideRunLength([at(260, 0)], CENTER, RADIUS), 1); // one outside reading is already a pending exit
  assert.equal(outsideRunLength([at(260, 0), at(300, 1), at(280, 2)], CENTER, RADIUS), 3);
  assert.equal(outsideRunLength([at(260, 0), at(50, 1)], CENTER, RADIUS), 0); // a later reading inside cancels it
  assert.equal(outsideRunLength([at(50, 0), at(260, 1), at(300, 2)], CENTER, RADIUS), 2);
  assert.equal(outsideRunLength([at(215, 0)], CENTER, RADIUS), 0); // in the margin: not clearly outside
});

test('outsideRunLength ignores readings that do not matter (poor accuracy) without breaking the run', () => {
  const poor = at(300, 1, 500); // accuracy 500 m: not counted, not breaking
  assert.equal(outsideRunLength([at(260, 0), poor], CENTER, RADIUS), 1);
  assert.equal(outsideRunLength([poor], CENTER, RADIUS), 0);
});
