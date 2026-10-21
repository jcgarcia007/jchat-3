// Unit tests for utils/mapPin.ts (size, activity level, initials, colour index, category icon of the map pin).
// Run from mobile/:  node --test scripts/map-pin.test.mjs
// The module is TypeScript: it is transpiled with the repo's own `typescript` into a temp dir and imported.

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const dir = mkdtempSync(join(tmpdir(), 'map-pin-'));
const source = readFileSync(new URL('../utils/mapPin.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
writeFileSync(join(dir, 'mapPin.mjs'), outputText);
const { heatLevel, pinSize, PIN_SIZES, counterLabel, initials, colorIndex, pinCategory, isMuted, showCounter, showHalo } =
  await import(pathToFileURL(join(dir, 'mapPin.mjs')).href);

test('the activity levels start at 5, 20 and 50 people', () => {
  assert.equal(heatLevel(0), 'cool');
  assert.equal(heatLevel(4), 'cool');
  assert.equal(heatLevel(5), 'mild');
  assert.equal(heatLevel(19), 'mild');
  assert.equal(heatLevel(20), 'warm');
  assert.equal(heatLevel(49), 'warm');
  assert.equal(heatLevel(50), 'hot');
  assert.equal(heatLevel(500), 'hot');
});

test('the pin is 40 / 48 / 54 / 60 px by activity', () => {
  assert.deepEqual(PIN_SIZES, { cool: 40, mild: 48, warm: 54, hot: 60 });
  assert.equal(pinSize(0), 40);
  assert.equal(pinSize(5), 48);
  assert.equal(pinSize(20), 54);
  assert.equal(pinSize(50), 60);
});

test('the counter text stops at 99+', () => {
  assert.equal(counterLabel(1), '1');
  assert.equal(counterLabel(99), '99');
  assert.equal(counterLabel(100), '99+');
  assert.equal(counterLabel(-3), '0');
  assert.equal(counterLabel(7.9), '7');
});

test('initials: two words give the first letter of each, one word gives its first two letters', () => {
  assert.equal(initials('Bar XZX'), 'BX');
  assert.equal(initials('Lounge'), 'LO');
  assert.equal(initials('el patio'), 'EP');
  assert.equal(initials('  Juan   Carlos  Garcia '), 'JC');
  assert.equal(initials('Café Luna'), 'CL');
  assert.equal(initials('Ñandú'), 'ÑA');
  assert.equal(initials('X'), 'X');
});

test('initials: symbols and emoji are ignored, an empty name gives "?"', () => {
  assert.equal(initials('!!! ***'), '?');
  assert.equal(initials('🍷 Wine Bar'), 'WB');
  assert.equal(initials(''), '?');
  assert.equal(initials(null), '?');
  assert.equal(initials(undefined), '?');
});

test('colorIndex is stable for a venue and always inside the palette', () => {
  assert.equal(colorIndex('abc-123', 5), colorIndex('abc-123', 5));
  for (const seed of ['', 'a', 'Bar XZX', 'el patio', '7c9e6679-7425-40de-944b-e07fc1f90ae7']) {
    const index = colorIndex(seed, 5);
    assert.ok(Number.isInteger(index) && index >= 0 && index < 5, `${seed} -> ${index}`);
  }
  assert.equal(colorIndex('anything', 0), 0);
  // different venues do not all collapse into one colour
  const used = new Set(Array.from({ length: 40 }, (_, i) => colorIndex(`venue-${i}`, 5)));
  assert.ok(used.size >= 4, `only ${used.size} colours used`);
});

test('the registration categories collapse to the five chip icons', () => {
  assert.equal(pinCategory('Bar & Nightclub'), 'bar');
  assert.equal(pinCategory('Rooftop Bar'), 'bar');
  assert.equal(pinCategory('Sports Bar'), 'bar');
  assert.equal(pinCategory('Cocktail Bar'), 'bar');
  assert.equal(pinCategory('Wine Bar'), 'bar');
  assert.equal(pinCategory('Brewery'), 'bar');
  assert.equal(pinCategory('Lounge'), 'bar');
  assert.equal(pinCategory('Restaurant'), 'restaurant');
  assert.equal(pinCategory('Café'), 'cafe');
  assert.equal(pinCategory('cafe'), 'cafe');
  assert.equal(pinCategory('Club'), 'club');
  assert.equal(pinCategory('Other'), 'other');
});

test('the category is matched by whole words, never by a fragment', () => {
  assert.equal(pinCategory('Barbería'), 'other');
  assert.equal(pinCategory('Barbershop'), 'other');
  assert.equal(pinCategory('Clubhouse'), 'other');
  assert.equal(pinCategory(''), 'other');
  assert.equal(pinCategory(null), 'other');
  assert.equal(pinCategory(undefined), 'other');
});

test('a closed or pending venue is muted, an open one is not', () => {
  assert.equal(isMuted('verified', false), false);
  assert.equal(isMuted('verified', undefined), false);
  assert.equal(isMuted('verified', true), true);
  assert.equal(isMuted('pending', false), true);
  assert.equal(isMuted('pending_verification', false), false); // only the literal 'pending' status is muted by status
});

test('the counter shows only with people, and never on a pending venue', () => {
  assert.equal(showCounter(0, 'verified'), false);
  assert.equal(showCounter(1, 'verified'), true);
  assert.equal(showCounter(12, 'pending'), false);
});

test('the halo is only for the top level and never for a muted pin', () => {
  assert.equal(showHalo(50, false), true);
  assert.equal(showHalo(49, false), false);
  assert.equal(showHalo(80, true), false);
});
