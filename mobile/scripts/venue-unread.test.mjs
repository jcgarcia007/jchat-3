// Unit tests for utils/venueUnread.ts (which chat messages count as unread for the venue session). Run from mobile/:
//   node --test scripts/venue-unread.test.mjs

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const dir = mkdtempSync(join(tmpdir(), 'venue-unread-'));
const file = join(dir, 'venueUnread.mjs');
writeFileSync(file, ts.transpileModule(readFileSync(new URL('../utils/venueUnread.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText);
const { shouldCountUnread } = await import(pathToFileURL(file).href);

test('my own messages never count', () => {
  for (const chatMounted of [true, false]) for (const chatCovered of [true, false]) {
    assert.equal(shouldCountUnread({ fromMe: true, chatMounted, chatCovered }), false);
  }
});

test('someone else\'s message counts when the chat is not mounted', () => {
  assert.equal(shouldCountUnread({ fromMe: false, chatMounted: false, chatCovered: false }), true);
});

test('…and not while the chat is mounted and in front', () => {
  assert.equal(shouldCountUnread({ fromMe: false, chatMounted: true, chatCovered: false }), false);
});

test('…but it counts when the chat is mounted yet covered by the profile sheet', () => {
  assert.equal(shouldCountUnread({ fromMe: false, chatMounted: true, chatCovered: true }), true);
});
