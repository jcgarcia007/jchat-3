// Unit tests for lib/embedCheckoutPath.ts (guest vs signed-in checkout path of the public menu). Run from web/:
//   node --test scripts/embed-checkout-path.test.mjs

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const dir = mkdtempSync(join(tmpdir(), 'embed-path-'));
const out = join(dir, 'embedCheckoutPath.mjs');
writeFileSync(out, ts.transpileModule(readFileSync(new URL('../lib/embedCheckoutPath.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText);
const { decideCheckoutPath, isEmbedSearch } = await import(pathToFileURL(out).href);

test('embed + session → guest (the cookie of the same-site iframe is ignored)', () => {
  assert.equal(decideCheckoutPath({ embed: true, hasSession: true }), 'guest');
});

test('embed without session → guest', () => {
  assert.equal(decideCheckoutPath({ embed: true, hasSession: false }), 'guest');
});

test('no embed + session → authenticated (unchanged)', () => {
  assert.equal(decideCheckoutPath({ embed: false, hasSession: true }), 'authenticated');
});

test('no embed, no session → guest (unchanged)', () => {
  assert.equal(decideCheckoutPath({ embed: false, hasSession: false }), 'guest');
});

test('embed mode is exactly ?embed=1', () => {
  assert.equal(isEmbedSearch('?embed=1'), true);
  assert.equal(isEmbedSearch('embed=1&room=abc'), true);
  assert.equal(isEmbedSearch('?app=1&embed=1'), true);
  for (const s of ['', '?', '?embed=0', '?embed=true', '?embed=', '?embedded=1', '?app=1', null, undefined]) {
    assert.equal(isEmbedSearch(s), false, String(s));
  }
});
