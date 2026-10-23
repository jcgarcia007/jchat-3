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
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
writeFileSync(join(dir, 'businessCard.mjs'), outputText);
const { formatMeters, cityFromAddress } = await import(pathToFileURL(join(dir, 'businessCard.mjs')).href);

// ── formatMeters ──────────────────────────────────────────────────────────────
test('miles: 480 m is 0.3 mi, 1609 m is 1.0 mi, 20 km is 12 mi', () => {
  assert.equal(formatMeters(480, false), '0.3 mi');
  assert.equal(formatMeters(1609.344, false), '1.0 mi');
  assert.equal(formatMeters(20000, false), '12 mi');
});

test('miles: very close is shown in feet, rounded to 10', () => {
  assert.equal(formatMeters(60, false), '200 ft');
  assert.equal(formatMeters(0, false), '0 ft');
});

test('kilometers: under 1 km in meters, then one decimal, then whole', () => {
  assert.equal(formatMeters(850, true), '850 m');
  assert.equal(formatMeters(1234, true), '1.2 km');
  assert.equal(formatMeters(15000, true), '15 km');
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
