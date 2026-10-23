// Unit tests for utils/pinCollision.ts (which map pins stay pills and which become dots) and pillName in utils/mapPin.ts.
// Run from mobile/:  node --test scripts/pin-collision.test.mjs
// The modules are TypeScript: they are transpiled with the repo's own `typescript` into a temp dir and imported.

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const dir = mkdtempSync(join(tmpdir(), 'pin-collision-'));
const compile = (name, fixImports = false) => {
  const source = readFileSync(new URL(`../utils/${name}.ts`, import.meta.url), 'utf8');
  let { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
  if (fixImports) outputText = outputText.replace("from './mapPin'", "from './mapPin.mjs'");
  writeFileSync(join(dir, `${name}.mjs`), outputText);
};
compile('mapPin');
compile('pinCollision', true);
const { pillName } = await import(pathToFileURL(join(dir, 'mapPin.mjs')).href);
const { projectToPixels, pinBox, resolvePinModes } = await import(pathToFileURL(join(dir, 'pinCollision.mjs')).href);

// A 400 x 800 view centred on (26, -80) showing 0.02° of longitude: 20 000 px per degree of longitude.
const viewport = { region: { latitude: 26, longitude: -80, latitudeDelta: 0.04, longitudeDelta: 0.02 }, width: 400, height: 800 };
const PX_PER_LNG = viewport.width / viewport.region.longitudeDelta;
const pin = (id, name, count, dxPx = 0, extra = {}) => ({
  id, name, count, closed: false, logo: false, lat: 26, lng: -80 + dxPx / PX_PER_LNG, ...extra,
});

// ── projection ────────────────────────────────────────────────────────────────
test('the region centre is the middle of the view', () => {
  const p = projectToPixels(26, -80, viewport);
  assert.ok(Math.abs(p.x - 200) < 1e-6 && Math.abs(p.y - 400) < 1e-6, JSON.stringify(p));
});

test('east is right, north is up, and half the longitude span is half the width', () => {
  const east = projectToPixels(26, -80 + 0.01, viewport);
  assert.ok(Math.abs(east.x - 400) < 1e-6, `x ${east.x}`);
  const north = projectToPixels(26.005, -80, viewport);
  assert.ok(north.y < 400, `y ${north.y}`);
  const west = projectToPixels(26, -80.01, viewport);
  assert.ok(Math.abs(west.x - 0) < 1e-6, `x ${west.x}`);
});

// ── collisions ────────────────────────────────────────────────────────────────
test('no collision: two far apart pins both stay pills', () => {
  const modes = resolvePinModes([pin('a', 'Bar Uno', 4, -150), pin('b', 'Bar Dos', 2, 150)], viewport);
  assert.deepEqual(modes, { a: 'pill', b: 'pill' });
});

test('simple collision: the one with more people keeps the pill, the other is a dot', () => {
  const { width } = pinBox(pin('a', 'Bar Uno', 4));
  const modes = resolvePinModes([pin('a', 'Bar Uno', 4, 0), pin('b', 'Bar Dos', 9, width * 0.5)], viewport);
  assert.deepEqual(modes, { a: 'dot', b: 'pill' });
});

test('chain of three: A (most) keeps, B touching A is a dot, C touching only B keeps its pill', () => {
  const { width } = pinBox(pin('a', 'Aaa', 5));
  const pins = [pin('a', 'Aaa', 5, 0), pin('b', 'Bbb', 3, width * 0.7), pin('c', 'Ccc', 1, width * 1.4)];
  // A–B and B–C overlap, A–C do not.
  const modes = resolvePinModes(pins, viewport);
  assert.deepEqual(modes, { a: 'pill', b: 'dot', c: 'pill' });
  // The input order does not matter.
  assert.deepEqual(resolvePinModes([...pins].reverse(), viewport), modes);
});

test('tie in people: the one closer to the user wins; with no user, by name', () => {
  const { width } = pinBox(pin('a', 'Alpha', 2));
  const alpha = pin('a', 'Alpha', 2, 0);
  const beta = pin('b', 'Beta', 2, width * 0.5);
  // The user stands on Beta: Beta is closer, so Beta keeps the pill.
  const user = { lat: beta.lat, lng: beta.lng };
  assert.deepEqual(resolvePinModes([alpha, beta], viewport, user), { a: 'dot', b: 'pill' });
  // No user: name order, Alpha before Beta.
  assert.deepEqual(resolvePinModes([alpha, beta], viewport), { a: 'pill', b: 'dot' });
});

test('a closed pin (no people) loses to an open one it touches', () => {
  const open = pin('o', 'Open Bar', 1, 0);
  const closed = pin('c', 'Closed Bar', 0, 20, { closed: true });
  assert.deepEqual(resolvePinModes([closed, open], viewport), { o: 'pill', c: 'dot' });
});

test('a logo above the pill makes the box taller: two pins one above the other collide only with the logo', () => {
  const lowerNoLogo = pin('a', 'Bar', 1, 0);
  const upper = { ...pin('b', 'Bar', 1, 0), lat: 26 + 0.0032, logo: false };
  // Same x; the pin 'b' is ~71 px north (0.0032° of latitude ≈ 71 px at this zoom): pills 40 px tall do not touch,
  // a 98 px tall pin with its logo does.
  assert.deepEqual(resolvePinModes([lowerNoLogo, upper], viewport), { a: 'pill', b: 'pill' });
  const withLogo = { ...lowerNoLogo, logo: true };
  assert.deepEqual(resolvePinModes([withLogo, upper], viewport), { a: 'pill', b: 'dot' });
});

test('a pin with a logo is two rectangles (pill + narrow ring), not one big box: diagonal pins that do not touch stay pills', () => {
  // `a`'s logo ring is narrower than its pill; `b` sits down and to the right, under the empty upper-right corner of
  // `a`'s bounding box. The bounding boxes overlap, the drawn pins do not.
  const a = pin('a', 'Bar', 1, 0, { logo: true });
  const b = { ...pin('b', 'Bar', 1, 95, { logo: true }), lat: 26 - 60 / (PX_PER_LNG / Math.cos((26 * Math.PI) / 180)) };
  assert.deepEqual(resolvePinModes([a, b], viewport), { a: 'pill', b: 'pill' });
  // Moving `b` onto `a`'s pill does collide.
  const onTop = { ...pin('b', 'Bar', 0, 20, { logo: true }) };
  assert.deepEqual(resolvePinModes([a, onTop], viewport), { a: 'pill', b: 'dot' });
});

test('pins far outside the view take no space; an empty view size keeps every pill', () => {
  const far = pin('far', 'Far Bar', 9, 5000);
  assert.deepEqual(resolvePinModes([pin('a', 'Bar', 1, 0), far], viewport), { a: 'pill', far: 'pill' });
  assert.deepEqual(resolvePinModes([pin('a', 'Bar', 1, 0), pin('b', 'Bar', 1, 5)], { ...viewport, width: 0 }), { a: 'pill', b: 'pill' });
});

// ── pillName ──────────────────────────────────────────────────────────────────
test('pillName: up to 18 characters as they are, longer ones cut with an ellipsis', () => {
  assert.equal(pillName('Bar XZX'), 'Bar XZX');
  assert.equal(pillName('123456789012345678'), '123456789012345678');
  assert.equal(pillName('1234567890123456789'), '12345678901234567…');
  assert.equal(pillName('JChat Demo Lounge & Grill'), 'JChat Demo Lounge…'); // 17 letters + the ellipsis = 18
  assert.equal(pillName('  Café   del  Mar  '), 'Café del Mar');
  assert.equal(pillName(null), '');
});
