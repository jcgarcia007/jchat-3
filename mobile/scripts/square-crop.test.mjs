// Unit tests for utils/squareCrop.ts (center crop of a web avatar). Run from mobile/:
//   node --test scripts/square-crop.test.mjs

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const dir = mkdtempSync(join(tmpdir(), 'square-crop-'));
const file = join(dir, 'squareCrop.mjs');
writeFileSync(file, ts.transpileModule(readFileSync(new URL('../utils/squareCrop.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText);
const { centerSquareCrop, avatarOutputSide, AVATAR_SIDE } = await import(pathToFileURL(file).href);

test('a landscape photo is cropped from the left and right', () => {
  assert.deepEqual(centerSquareCrop(4000, 3000), { originX: 500, originY: 0, width: 3000, height: 3000 });
});

test('a portrait photo is cropped from the top and bottom', () => {
  assert.deepEqual(centerSquareCrop(3000, 4000), { originX: 0, originY: 500, width: 3000, height: 3000 });
});

test('a square photo is kept whole; odd differences round down to whole pixels', () => {
  assert.deepEqual(centerSquareCrop(800, 800), { originX: 0, originY: 0, width: 800, height: 800 });
  assert.deepEqual(centerSquareCrop(1001, 800), { originX: 100, originY: 0, width: 800, height: 800 });
  assert.deepEqual(centerSquareCrop(800.9, 600.2), { originX: 100, originY: 0, width: 600, height: 600 });
});

test('degenerate sizes give an empty crop', () => {
  assert.deepEqual(centerSquareCrop(0, 500), { originX: 0, originY: 0, width: 0, height: 0 });
  assert.deepEqual(centerSquareCrop(NaN, 500), { originX: 0, originY: 0, width: 0, height: 0 });
});

test('the output is 512 px, never enlarged beyond the source', () => {
  assert.equal(AVATAR_SIDE, 512);
  assert.equal(avatarOutputSide(3000), 512);
  assert.equal(avatarOutputSide(300), 300);
  assert.equal(avatarOutputSide(0), 1);
});
