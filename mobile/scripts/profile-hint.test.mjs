// Unit tests for utils/profileHint.ts (show the "Tu perfil está aquí" hint once per account). Run from mobile/:
//   node --test scripts/profile-hint.test.mjs

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const dir = mkdtempSync(join(tmpdir(), 'profile-hint-'));
const file = join(dir, 'profileHint.mjs');
writeFileSync(file, ts.transpileModule(readFileSync(new URL('../utils/profileHint.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText);
const { decideProfileHint, profileHintStorageKey, profileHintAllowed } = await import(pathToFileURL(file).href);

test('never seen anywhere → show, nothing to sync', () => {
  assert.deepEqual(decideProfileHint({ local: false, remote: false }), { show: true, syncLocal: false, syncRemote: false });
  assert.deepEqual(decideProfileHint({ local: null, remote: null }), { show: true, syncLocal: false, syncRemote: false });
});

test('seen on this device and saved to the account → never again, nothing to sync', () => {
  assert.deepEqual(decideProfileHint({ local: true, remote: true }), { show: false, syncLocal: false, syncRemote: false });
});

test('seen on this device but the account save failed → not shown again here, saved again on this opening', () => {
  assert.deepEqual(decideProfileHint({ local: true, remote: false }), { show: false, syncLocal: false, syncRemote: true });
  // the account could not be read at all: the save is retried too (it is a read-merge-write, so it is safe)
  assert.deepEqual(decideProfileHint({ local: true, remote: null }), { show: false, syncLocal: false, syncRemote: true });
});

test('seen on another device (account says so) → not shown, remembered on this one', () => {
  assert.deepEqual(decideProfileHint({ local: false, remote: true }), { show: false, syncLocal: true, syncRemote: false });
  assert.deepEqual(decideProfileHint({ local: null, remote: true }), { show: false, syncLocal: true, syncRemote: false });
});

test('the device flag is per account', () => {
  assert.notEqual(profileHintStorageKey('a'), profileHintStorageKey('b'));
  assert.match(profileHintStorageKey('abc'), /profileMenuSeen/);
});

test('allowed only inside the chat, never while the entry screen is visible', () => {
  assert.equal(profileHintAllowed({ entryVisible: false, inChat: true }), true);
  assert.equal(profileHintAllowed({ entryVisible: true, inChat: true }), false);
  assert.equal(profileHintAllowed({ entryVisible: false, inChat: false }), false);
});
