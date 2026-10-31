// Skeleton screens, base: the anti-flicker logic (fake timers) and a static check that the component stays JS-only (so it works on the web and ships OTA).
// Pure part: utils/delayedFlag.ts. Run from mobile/:  node --test scripts/skeleton.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test, { mock } from 'node:test';
import ts from 'typescript';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const js = ts.transpileModule(read('utils/delayedFlag.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = { exports: {} };
new Function('module', 'exports', js)(mod, mod.exports);
const { createDelayedFlag } = mod.exports;

/** A flag wired to the mocked clock, recording every change. */
function setup(delayMs) {
  mock.timers.enable({ apis: ['setTimeout'] });
  const changes = [];
  const flag = createDelayedFlag((on) => changes.push(on), delayMs);
  return { flag, changes, tick: (ms) => mock.timers.tick(ms) };
}

test('does not show before 200 ms, shows at 200 ms, hides when loading ends', () => {
  const { flag, changes, tick } = setup(200);
  flag.set(true);
  tick(199);
  assert.deepEqual(changes, [], 'nothing at 199 ms');
  tick(1);
  assert.deepEqual(changes, [true], 'on at 200 ms');
  flag.set(false);
  assert.deepEqual(changes, [true, false], 'off as soon as loading ends');
  mock.timers.reset();
});

test('a load that ends before the delay never shows anything', () => {
  const { flag, changes, tick } = setup(200);
  flag.set(true);
  tick(150);
  flag.set(false);
  tick(1000);
  assert.deepEqual(changes, []);
  mock.timers.reset();
});

test('loading on again restarts the clock; on while already on keeps the original start', () => {
  const { flag, changes, tick } = setup(200);
  flag.set(true);
  tick(150);
  flag.set(false);
  flag.set(true); // a new load: counts from zero
  tick(150);
  assert.deepEqual(changes, [], '150 + 150 ms must not add up');
  tick(50);
  assert.deepEqual(changes, [true]);
  flag.set(true); // already showing: no second change
  tick(1000);
  assert.deepEqual(changes, [true]);
  mock.timers.reset();
});

test('dispose cancels a pending turn-on (unmount)', () => {
  const { flag, changes, tick } = setup(200);
  flag.set(true);
  flag.dispose();
  tick(1000);
  assert.deepEqual(changes, []);
  mock.timers.reset();
});

test('the delay is configurable', () => {
  const { flag, changes, tick } = setup(500);
  flag.set(true);
  tick(499);
  assert.deepEqual(changes, []);
  tick(1);
  assert.deepEqual(changes, [true]);
  mock.timers.reset();
});

// ── Static checks on Skeleton.tsx ──────────────────────────────────────────────

const source = read('components/common/Skeleton.tsx');
const imports = [...source.matchAll(/^import[^;]*?from\s+'([^']+)'/gms)].map((m) => m[1]);

test('Skeleton.tsx imports nothing native-only: only react, react-native, i18next and three local modules', () => {
  const allowed = new Set(['react', 'react-native', 'react-i18next', '../../hooks/useReduceMotion', '../../theme/colors', '../../utils/delayedFlag']);
  for (const spec of imports) assert.ok(allowed.has(spec), `unexpected import: ${spec}`);
  assert.ok(imports.length >= 5);
  for (const spec of imports) assert.doesNotMatch(spec, /^expo-|reanimated|react-native-svg|masked-view|gesture-handler|\.native$/, spec);
});

test('the hook it relies on is web-safe too (only react and react-native)', () => {
  const hookImports = [...read('hooks/useReduceMotion.ts').matchAll(/^import[^;]*?from\s+'([^']+)'/gms)].map((m) => m[1]);
  assert.deepEqual(hookImports.sort(), ['react', 'react-native']);
});

test('colours come from the theme (bgElevated) and the pulse numbers are the approved ones; no hex literals', () => {
  assert.match(source, /backgroundColor: colors\.bgElevated/);
  assert.match(source, /SKELETON_PULSE_MS = 1200/);
  assert.match(source, /SKELETON_MIN_OPACITY = 0\.45/);
  assert.match(source, /SKELETON_DELAY_MS = 200/);
  assert.match(source, /CONTENT_FADE_MS = 200/);
  assert.equal(source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '').match(/#[0-9a-fA-F]{3,8}\b/g), null, 'no hex colours');
});

test('one shared pulse for the whole group: a single Animated.Value created at module level', () => {
  assert.equal((source.match(/new Animated\.Value\(/g) ?? []).length, 2, 'the shared pulse + the content-fade value');
  assert.match(source, /const pulse = new Animated\.Value\(1\)/);
});

test('screen readers: one progressbar announcing the loading label; bones hidden (iOS, Android and web)', () => {
  assert.match(source, /accessibilityRole="progressbar"/);
  assert.match(source, /t\('state\.loading'\)/);
  assert.match(source, /accessibilityElementsHidden/);
  assert.match(source, /importantForAccessibility="no-hide-descendants"/);
  assert.match(source, /aria-hidden/);
});
