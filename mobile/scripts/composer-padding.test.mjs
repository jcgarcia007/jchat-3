// Unit tests for utils/composerPadding.ts (bottom padding of the chat composers).
// Run from mobile/:  node --test scripts/composer-padding.test.mjs
// The module is TypeScript: it is transpiled with the repo's own `typescript` into a temp dir and imported.

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const dir = mkdtempSync(join(tmpdir(), 'composer-padding-'));
const source = readFileSync(new URL('../utils/composerPadding.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
writeFileSync(join(dir, 'composerPadding.mjs'), outputText);
const { composerBottomPadding, COMPOSER_MIN_PADDING } = await import(pathToFileURL(join(dir, 'composerPadding.mjs')).href);

test('keyboard closed on a Face ID iPhone: the bar clears the home indicator (34)', () => {
  assert.equal(composerBottomPadding(34, false), 34);
});

test('keyboard closed on a device without inset: never less than 8', () => {
  assert.equal(composerBottomPadding(0, false), 8);
  assert.equal(composerBottomPadding(3, false), 8);
});

test('keyboard open: always 8, whatever the inset (no gap above the keys)', () => {
  assert.equal(composerBottomPadding(34, true), 8);
  assert.equal(composerBottomPadding(0, true), 8);
});

test('a bad inset value (NaN) falls back to the minimum', () => {
  assert.equal(composerBottomPadding(Number.NaN, false), COMPOSER_MIN_PADDING);
});
