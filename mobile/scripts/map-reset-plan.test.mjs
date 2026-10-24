// Unit tests for navigation/mapResetPlan.ts (which root routes survive when the app goes back to the Map). Run from mobile/:
//   node --test scripts/map-reset-plan.test.mjs
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const dir = mkdtempSync(join(tmpdir(), 'map-reset-'));
const source = readFileSync(new URL('../navigation/mapResetPlan.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
writeFileSync(join(dir, 'mapResetPlan.mjs'), outputText);
const { planMapReset } = await import(pathToFileURL(join(dir, 'mapResetPlan.mjs')).href);

const r = (name) => ({ key: `${name}-1`, name });

test('chat room over the tabs: keep the tabs, drop the room', () => {
  assert.deepEqual(planMapReset([r('Tabs'), r('ChatRoom')]), { kind: 'keep', count: 1 });
});

test('a DM, the menu and the profile over the room: all dropped', () => {
  assert.deepEqual(planMapReset([r('Tabs'), r('ChatRoom'), r('DMs'), r('Menu'), r('ProfileSheet')]), { kind: 'keep', count: 1 });
});

test('screens opened BEFORE the chat below the tabs are not kept either (always the Map)', () => {
  assert.deepEqual(planMapReset([r('Tabs'), r('Offers'), r('ChatRoom'), r('DMs')]), { kind: 'keep', count: 1 });
});

test('tabs are not the first route: everything below them is kept with them', () => {
  assert.deepEqual(planMapReset([r('Onboarding'), r('Tabs'), r('ChatRoom')]), { kind: 'keep', count: 2 });
});

test('already on the tabs: nothing else to drop', () => {
  assert.deepEqual(planMapReset([r('Tabs')]), { kind: 'keep', count: 1 });
});

test('no tabs in the stack (deep link straight into a room): a fresh Tabs is made', () => {
  assert.deepEqual(planMapReset([r('ChatRoom')]), { kind: 'fresh' });
  assert.deepEqual(planMapReset([]), { kind: 'fresh' });
});
