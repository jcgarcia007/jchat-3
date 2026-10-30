// shouldRequestPushPermission: on Android 13+ a never-asked permission reads as `denied`, and the app must still ask (it never did, push_token stayed NULL).
// Pure part: services/pushPermission.ts. Run from mobile/:  node --test scripts/push-permission.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const js = ts.transpileModule(read('services/pushPermission.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = { exports: {} };
new Function('module', 'exports', js)(mod, mod.exports);
const { shouldRequestPushPermission: ask } = mod.exports;

test('ios undetermined → asks', () => {
  assert.equal(ask({ platform: 'ios', status: 'undetermined', canAskAgain: true }), true);
});

test('android 13+ never asked (reads as denied, can ask again) → asks: this is the bug', () => {
  assert.equal(ask({ platform: 'android', status: 'denied', canAskAgain: true }), true);
  assert.equal(ask({ platform: 'android', status: 'denied', canAskAgain: true, granted: false }), true);
});

test('android refused twice (denied, cannot ask again) → does not insist', () => {
  assert.equal(ask({ platform: 'android', status: 'denied', canAskAgain: false }), false);
});

test('granted → does not ask, by status or by the granted flag', () => {
  assert.equal(ask({ platform: 'android', status: 'granted', canAskAgain: true }), false);
  assert.equal(ask({ platform: 'ios', status: 'granted', canAskAgain: true }), false);
  assert.equal(ask({ platform: 'android', status: 'denied', canAskAgain: true, granted: true }), false);
});

test('ios denied → does not ask (iOS only prompts once; denied is final)', () => {
  assert.equal(ask({ platform: 'ios', status: 'denied', canAskAgain: true }), false);
  assert.equal(ask({ platform: 'ios', status: 'denied', canAskAgain: false }), false);
});

test('undetermined but cannot ask again → does not ask; other platforms never treat denied as askable', () => {
  assert.equal(ask({ platform: 'android', status: 'undetermined', canAskAgain: false }), false);
  assert.equal(ask({ platform: 'web', status: 'denied', canAskAgain: true }), false);
});
