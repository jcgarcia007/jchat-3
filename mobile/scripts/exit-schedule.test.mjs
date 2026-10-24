// Unit tests for utils/exitSchedule.ts (when the silent exit check looks again). Run from mobile/:
//   node --test scripts/exit-schedule.test.mjs
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const dir = mkdtempSync(join(tmpdir(), 'exit-schedule-'));
const source = readFileSync(new URL('../utils/exitSchedule.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
writeFileSync(join(dir, 'exitSchedule.mjs'), outputText);
const { nextVerifyDelayMs, SILENT_VERIFY_INTERVAL_MS } = await import(pathToFileURL(join(dir, 'exitSchedule.mjs')).href);

test('the look every minute is 60 s', () => {
  assert.equal(SILENT_VERIFY_INTERVAL_MS, 60_000);
});

test('a pending exit (uncertain, outside buffer) schedules the next look in a minute', () => {
  assert.equal(nextVerifyDelayMs({ status: 'uncertain', pendingExit: true }), 60_000);
});

test('an uncertain check with nothing outside goes back to the normal heartbeat', () => {
  assert.equal(nextVerifyDelayMs({ status: 'uncertain', pendingExit: false }), null);
});

test('inside cancels the chain', () => {
  assert.equal(nextVerifyDelayMs({ status: 'inside', pendingExit: false }), null);
  assert.equal(nextVerifyDelayMs({ status: 'inside', pendingExit: true }), null);
});

test('a confirmed exit ends the chain', () => {
  assert.equal(nextVerifyDelayMs({ status: 'outside_confirmed', pendingExit: false }), null);
  assert.equal(nextVerifyDelayMs({ status: 'outside_confirmed', pendingExit: true }), null);
});

test('an ignored reading or a position error keeps a pending exit going (it reports pendingExit from the buffer)', () => {
  // runSilentGeoCheck returns 'uncertain' + pendingExit = buffer still ends outside for ignored readings / timeouts
  assert.equal(nextVerifyDelayMs({ status: 'uncertain', pendingExit: true }), 60_000);
});
