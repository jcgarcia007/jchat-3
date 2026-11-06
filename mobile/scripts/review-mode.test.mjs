// Run from mobile/:  node --test scripts/review-mode.test.mjs
// Review mode (migration 262), app side: the app never decides for the review group, the server does.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const dir = mkdtempSync(join(tmpdir(), 'review-mode-'));
const file = join(dir, 'reviewMode.mjs');
writeFileSync(file, ts.transpileModule(read('../utils/reviewMode.ts'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText);
const { insideRadiusForCard, shouldTryReviewEntry } = await import(pathToFileURL(file).href);

test('the card does not block a venue the server lets the person into', () => {
  assert.equal(insideRadiusForCard(false, 'b1', new Set(['b1'])), null);
  assert.equal(insideRadiusForCard(true, 'b1', new Set(['b1'])), null);
});
test('every other venue keeps its measured value, and an empty set changes nothing', () => {
  assert.equal(insideRadiusForCard(false, 'b2', new Set(['b1'])), false);
  assert.equal(insideRadiusForCard(false, 'b1', new Set()), false);
  assert.equal(insideRadiusForCard(null, 'b1', new Set()), null);
  assert.equal(insideRadiusForCard(false, null, new Set(['b1'])), false);
});
test('a second ask without coordinates only after a failure that coordinates could not fix', () => {
  for (const r of ['permission_denied', 'position_error', 'outside_radius', 'unavailable']) assert.equal(shouldTryReviewEntry(r), true, r);
  for (const r of ['granted', 'checking', 'idle']) assert.equal(shouldTryReviewEntry(r), false, r);
});

const gate = read('../screens/chat/useGeofenceGate.ts');
test('the interactive check asks the server once more (no coordinates) before saying no', () => {
  assert.match(gate, /joinRoomForReview\(roomId\)/);
  assert.match(gate, /!opts\.interactive \|\| !shouldTryReviewEntry/);
});
test('the silent check never ends a session of the review group without asking the server', () => {
  const silent = gate.slice(gate.indexOf('export async function runSilentGeoCheck'));
  assert.ok(silent.indexOf('reviewRooms.has(roomId)') < silent.indexOf('hasForegroundPermission'), 'review rooms are renewed before any GPS read');
  const confirm = silent.indexOf("verdict === 'outside_confirmed'");
  assert.ok(silent.indexOf('joinRoomForReview(roomId)', confirm) > confirm && silent.indexOf('joinRoomForReview(roomId)', confirm) < silent.indexOf('callGeofenceRpc(roomId, coords).catch'));
});
test('the review RPCs are only called by name from the service', () => {
  const svc = read('../services/reviewMode.ts');
  assert.match(svc, /review_bypass_businesses/);
  assert.match(svc, /review_join_room/);
  assert.doesNotMatch(svc, /review_bypass['"]/); // review_bypass itself is server only
});
test('map and the venue card sheet feed the card through insideRadiusForCard', () => {
  for (const f of ['../screens/map/MapScreen.tsx', '../components/map/BusinessCardSheet.tsx']) assert.match(read(f), /insideRadiusForCard\(/, f);
});
