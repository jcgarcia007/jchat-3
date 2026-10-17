// Unit tests for lib/registerLocation.ts (coordinates of the business registration wizard come from the address).
// Run from web/:  node --test scripts/register-location.test.mjs

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const dir = mkdtempSync(join(tmpdir(), 'register-location-'));
const out = join(dir, 'registerLocation.mjs');
writeFileSync(out, ts.transpileModule(readFileSync(new URL('../lib/registerLocation.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText);
const { parseCoordinate, coordsFrom, normalizeAddress, needsGeocode, geocodeAddress, shouldGeocodeOnBlur, MIN_BLUR_ADDRESS_LENGTH } = await import(pathToFileURL(out).href);

/** A geocoder that answers once with (results, status). */
const geocoderReturning = (results, status, seen = []) => ({
  geocode(request, callback) {
    seen.push(request);
    callback(results, status);
  },
});
const place = (lat, lng) => [{ geometry: { location: { lat: () => lat, lng: () => lng } } }];

test('coordinates: numbers inside the range, comma or dot, nothing else', () => {
  assert.equal(parseCoordinate('26.0872319', 'lat'), 26.0872319);
  assert.equal(parseCoordinate(' -80,2303233 ', 'lng'), -80.2303233);
  for (const bad of ['', '  ', 'abc', '12abc', '91', '-90.0001', 'NaN', 'Infinity']) assert.equal(parseCoordinate(bad, 'lat'), null, bad);
  assert.equal(parseCoordinate('180', 'lng'), 180);
  assert.equal(parseCoordinate('181', 'lng'), null);
});

test('a pair needs both, and (0, 0) is "nothing here"', () => {
  assert.deepEqual(coordsFrom('26.0872319', '-80.2303233'), { lat: 26.0872319, lng: -80.2303233 });
  assert.equal(coordsFrom('26.08', ''), null);
  assert.equal(coordsFrom('', '-80.23'), null);
  assert.equal(coordsFrom('0', '0'), null);
  assert.deepEqual(coordsFrom('0', '10'), { lat: 0, lng: 10 }, 'the equator is a place; only (0,0) is not');
});

test('needsGeocode: empty → yes; typed by the owner → never; found for another address → yes', () => {
  const empty = { lat: '', lng: '', source: null, geocodedFor: '' };
  assert.equal(needsGeocode(empty, '6511 Nova Dr, Davie, FL'), true);
  const manual = { lat: '26.08', lng: '-80.23', source: 'manual', geocodedFor: '' };
  assert.equal(needsGeocode(manual, 'anything'), false, 'typed coordinates are never replaced');
  const auto = { lat: '26.08', lng: '-80.23', source: 'auto', geocodedFor: normalizeAddress('6511 Nova Dr, Davie, FL') };
  assert.equal(needsGeocode(auto, '  6511  NOVA dr, Davie, FL '), false, 'same address, spacing and case aside');
  assert.equal(needsGeocode(auto, '700 Main St, Davie, FL'), true, 'the address changed after the geocode');
  assert.equal(needsGeocode({ ...auto, lat: 'x' }, '6511 Nova Dr, Davie, FL'), true, 'invalid boxes');
});

test('geocodeAddress: ok, rounded, and the request carries the trimmed address', async () => {
  const seen = [];
  const outcome = await geocodeAddress(geocoderReturning(place(26.087231949, -80.230323351), 'OK', seen), '  6511 Nova Dr, Davie, FL 33317 ');
  assert.deepEqual(outcome, { ok: true, coords: { lat: 26.0872319, lng: -80.2303234 } });
  assert.deepEqual(seen, [{ address: '6511 Nova Dr, Davie, FL 33317' }]);
});

test('geocodeAddress: every failure is a reason, never a throw', async () => {
  assert.deepEqual(await geocodeAddress(geocoderReturning(place(1, 1), 'OK'), '   '), { ok: false, reason: 'empty_address' });
  assert.deepEqual(await geocodeAddress(null, '6511 Nova Dr'), { ok: false, reason: 'unavailable' });
  assert.deepEqual(await geocodeAddress(geocoderReturning([], 'ZERO_RESULTS'), 'asdf qwer'), { ok: false, reason: 'no_results' });
  assert.deepEqual(await geocodeAddress(geocoderReturning(null, 'OVER_QUERY_LIMIT'), 'x'), { ok: false, reason: 'error' });
  assert.deepEqual(await geocodeAddress(geocoderReturning(null, 'REQUEST_DENIED'), 'x'), { ok: false, reason: 'error' });
  assert.deepEqual(await geocodeAddress(geocoderReturning([], 'OK'), 'x'), { ok: false, reason: 'error' }, 'OK with no result');
  assert.deepEqual(await geocodeAddress(geocoderReturning(place(0, 0), 'OK'), 'x'), { ok: false, reason: 'error' }, '(0,0) is not an answer');
  assert.deepEqual(await geocodeAddress({ geocode() { throw new Error('boom'); } }, 'x'), { ok: false, reason: 'error' });
});

test('shouldGeocodeOnBlur: needs an address of 8+ characters, not busy, and the same condition as Continue', () => {
  assert.equal(MIN_BLUR_ADDRESS_LENGTH, 8);
  const empty = { lat: '', lng: '', source: null, geocodedFor: '' };
  const addr = '6511 Nova Dr, Davie, FL';
  assert.equal(shouldGeocodeOnBlur({ address: addr, state: empty, busy: false }), true);
  // too short: still typing / not an address
  assert.equal(shouldGeocodeOnBlur({ address: '6511 Nov', state: empty, busy: false }), true, 'exactly 8 characters');
  assert.equal(shouldGeocodeOnBlur({ address: '6511 No', state: empty, busy: false }), false, '7 characters');
  assert.equal(shouldGeocodeOnBlur({ address: '   123   ', state: empty, busy: false }), false, 'spaces do not count');
  assert.equal(shouldGeocodeOnBlur({ address: '', state: empty, busy: false }), false);
  // never two at once
  assert.equal(shouldGeocodeOnBlur({ address: addr, state: empty, busy: true }), false);
  // coordinates the owner typed are never replaced; auto coordinates for the same address are not searched again
  assert.equal(shouldGeocodeOnBlur({ address: addr, state: { lat: '26.08', lng: '-80.23', source: 'manual', geocodedFor: '' }, busy: false }), false);
  const auto = { lat: '26.08', lng: '-80.23', source: 'auto', geocodedFor: normalizeAddress(addr) };
  assert.equal(shouldGeocodeOnBlur({ address: `  ${addr.toUpperCase()} `, state: auto, busy: false }), false, 'same address');
  assert.equal(shouldGeocodeOnBlur({ address: '700 Main St, Davie, FL', state: auto, busy: false }), true, 'the address changed');
});
