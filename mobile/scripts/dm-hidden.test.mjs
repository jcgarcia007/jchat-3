// Unit tests for utils/dmHidden.ts (manual cut-off vs sticky exit hide of a DM conversation).
// Run from mobile/:  node --test scripts/dm-hidden.test.mjs
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const dir = mkdtempSync(join(tmpdir(), 'dm-hidden-'));
const source = readFileSync(new URL('../utils/dmHidden.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
writeFileSync(join(dir, 'dmHidden.mjs'), outputText);
const { isConversationVisible, isExitHidden, manualCutoff } = await import(pathToFileURL(join(dir, 'dmHidden.mjs')).href);

const T1 = '2026-10-20T10:00:00.000Z';
const T2 = '2026-10-20T11:00:00.000Z';
const T3 = '2026-10-20T12:00:00.000Z';

test('nothing hidden: visible', () => {
  assert.equal(isConversationVisible(null, null, T1), true);
  assert.equal(isConversationVisible(undefined, undefined, null), true);
});
test('only manual: a cut-off, a newer message shows it again, an older one does not', () => {
  assert.equal(isConversationVisible(T2, null, T1), false);
  assert.equal(isConversationVisible(T2, null, T3), true);
  assert.equal(isConversationVisible(T2, null, null), false);
  assert.equal(manualCutoff(T2), T2);
  assert.equal(manualCutoff(null), null);
});
test('only exit: hidden', () => {
  assert.equal(isExitHidden(T1), true);
  assert.equal(isExitHidden(null), false);
  assert.equal(isConversationVisible(null, T1, T2), false);
});
test('both: hidden, even if the last message is newer than the manual cut-off', () => {
  assert.equal(isConversationVisible(T1, T2, T3), false);
});
test('a new message after the exit does NOT bring it back (sticky)', () => {
  assert.equal(isConversationVisible(null, T1, T3), false);
});
test('resume clears only the exit: it shows again, and a manual hide stays', () => {
  assert.equal(isConversationVisible(null, null, T3), true);
  assert.equal(isConversationVisible(T2, null, T1), false); // manual hide survives resume
  assert.equal(isConversationVisible(T2, null, T3), true);
});
