// Unit tests for utils/profilePlaces.ts ("My places": safe privacy default, chip label, visit total). Run from mobile/:
//   node --test scripts/profile-places.test.mjs
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const dir = mkdtempSync(join(tmpdir(), 'profile-places-'));
const source = readFileSync(new URL('../utils/profilePlaces.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
writeFileSync(join(dir, 'profilePlaces.mjs'), outputText);
const { parseProfilePrivacy, placesVisibilityLabelKey, totalVisits, DEFAULT_PLACES_VISIBILITY } = await import(pathToFileURL(join(dir, 'profilePlaces.mjs')).href);

test('nothing saved: places visible to nobody, section on, city on', () => {
  for (const raw of [null, undefined, {}, 'x', 5, []]) {
    assert.deepEqual(parseProfilePrivacy(raw), { placesVisibility: 'nobody', tabPlaces: true, showCity: true }, String(raw));
  }
  assert.equal(DEFAULT_PLACES_VISIBILITY, 'nobody');
});

test('a saved choice is respected', () => {
  assert.equal(parseProfilePrivacy({ whoSeesPlacesTab: 'everyone' }).placesVisibility, 'everyone');
  assert.equal(parseProfilePrivacy({ whoSeesPlacesTab: 'followers' }).placesVisibility, 'followers');
  assert.equal(parseProfilePrivacy({ whoSeesPlacesTab: 'nobody' }).placesVisibility, 'nobody');
});

test('an invalid visibility falls back to the safe default, not to "everyone"', () => {
  for (const bad of ['public', '', 3, null, true]) {
    assert.equal(parseProfilePrivacy({ whoSeesPlacesTab: bad }).placesVisibility, 'nobody', String(bad));
  }
});

test('tabPlaces false hides the section; showCity false hides the city; other values are ignored', () => {
  assert.equal(parseProfilePrivacy({ tabPlaces: false }).tabPlaces, false);
  assert.equal(parseProfilePrivacy({ tabPlaces: true }).tabPlaces, true);
  assert.equal(parseProfilePrivacy({ tabPlaces: 'no' }).tabPlaces, true);
  assert.equal(parseProfilePrivacy({ showCity: false }).showCity, false);
  assert.equal(parseProfilePrivacy({ showCity: 0 }).showCity, true);
});

test('the chip reads Todos / Seguidores / Solo yo', () => {
  assert.equal(placesVisibilityLabelKey('everyone'), 'places.visEveryone');
  assert.equal(placesVisibilityLabelKey('followers'), 'places.visFollowers');
  assert.equal(placesVisibilityLabelKey('nobody'), 'places.visOnlyMe');
});

test('totalVisits adds the visits of every place and ignores bad numbers', () => {
  assert.equal(totalVisits([]), 0);
  assert.equal(totalVisits([{ visitCount: 3 }, { visitCount: 1 }, { visitCount: 5 }]), 9);
  assert.equal(totalVisits([{ visitCount: 2 }, { visitCount: -4 }, { visitCount: Number.NaN }]), 2);
  assert.equal(totalVisits([{ visitCount: 2.9 }]), 2);
});
