// The text filter (migration 259) answers `message_not_allowed` (22023). Unit tests for how the app recognises it and for its es / en text.
// Run from mobile/:  node --test scripts/text-filter-error.test.mjs
// utils/errors.ts imports the i18n runtime, so only the pure matcher is evaluated: its source is cut out and transpiled with the repo's typescript.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../utils/errors.ts', import.meta.url), 'utf8');
const match = /export function isMessageNotAllowedError\([\s\S]*?\n}\n/.exec(source);
assert.ok(match, 'isMessageNotAllowedError is exported from utils/errors.ts');
const { outputText } = ts.transpileModule(match[0], { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
const { isMessageNotAllowedError } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('PostgREST hands the refusal over as a plain object { code: 22023, message: message_not_allowed }', () => {
  assert.equal(isMessageNotAllowedError({ code: '22023', message: 'message_not_allowed', details: null, hint: null }), true);
  assert.equal(isMessageNotAllowedError(new Error('message_not_allowed')), true);
  assert.equal(isMessageNotAllowedError({ message: 'new row violates … message_not_allowed' }), true);
});

test('other errors are not taken for a refused text', () => {
  assert.equal(isMessageNotAllowedError({ code: '22023', message: 'invalid_claim' }), false);
  assert.equal(isMessageNotAllowedError({ code: '23505', message: 'duplicate key value' }), false);
  assert.equal(isMessageNotAllowedError(new Error('Network request failed')), false);
  assert.equal(isMessageNotAllowedError(null), false);
  assert.equal(isMessageNotAllowedError(undefined), false);
  assert.equal(isMessageNotAllowedError('message_not_allowed'), false);
  assert.equal(isMessageNotAllowedError({ message: 42 }), false);
});

test('toUserMessage maps it to errors:app.message_not_allowed, before the generic object branch', () => {
  const order = [
    source.indexOf("isMessageNotAllowedError(err)) {\n    message = tr('errors:app.message_not_allowed')"),
    source.indexOf('const decline = declineMessage(err)'),
  ];
  assert.ok(order[0] > 0 && order[1] > order[0]);
});

test('the text is in es and en, the same wording the product asked for', () => {
  const read = (lang) => JSON.parse(readFileSync(new URL(`../i18n/locales/${lang}/errors.json`, import.meta.url), 'utf8'));
  assert.equal(read('es').app.message_not_allowed, 'Ese texto no está permitido. Revísalo e inténtalo de nuevo.');
  assert.equal(read('en').app.message_not_allowed, "That text isn't allowed. Please review it and try again.");
  for (const lang of ['es', 'en']) {
    const web = JSON.parse(readFileSync(new URL(`../../web/messages/${lang}.json`, import.meta.url), 'utf8'));
    const text = Object.values(web).flatMap((v) => (v && typeof v === 'object' ? Object.entries(v) : [])).find(([k]) => k === 'chatRoomsTextNotAllowed');
    assert.ok(text && typeof text[1] === 'string', `web ${lang} has chatRoomsTextNotAllowed`);
  }
});
