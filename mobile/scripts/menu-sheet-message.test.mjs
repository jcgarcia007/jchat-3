// Unit tests for utils/menuSheetMessage.ts (messages from the embedded menu). Run from mobile/:
//   node --test scripts/menu-sheet-message.test.mjs

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const dir = mkdtempSync(join(tmpdir(), 'menu-msg-'));
const file = join(dir, 'menuSheetMessage.mjs');
writeFileSync(file, ts.transpileModule(readFileSync(new URL('../utils/menuSheetMessage.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText);
const { parseMenuSheetMessage } = await import(pathToFileURL(file).href);

const ORIGIN = 'https://jchat.cloud';
const ok = { type: 'jchat:menu', event: 'order_placed' };

test('the right origin and shape → order_placed', () => {
  assert.equal(parseMenuSheetMessage({ origin: ORIGIN, data: ok }, ORIGIN), 'order_placed');
});

test('any other origin is ignored (exact match: no sub-domains, no look-alikes, no scheme change)', () => {
  for (const origin of ['https://evil.example', 'https://jchat.cloud.evil.com', 'http://jchat.cloud', 'https://app.jchat.cloud', 'null', '']) {
    assert.equal(parseMenuSheetMessage({ origin, data: ok }, ORIGIN), null, origin);
  }
});

test('wrong type / event / shape is ignored', () => {
  for (const data of [null, undefined, 'order_placed', 42, [], {}, { type: 'other', event: 'order_placed' }, { type: 'jchat:menu' }, { type: 'jchat:menu', event: 'paid' }, { event: 'order_placed' }]) {
    assert.equal(parseMenuSheetMessage({ origin: ORIGIN, data }, ORIGIN), null, JSON.stringify(data));
  }
});

test('the allowed origin is a parameter (a local test build uses the local Next origin)', () => {
  assert.equal(parseMenuSheetMessage({ origin: 'http://127.0.0.1:3100', data: ok }, 'http://127.0.0.1:3100'), 'order_placed');
  assert.equal(parseMenuSheetMessage({ origin: ORIGIN, data: ok }, 'http://127.0.0.1:3100'), null);
});
