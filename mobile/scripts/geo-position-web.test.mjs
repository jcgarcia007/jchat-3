// Unit tests for services/geoPosition.web.ts (location on the web build) with a fake `navigator`.
// Run from mobile/:  node --test scripts/geo-position-web.test.mjs
//
// Focus: the in-memory "a reading succeeded on this page" mark that keeps the automatic geofence heartbeat
// (which only READS the permission) from seeing "no permission" when navigator.permissions.query is missing
// or answers 'prompt' ("only this time" in Safari).

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const dir = mkdtempSync(join(tmpdir(), 'geo-web-'));
const file = join(dir, 'geoPosition.web.mjs');
writeFileSync(
  file,
  ts.transpileModule(readFileSync(new URL('../services/geoPosition.web.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  }).outputText,
);

let fresh = 0;
/** A fresh module instance (the mark lives in a module variable) with a fake navigator. */
async function load({ permission, positions }) {
  const queue = [...positions];
  const geolocation = {
    getCurrentPosition(ok, fail) {
      const next = queue.shift() ?? 'ok';
      if (next === 'ok') ok({ coords: { latitude: 25.7, longitude: -80.2 } });
      else fail({ code: next === 'denied' ? 1 : 3, PERMISSION_DENIED: 1, message: next });
    },
  };
  const nav = { geolocation };
  if (permission !== 'none') nav.permissions = { query: async () => ({ state: permission }) };
  Object.defineProperty(globalThis, 'navigator', { value: nav, configurable: true, writable: true });
  return import(`${pathToFileURL(file).href}?n=${fresh++}`);
}

test('no Permissions API and no reading yet → false (the first reading must come from a gesture)', async () => {
  const geo = await load({ permission: 'none', positions: [] });
  assert.equal(await geo.hasForegroundPermission(), false);
});

test('no Permissions API, a reading succeeded on this page → true (heartbeat keeps working)', async () => {
  const geo = await load({ permission: 'none', positions: ['ok'] });
  // the fake browser gives no accuracy: it is reported as null (the silent exit check then ignores the reading)
  assert.deepEqual(await geo.getCurrentPosition(), { lat: 25.7, lng: -80.2, mocked: false, accuracy: null });
  assert.equal(await geo.hasForegroundPermission(), true);
});

test('the accuracy the browser reports is passed on (the silent exit check ignores readings above 50 m)', async () => {
  const geo = await load({ permission: 'none', positions: [] });
  const { geolocation } = globalThis.navigator;
  geolocation.getCurrentPosition = (ok) => ok({ coords: { latitude: 25.7, longitude: -80.2, accuracy: 12.5 } });
  assert.deepEqual(await geo.getCurrentPosition(), { lat: 25.7, lng: -80.2, mocked: false, accuracy: 12.5 });
});

test("'prompt' (Safari: only this time) after a successful reading → true; before it → false", async () => {
  const geo = await load({ permission: 'prompt', positions: ['ok'] });
  assert.equal(await geo.hasForegroundPermission(), false);
  await geo.getCurrentPosition();
  assert.equal(await geo.hasForegroundPermission(), true);
});

test("'granted' → true without any reading", async () => {
  const geo = await load({ permission: 'granted', positions: [] });
  assert.equal(await geo.hasForegroundPermission(), true);
});

test("'denied' → false even after a successful reading, and the mark is cleared", async () => {
  const geo = await load({ permission: 'prompt', positions: ['ok'] });
  await geo.getCurrentPosition();
  Object.defineProperty(globalThis, 'navigator', {
    value: { geolocation: globalThis.navigator.geolocation, permissions: { query: async () => ({ state: 'denied' }) } },
    configurable: true,
    writable: true,
  });
  assert.equal(await geo.hasForegroundPermission(), false);
  // The user re-allows later: with 'prompt' the cleared mark means false again until a new reading succeeds.
  Object.defineProperty(globalThis, 'navigator', {
    value: { geolocation: globalThis.navigator.geolocation, permissions: { query: async () => ({ state: 'prompt' }) } },
    configurable: true,
    writable: true,
  });
  assert.equal(await geo.hasForegroundPermission(), false);
});

test('a PERMISSION_DENIED error on a reading clears the mark', async () => {
  const geo = await load({ permission: 'none', positions: ['ok', 'denied'] });
  await geo.getCurrentPosition();
  assert.equal(await geo.hasForegroundPermission(), true);
  await assert.rejects(geo.getCurrentPosition());
  assert.equal(await geo.hasForegroundPermission(), false);
});

test('a timeout / unavailable error does NOT clear the mark (the permission is still there)', async () => {
  const geo = await load({ permission: 'none', positions: ['ok', 'timeout'] });
  await geo.getCurrentPosition();
  await assert.rejects(geo.getCurrentPosition());
  assert.equal(await geo.hasForegroundPermission(), true);
});

test('requestForegroundPermission: prompt + success → true and remembered; prompt + denied → false', async () => {
  const allowed = await load({ permission: 'prompt', positions: ['ok'] });
  assert.equal(await allowed.requestForegroundPermission(), true);
  assert.equal(await allowed.hasForegroundPermission(), true);

  const refused = await load({ permission: 'prompt', positions: ['denied'] });
  assert.equal(await refused.requestForegroundPermission(), false);
  assert.equal(await refused.hasForegroundPermission(), false);
});

test('requestForegroundPermission: a timeout still means permitted (the gate reports it could not read)', async () => {
  const geo = await load({ permission: 'prompt', positions: ['timeout'] });
  assert.equal(await geo.requestForegroundPermission(), true);
  assert.equal(await geo.hasForegroundPermission(), false, 'but nothing was read yet, so no mark');
});
