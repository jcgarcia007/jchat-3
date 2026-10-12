// Unit tests for services/profileEvents.ts (my name / photo changed → the chat updates at once). Run from mobile/:
//   node --test scripts/profile-events.test.mjs

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const dir = mkdtempSync(join(tmpdir(), 'profile-events-'));
const file = join(dir, 'profileEvents.mjs');
writeFileSync(file, ts.transpileModule(readFileSync(new URL('../services/profileEvents.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText);
const { emitMyProfileChanged, subscribeMyProfileChanged } = await import(pathToFileURL(file).href);

test('a subscriber receives the change; after unsubscribing it does not', () => {
  const seen = [];
  const off = subscribeMyProfileChanged((c) => seen.push(c));
  emitMyProfileChanged({ userId: 'u1', avatarUrl: 'https://x/a.jpg' });
  emitMyProfileChanged({ userId: 'u1', displayName: 'Ana' });
  off();
  emitMyProfileChanged({ userId: 'u1', displayName: 'Ignored' });
  assert.deepEqual(seen, [{ userId: 'u1', avatarUrl: 'https://x/a.jpg' }, { userId: 'u1', displayName: 'Ana' }]);
});

test('every subscriber gets it, and one that throws does not stop the others being registered', () => {
  const a = [];
  const b = [];
  const offA = subscribeMyProfileChanged((c) => a.push(c.userId));
  const offB = subscribeMyProfileChanged((c) => b.push(c.userId));
  emitMyProfileChanged({ userId: 'u2' });
  offA();
  offB();
  assert.deepEqual(a, ['u2']);
  assert.deepEqual(b, ['u2']);
});
