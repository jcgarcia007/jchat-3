// Unit tests for utils/dmPreview.ts (inbox preview by message type). Run from mobile/:
//   node --test scripts/dm-preview.test.mjs

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const dir = mkdtempSync(join(tmpdir(), 'dm-preview-'));
const file = join(dir, 'dmPreview.mjs');
writeFileSync(file, ts.transpileModule(readFileSync(new URL('../utils/dmPreview.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText);
const { dmPreviewKind } = await import(pathToFileURL(file).href);

test('a text message previews as text', () => {
  assert.equal(dmPreviewKind({ body: 'hola', media_url: null, voice_url: null }), 'text');
});

test('a photo (media_url, no body) previews as photo — it used to say "no messages yet"', () => {
  assert.equal(dmPreviewKind({ body: null, media_url: 'dm/a/b.jpg', voice_url: null }), 'photo');
});

test('a voice note (voice_url) previews as voice, even if a photo field is also there', () => {
  assert.equal(dmPreviewKind({ body: null, voice_url: 'dm/a/b.m4a', media_url: null }), 'voice');
  assert.equal(dmPreviewKind({ body: null, voice_url: 'dm/a/b.m4a', media_url: 'x.jpg' }), 'voice');
});

test('a gift card previews as gift', () => {
  assert.equal(dmPreviewKind({ body: null, gift_offer_id: 'offer-1' }), 'gift');
});

test('media wins over a caption; blank text is "none"; no message is "none"', () => {
  assert.equal(dmPreviewKind({ body: 'mira', media_url: 'x.jpg' }), 'photo');
  assert.equal(dmPreviewKind({ body: '   ' }), 'none');
  assert.equal(dmPreviewKind({ body: null }), 'none');
  assert.equal(dmPreviewKind(null), 'none');
  assert.equal(dmPreviewKind(undefined), 'none');
});
