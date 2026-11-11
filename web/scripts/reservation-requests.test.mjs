// Unit tests for lib/reservationRequests.ts (request chips of a reservation in the dashboard). Run from web/:
//   node --test scripts/reservation-requests.test.mjs

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const dir = mkdtempSync(join(tmpdir(), 'reservation-requests-'));
const out = join(dir, 'reservationRequests.mjs');
writeFileSync(out, ts.transpileModule(readFileSync(new URL('../lib/reservationRequests.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText);
const { REQUEST_KEYS, parseRequests, requestsDisplay } = await import(pathToFileURL(out).href);

const messages = (lang) => JSON.parse(readFileSync(new URL(`../messages/${lang}.json`, import.meta.url), 'utf8')).dashboardCommon;

test('known keys are returned in the chips\' order', () => {
  assert.deepEqual(parseRequests('terrace,birthday'), { keys: ['birthday', 'terrace'], legacy: null });
  assert.deepEqual(parseRequests(' high_chair '), { keys: ['high_chair'], legacy: null });
});

test('old free text (or a mix) is shown as it is', () => {
  assert.deepEqual(parseRequests('Window table please'), { keys: [], legacy: 'Window table please' });
  assert.deepEqual(parseRequests('Need a high chair'), { keys: [], legacy: 'Need a high chair' });
  assert.deepEqual(parseRequests('birthday, near the window'), { keys: [], legacy: 'birthday, near the window' });
});

test('empty and null give nothing', () => {
  assert.deepEqual(parseRequests(''), { keys: [], legacy: null });
  assert.deepEqual(parseRequests(null), { keys: [], legacy: null });
  assert.equal(requestsDisplay(undefined, (k) => k), null);
});

test('requestsDisplay translates the keys and leaves old text alone', () => {
  assert.equal(requestsDisplay('birthday,terrace', (k) => `<${k}>`), '<birthday> · <terrace>');
  assert.equal(requestsDisplay('Projector screen requested', (k) => `<${k}>`), 'Projector screen requested');
});

test('every key has a text in es and en (parity)', () => {
  for (const lang of ['es', 'en']) {
    const m = messages(lang);
    for (const key of REQUEST_KEYS) assert.ok(typeof m[`resRequest_${key}`] === 'string' && m[`resRequest_${key}`].length > 0, `${lang} resRequest_${key}`);
  }
  assert.equal(REQUEST_KEYS.length, 9);
});

test('the web list is the app list', () => {
  const app = readFileSync(new URL('../../mobile/utils/reservationFlow.ts', import.meta.url), 'utf8');
  const m = /REQUEST_KEYS = \[([^\]]+)\] as const/.exec(app);
  assert.ok(m);
  assert.deepEqual(m[1].split(',').map((s) => s.trim().replace(/'/g, '')), [...REQUEST_KEYS]);
});
