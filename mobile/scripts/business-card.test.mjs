// Unit tests for utils/businessCard.ts (distance text and city of the business card).
// Run from mobile/:  node --test scripts/business-card.test.mjs
// The module is TypeScript: it is transpiled with the repo's own `typescript` into a temp dir and imported.

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const dir = mkdtempSync(join(tmpdir(), 'business-card-'));
const source = readFileSync(new URL('../utils/businessCard.ts', import.meta.url), 'utf8');
const transpile = (text) => ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
// businessCard.ts delegates to utils/distance.ts (the app's one distance rule, H-048): both go into the temp dir.
writeFileSync(join(dir, 'distance.mjs'), transpile(readFileSync(new URL('../utils/distance.ts', import.meta.url), 'utf8')));
writeFileSync(join(dir, 'businessCard.mjs'), transpile(source).replace("from './distance'", "from './distance.mjs'"));
const { formatMeters, cityFromAddress } = await import(pathToFileURL(join(dir, 'businessCard.mjs')).href);
const { formatDistanceMeters, isHere, isMetricRegion } = await import(pathToFileURL(join(dir, 'distance.mjs')).href);

// ── formatMeters ──────────────────────────────────────────────────────────────
test('miles: 480 m is 0.3 mi, 1609 m is 1.0 mi, 20 km is 12.4 mi (always one decimal, never a whole mile)', () => {
  assert.equal(formatMeters(480, false), '0.3 mi');
  assert.equal(formatMeters(1609.344, false), '1.0 mi');
  assert.equal(formatMeters(20000, false), '12.4 mi');
});

test('miles: very close is shown in feet, rounded to 50', () => {
  assert.equal(formatMeters(60, false), '200 ft');
  assert.equal(formatMeters(100, false), '350 ft');
  assert.equal(formatMeters(0, false), '0 ft');
});

test('kilometers: under 1 km in meters (steps of 10), then one decimal', () => {
  assert.equal(formatMeters(850, true), '850 m');
  assert.equal(formatMeters(853, true), '850 m');
  assert.equal(formatMeters(1234, true), '1.2 km');
  assert.equal(formatMeters(15000, true), '15.0 km');
});

// ── the one distance rule (utils/distance.ts) ─────────────────────────────────
test('standing at the venue says "Here" instead of 0 ft / 0 m', () => {
  assert.equal(formatDistanceMeters(0, false, 'Here'), 'Here');
  assert.equal(formatDistanceMeters(3, false, 'Here'), 'Here'); // 10 ft: rounds to 0 ft in steps of 50
  assert.equal(formatDistanceMeters(2, true, 'Aquí'), 'Aquí');
  assert.equal(formatDistanceMeters(20, false, 'Here'), '50 ft');
  assert.equal(formatDistanceMeters(12, true, 'Aquí'), '10 m');
  assert.equal(isHere(0, true), true);
  assert.equal(isHere(30, true), false);
});

test('there is a boundary at 0.1 mi (feet → miles) and at 1 km (metres → km), never a whole-mile rounding', () => {
  assert.equal(formatDistanceMeters(160, false), '500 ft'); // 0.099 mi
  assert.equal(formatDistanceMeters(161, false), '0.1 mi');
  assert.equal(formatDistanceMeters(995, true), '1.0 km'); // would round to 1000 m
  assert.equal(formatDistanceMeters(999, true), '1.0 km');
  assert.equal(formatDistanceMeters(1000, true), '1.0 km');
  assert.equal(formatDistanceMeters(2 * 1609.344, false), '2.0 mi');
});

test('the device region decides the system: the US and its territories imperial, everyone else metric', () => {
  for (const region of ['US', 'us', 'PR', 'GU', 'VI']) assert.equal(isMetricRegion(region), false, region);
  for (const region of ['DO', 'ES', 'MX', 'GB', 'CA', 'FR']) assert.equal(isMetricRegion(region), true, region);
  assert.equal(isMetricRegion(null), true);
  assert.equal(isMetricRegion(undefined), true);
});

test('a bad value is 0', () => {
  assert.equal(formatMeters(Number.NaN, true), '0 m');
  assert.equal(formatMeters(-5, false), '0 ft');
});

// ── cityFromAddress ───────────────────────────────────────────────────────────
test('a full US address gives its city', () => {
  assert.equal(cityFromAddress('Building 13, 6000 Palm Trace Landings Dr, Davie, FL 33314, USA'), 'Davie');
  assert.equal(cityFromAddress('6511 Nova Dr, Davie, FL 33317'), 'Davie');
  assert.equal(cityFromAddress('123 Main St, Miami, FL'), 'Miami');
});

test('without state or country the last segment is the city', () => {
  assert.equal(cityFromAddress('Calle El Conde 12, Santo Domingo'), 'Santo Domingo');
  assert.equal(cityFromAddress('Av. Winston Churchill, Santo Domingo, República Dominicana'), 'Santo Domingo');
});

test('a bare street, an empty value or one with digits only after the street gives null', () => {
  assert.equal(cityFromAddress('6511 Nova Dr'), null);
  assert.equal(cityFromAddress(''), null);
  assert.equal(cityFromAddress(null), null);
  assert.equal(cityFromAddress(undefined), null);
  assert.equal(cityFromAddress('Davie'), null, 'a single segment is not known to be a city');
  assert.equal(cityFromAddress('Unit 4, 6000 Palm Trace Dr'), null, 'a last segment with digits is a street');
});
