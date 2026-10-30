// "Reduce transparency" is an iOS setting: only there does it turn the glass into a solid surface. Pure part: utils/reduceTransparency.ts.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const js = ts.transpileModule(read('utils/reduceTransparency.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = { exports: {} };
new Function('module', 'exports', js)(mod, mod.exports);
const { reduceTransparencyActive } = mod.exports;

test('on only for iOS with the setting on', () => {
  assert.equal(reduceTransparencyActive('ios', true), true);
  assert.equal(reduceTransparencyActive('ios', false), false);
  assert.equal(reduceTransparencyActive('ios', null), false);
  assert.equal(reduceTransparencyActive('android', true), false, 'Android never reports it');
  assert.equal(reduceTransparencyActive('web', true), false);
});

test('the hook follows the setting live and unsubscribes', () => {
  const src = read('hooks/useReduceTransparency.ts');
  assert.match(src, /isReduceTransparencyEnabled\(\)/);
  assert.match(src, /addEventListener\('reduceTransparencyChanged'/);
  assert.match(src, /subscription\.remove\(\)/);
});
