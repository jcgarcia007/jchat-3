// The tab bar's notch: concentric with the 64 pt button (7 pt gap all round), 106 pt opening, shoulders tangent to the top edge and to the bowl.
// Run from mobile/:  node --test scripts/notch-geometry.test.mjs
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const dir = mkdtempSync(join(tmpdir(), 'notch-geometry-'));
writeFileSync(join(dir, 'g.mjs'), ts.transpileModule(read('components/navigation/notchGeometry.ts'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText);
const g = await import(pathToFileURL(join(dir, 'g.mjs')).href);
const geo = g.notchGeometry();
const EPS = 1e-9;

test('the gap between the button and the bowl is 7 pt, all the way round (same centre)', () => {
  assert.equal(g.BUTTON_SIZE, 64);
  assert.equal(g.BOWL_RADIUS, 39);
  assert.equal(g.NOTCH_GAP, 7);
  // the bowl is centred on the button's centre (c, CENTER_Y): every point of it is BOWL_RADIUS from there, so BOWL_RADIUS - 32 from the button's edge
  for (const angle of [15, 45, 90, 135, 165]) {
    const x = geo.bowl * Math.cos((angle * Math.PI) / 180);
    const y = g.CENTER_Y + geo.bowl * Math.sin((angle * Math.PI) / 180);
    assert.ok(Math.abs(Math.hypot(x, y - g.CENTER_Y) - geo.bowl) < EPS);
  }
  assert.equal(geo.depth, 41);
});

test('the opening on the top edge is 106 pt wide and the shoulder radius is ~15.76', () => {
  assert.equal(geo.openingHalfWidth * 2, 106);
  assert.ok(Math.abs(geo.fillet - 15.756) < 0.001, `fillet ${geo.fillet}`);
});

test('the shoulders are tangent to the top edge and to the bowl (no corner)', () => {
  // shoulder centre (−half, fillet) relative to the notch centre; bowl centre (0, CENTER_Y)
  const sx = -geo.openingHalfWidth;
  const sy = geo.fillet;
  // externally tangent to the bowl: distance between centres = bowl + fillet (and tangent to the top edge: the centre is `fillet` below it)
  assert.ok(Math.abs(Math.hypot(sx, sy - g.CENTER_Y) - (geo.bowl + geo.fillet)) < 1e-9);
  // the joint lies on both circles and on the line between the centres
  const jx = -geo.jointX;
  const jy = geo.jointY;
  assert.ok(Math.abs(Math.hypot(jx, jy - g.CENTER_Y) - geo.bowl) < 1e-9, 'on the bowl');
  assert.ok(Math.abs(Math.hypot(jx - sx, jy - sy) - geo.fillet) < 1e-9, 'on the shoulder');
  const cross = (jx - 0) * (sy - g.CENTER_Y) - (jy - g.CENTER_Y) * (sx - 0);
  assert.ok(Math.abs(cross) < 1e-9, 'collinear with both centres');
  assert.ok(geo.jointX < geo.openingHalfWidth && geo.jointY > 0 && geo.jointY < geo.depth);
});

test('the notch path draws shoulder, bowl (less than a half turn), shoulder, and the whole outline closes', () => {
  const [h, left, bowl, right] = g.notchSegment(181);
  assert.equal(h, 'H 128');
  assert.match(left, /^A 15\.756 15\.756 0 0 1 143\.\d+ 11\.\d+$/);
  assert.match(bowl, /^A 39 39 0 0 0 218\.\d+ 11\.\d+$/);
  assert.equal(right, 'A 15.756 15.756 0 0 1 234 0');
  const d = g.barPath(362);
  assert.match(d, /^M 32 0 H 128 /);
  assert.match(d, / H 330 /);
  assert.match(d, / Z$/);
  assert.equal((d.match(/ A 32 32 /g) ?? []).length, 4, 'four rounded corners');
});

test('the room reserved for the notch in the bar fits it, and the tabs keep a 44 pt touch area', () => {
  const reserved = g.NOTCH_ROOM;
  assert.ok(reserved >= geo.openingHalfWidth * 2, `notch ${2 * geo.openingHalfWidth} must fit in ${reserved}`);
  // two tabs per side on the narrowest phone we support (320 pt wide, 14 pt margins)
  const sideWidth = (320 - 28 - reserved) / 2;
  assert.ok(sideWidth / 2 >= 44, `each tab is ${sideWidth / 2} pt wide`);
  assert.ok(g.BAR_HEIGHT >= 44);
});
