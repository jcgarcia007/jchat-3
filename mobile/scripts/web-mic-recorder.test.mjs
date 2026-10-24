// Unit tests for services/webMicRecorder.ts (the web voice recorder: ONE getUserMedia, typed failures).
// Run from mobile/:  node --test scripts/web-mic-recorder.test.mjs

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const dir = mkdtempSync(join(tmpdir(), 'web-mic-'));
const file = join(dir, 'webMicRecorder.mjs');
writeFileSync(
  file,
  ts.transpileModule(readFileSync(new URL('../services/webMicRecorder.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  }).outputText,
);
const { startWebMic, WebMicError } = await import(pathToFileURL(file).href);

function fakeEnv({ rejectWith, startThrows } = {}) {
  const log = { getUserMedia: 0, stopped: 0, constructed: 0, options: null };
  let clock = 1000;
  class FakeRecorder {
    state = 'inactive';
    listeners = {};
    constructor(stream, options) {
      log.constructed += 1;
      log.options = options;
    }
    addEventListener(type, fn) {
      this.listeners[type] = fn;
    }
    start() {
      if (startThrows) throw new Error('boom');
      this.state = 'recording';
    }
    stop() {
      this.state = 'inactive';
      this.listeners.dataavailable?.({ data: new Blob(['abc']) });
      this.listeners.stop?.();
    }
  }
  const track = { stop: () => (log.stopped += 1) };
  return {
    log,
    advance: (ms) => (clock += ms),
    env: {
      getUserMedia: async () => {
        log.getUserMedia += 1;
        if (rejectWith) throw rejectWith;
        return { getTracks: () => [track] };
      },
      MediaRecorder: FakeRecorder,
      createObjectURL: () => 'blob:fake',
      now: () => clock,
    },
  };
}

test('asks for the microphone exactly once and feeds that stream to the MediaRecorder', async () => {
  const { env, log } = fakeEnv();
  await startWebMic('audio/mp4', env);
  assert.equal(log.getUserMedia, 1);
  assert.equal(log.constructed, 1);
  assert.equal(log.options.mimeType, 'audio/mp4');
});

test('stop returns a blob: uri with the elapsed time and releases the microphone', async () => {
  const { env, log, advance } = fakeEnv();
  const session = await startWebMic('audio/mp4', env);
  advance(2500);
  assert.equal(session.elapsedMs(), 2500);
  const result = await session.stop();
  assert.deepEqual(result, { uri: 'blob:fake', durationMs: 2500 });
  assert.equal(log.stopped, 1);
  assert.equal(log.getUserMedia, 1, 'stopping never asks again');
});

test('cancel releases the microphone and returns nothing', async () => {
  const { env, log } = fakeEnv();
  const session = await startWebMic('audio/mp4', env);
  session.cancel();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(log.stopped, 1);
  assert.equal(await session.stop(), null);
});

test('NotAllowedError → denied; SecurityError → denied; other → failed', async () => {
  for (const [name, kind] of [['NotAllowedError', 'denied'], ['SecurityError', 'denied'], ['NotFoundError', 'failed']]) {
    const { env } = fakeEnv({ rejectWith: Object.assign(new Error(name), { name }) });
    await assert.rejects(startWebMic('audio/mp4', env), (e) => e instanceof WebMicError && e.kind === kind);
  }
});

test('no getUserMedia or no MediaRecorder → unsupported (and no request is made)', async () => {
  const { env } = fakeEnv();
  await assert.rejects(startWebMic('audio/mp4', { ...env, getUserMedia: undefined }), (e) => e.kind === 'unsupported');
  await assert.rejects(startWebMic('audio/mp4', { ...env, MediaRecorder: undefined }), (e) => e.kind === 'unsupported');
});

test('a recorder that cannot start frees the microphone and reports failed', async () => {
  const { env, log } = fakeEnv({ startThrows: true });
  await assert.rejects(startWebMic('audio/mp4', env), (e) => e.kind === 'failed');
  assert.equal(log.stopped, 1);
});

test('the web bar requests the microphone through the service only (no expo-audio permission call)', () => {
  const bar = readFileSync(new URL('../components/common/VoiceRecorderBar.web.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(bar, /from 'expo-audio'|requestRecordingPermissionsAsync\(|useAudioRecorder\(/);
  assert.match(bar, /startWebMic\(/);
});
