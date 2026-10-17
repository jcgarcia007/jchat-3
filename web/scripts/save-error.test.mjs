// Unit tests for lib/saveError.ts. Run from web/:  node --test scripts/save-error.test.mjs

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const dir = mkdtempSync(join(tmpdir(), 'save-error-'));
const out = join(dir, 'saveError.mjs');
writeFileSync(out, ts.transpileModule(readFileSync(new URL('../lib/saveError.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText);
const { describeSaveError } = await import(pathToFileURL(out).href);

test('permission denied / row-level security / 42501 / 403 → permission', () => {
  assert.equal(describeSaveError({ code: '42501', message: 'permission denied for table businesses' }).kind, 'permission');
  assert.equal(describeSaveError(new Error('new row violates row-level security policy for table "x"')).kind, 'permission');
  assert.equal(describeSaveError({ message: 'Permission denied' }).kind, 'permission');
  assert.equal(describeSaveError({ status: 403 }).kind, 'permission');
  assert.equal(describeSaveError({ code: '42501', message: 'x' }).code, '42501');
});

test('Failed to fetch and friends → network (no technical code needed)', () => {
  for (const m of ['Failed to fetch', 'TypeError: NetworkError when attempting to fetch resource.', 'Load failed', 'Network request failed']) {
    assert.deepEqual(describeSaveError(new TypeError(m)), { kind: 'network', code: null }, m);
  }
});

test('anything else → generic with a small technical code (SQLSTATE first, else the trimmed message)', () => {
  assert.deepEqual(describeSaveError({ code: '23505', message: 'duplicate key value' }), { kind: 'generic', code: '23505' });
  assert.deepEqual(describeSaveError(new Error('boom')), { kind: 'generic', code: 'boom' });
  assert.equal(describeSaveError(new Error('x'.repeat(300))).code.length, 80);
  assert.deepEqual(describeSaveError(null), { kind: 'generic', code: null });
  assert.deepEqual(describeSaveError(undefined), { kind: 'generic', code: null });
});

test('a permission error wins over a network-sounding word in its text', () => {
  assert.equal(describeSaveError({ code: '42501', message: 'permission denied (network policy)' }).kind, 'permission');
});
