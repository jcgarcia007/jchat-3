// Unit tests for lib/embedTableContext.ts (the table the app tells the framed menu about). Run from web/:
//   node --test scripts/embed-table-context.test.mjs

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const dir = mkdtempSync(join(tmpdir(), 'embed-table-'));
const file = join(dir, 'embedTableContext.mjs');
writeFileSync(file, ts.transpileModule(readFileSync(new URL('../lib/embedTableContext.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText);
const { parseTableContextMessage, readyMessage, MENU_MESSAGE_TYPE } = await import(pathToFileURL(file).href);

const good = { type: 'jchat:menu', event: 'context', table: { token: 'bar-xzx-table-1a2b3c4d', label: 'T8' } };

test('a well-formed context message is accepted', () => {
  assert.deepEqual(parseTableContextMessage(good), { token: 'bar-xzx-table-1a2b3c4d', label: 'T8' });
  assert.deepEqual(parseTableContextMessage({ ...good, table: { token: 'bar-xzx-table-1a2b3c4d', label: 'Terraza 2' } }), { token: 'bar-xzx-table-1a2b3c4d', label: 'Terraza 2' });
});

test('wrong type / event / extra or missing keys are refused', () => {
  for (const bad of [
    null, undefined, 'x', 42, [], {},
    { ...good, type: 'other' },
    { ...good, event: 'order_placed' },
    { ...good, event: 'ready' },
    { ...good, extra: 1 },
    { type: good.type, event: good.event },
    { ...good, table: null },
    { ...good, table: { token: good.table.token } },
    { ...good, table: { ...good.table, extra: 'x' } },
  ]) {
    assert.equal(parseTableContextMessage(bad), null, JSON.stringify(bad));
  }
});

test('tokens and labels are validated: no markup, no control characters, no URLs, bounded length', () => {
  const t = (token, label = 'T8') => parseTableContextMessage({ ...good, table: { token, label } });
  for (const token of ['', 'short', 'UPPER-CASE-TABLE-1234', 'has space-table-12345678', 'https://evil.example/x', 'a'.repeat(80), "x';drop-table", 5, null]) {
    assert.equal(t(token), null, String(token));
  }
  for (const label of ['', 'x'.repeat(41), '<b>5</b>', 'line\nbreak', 'tab\t', 5, null]) {
    assert.equal(t('bar-xzx-table-1a2b3c4d', label), null, String(label));
  }
});

test('the ready message has the shared type and nothing else', () => {
  assert.deepEqual(readyMessage(), { type: MENU_MESSAGE_TYPE, event: 'ready' });
  assert.equal(JSON.stringify(readyMessage()).includes('token'), false);
});
