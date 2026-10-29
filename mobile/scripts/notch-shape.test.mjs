// The tab bar's notch: a bowl concentric with the centre button (uniform gap) with rounded shoulders tangent to the flat top and to the bowl.
// Run from mobile/:  node --test scripts/notch-shape.test.mjs
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const dir = mkdtempSync(join(tmpdir(), 'notch-'));
writeFileSync(join(dir, 'notchGeometry.mjs'), ts.transpileModule(read('components/navigation/notchGeometry.ts'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText);
const { notchGeometry, notchSegment, BUTTON_RADIUS, NOTCH_GAP } = await import(pathToFileURL(join(dir, 'notchGeometry.mjs')).href);
const bar = read('components/navigation/NotchTabBar.tsx');
const EPS = 1e-9;

test('the gap between the button and the notch is the same all the way round', () => {
  const g = notchGeometry();
  assert.equal(g.bowl, BUTTON_RADIUS + NOTCH_GAP);
  // every point of the bowl is at distance `bowl` from the button's centre (c, 0); at the bottom that is bowl below the top edge
  for (const angle of [20, 45, 90, 135, 160]) {
    const x = g.bowl * Math.cos((angle * Math.PI) / 180);
    const y = g.bowl * Math.sin((angle * Math.PI) / 180);
    assert.ok(Math.abs(Math.hypot(x, y) - g.bowl) < EPS);
  }
  // the old outline left 4 pt under the button and about 20 pt at the sides
  assert.equal(g.bowl - BUTTON_RADIUS, NOTCH_GAP);
});

test('the shoulders are tangent to the flat top and to the bowl (no corner)', () => {
  const g = notchGeometry();
  // fillet centre (cx, fillet) relative to the bowl's centre: tangent to the top (y = 0) and externally tangent to the bowl
  const cx = g.halfWidth;
  assert.ok(Math.abs(Math.hypot(cx, g.fillet) - (g.bowl + g.fillet)) < EPS, 'distance between centres = bowl + fillet');
  // the contact point lies on the line between the centres, at distance `bowl` from the bowl's centre
  assert.ok(Math.abs(Math.hypot(g.px, g.py) - g.bowl) < EPS);
  assert.ok(Math.abs(g.px / g.py - cx / g.fillet) < 1e-9, 'contact point on the line of centres');
  // the shoulder leaves the flat top at x = ±halfWidth, y = 0
  assert.ok(g.px < g.halfWidth && g.py > 0 && g.py < g.fillet + EPS);
});

test('the notch fits the room reserved for it in the bar and is no shallower than the button needs', () => {
  const g = notchGeometry();
  const reserved = Number(bar.match(/const NOTCH_WIDTH = (\d+);/)[1]);
  assert.ok(g.halfWidth * 2 <= reserved, `notch ${2 * g.halfWidth} must fit in ${reserved}`);
  assert.ok(g.bowl >= BUTTON_RADIUS + NOTCH_GAP);
});

test('the path draws shoulder, bowl, shoulder with the right arcs', () => {
  const [h, left, bowl, right] = notchSegment(195);
  assert.match(h, /^H 144\.\d+$/);
  assert.match(left, /^A 18 18 0 0 1 161\.\d+ 12$/);
  assert.match(bowl, /^A 36 36 0 0 0 228\.\d+ 12$/, 'concave bowl, less than a half turn (large-arc 0)');
  assert.match(right, /^A 18 18 0 0 1 245\.\d+ 0$/);
});

test('the tab bar uses it, and the old cubic U is gone', () => {
  assert.match(bar, /import \{ notchSegment \} from '\.\/notchGeometry';/);
  assert.match(bar, /\.\.\.notchSegment\(center\)/);
  assert.doesNotMatch(bar, /NOTCH_DEPTH/);
  assert.doesNotMatch(bar, /center - 39/);
  // the centre button is 60 pt and sits on the top edge: the geometry's constant must match it
  assert.match(bar, /borderRadius: 30,[\s\S]*?height: 60,[\s\S]*?top: -30,[\s\S]*?width: 60/);
  assert.equal(BUTTON_RADIUS, 30);
});
