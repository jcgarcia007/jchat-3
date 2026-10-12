// Unit tests for services/webVoice.web.ts (which voice type the browser may record). Run from mobile/:
//   node --test scripts/web-voice.test.mjs

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const dir = mkdtempSync(join(tmpdir(), 'web-voice-'));
const file = join(dir, 'webVoice.web.mjs');
writeFileSync(
  file,
  ts.transpileModule(readFileSync(new URL('../services/webVoice.web.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  }).outputText,
);
const { webVoiceMimeType, canRecordVoice } = await import(pathToFileURL(file).href);

const withRecorder = (supported) => {
  globalThis.MediaRecorder = { isTypeSupported: (t) => supported.includes(t) };
};

test('no MediaRecorder: cannot record', () => {
  delete globalThis.MediaRecorder;
  assert.equal(webVoiceMimeType(), null);
  assert.equal(canRecordVoice(), false);
});

test('webm/opus only (Firefox): cannot record', () => {
  withRecorder(['audio/webm', 'audio/webm;codecs=opus']);
  assert.equal(webVoiceMimeType(), null);
  assert.equal(canRecordVoice(), false);
});

test('mp4 with AAC codec wins', () => {
  withRecorder(['audio/mp4', 'audio/mp4;codecs=mp4a.40.2', 'audio/webm']);
  assert.equal(webVoiceMimeType(), 'audio/mp4;codecs=mp4a.40.2');
  assert.equal(canRecordVoice(), true);
});

test('plain audio/mp4 is enough', () => {
  withRecorder(['audio/mp4']);
  assert.equal(webVoiceMimeType(), 'audio/mp4');
});
