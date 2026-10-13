// Unit tests for lib/embedOrderMessage.ts (the order_placed message of the embedded menu). Run from web/:
//   node --test scripts/embed-order-message.test.mjs

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const dir = mkdtempSync(join(tmpdir(), 'embed-order-'));
const compile = (name) => {
  const out = join(dir, `${name}.mjs`);
  let code = ts.transpileModule(readFileSync(new URL(`../lib/${name}.ts`, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
  code = code.replace('from "./embedTableContext"', `from "${pathToFileURL(join(dir, 'embedTableContext.mjs')).href}"`);
  writeFileSync(out, code);
  return pathToFileURL(out).href;
};
compile('embedTableContext');
const { buildOrderPlacedMessage } = await import(compile('embedOrderMessage'));

const ID = '0b4895d0-5dc5-4c7f-8303-52748d0fe823';
const CODE = 'AbCdEfGhIjKlMnOpQrStUv12'; // synthetic

test('no info → the bare event (the old behaviour: only "an order was placed")', () => {
  assert.deepEqual(buildOrderPlacedMessage(), { type: 'jchat:menu', event: 'order_placed' });
  assert.deepEqual(buildOrderPlacedMessage(null), { type: 'jchat:menu', event: 'order_placed' });
  assert.deepEqual(buildOrderPlacedMessage({}), { type: 'jchat:menu', event: 'order_placed' });
});

test('with a valid order id and tracking code both are included', () => {
  assert.deepEqual(buildOrderPlacedMessage({ orderId: ID, trackingCode: CODE }), { type: 'jchat:menu', event: 'order_placed', orderId: ID, trackingCode: CODE });
});

test('each field is optional on its own', () => {
  assert.deepEqual(buildOrderPlacedMessage({ trackingCode: CODE }), { type: 'jchat:menu', event: 'order_placed', trackingCode: CODE });
  assert.deepEqual(buildOrderPlacedMessage({ orderId: ID }), { type: 'jchat:menu', event: 'order_placed', orderId: ID });
});

test('malformed values are dropped, never forwarded', () => {
  for (const orderId of ['', 'not-a-uuid', ID + 'x', '<b>', 5, {}, null, undefined]) {
    assert.equal('orderId' in buildOrderPlacedMessage({ orderId, trackingCode: CODE }), false, String(orderId));
  }
  for (const trackingCode of ['', 'short', 'has space in it 123456', 'x'.repeat(200), 'https://evil.example/aaaaaaaa', 7, null, undefined]) {
    assert.equal('trackingCode' in buildOrderPlacedMessage({ orderId: ID, trackingCode }), false, String(trackingCode));
  }
});

test('the message never carries anything but type, event and the two optional fields', () => {
  const m = buildOrderPlacedMessage({ orderId: ID, trackingCode: CODE, extra: 'x' });
  assert.deepEqual(Object.keys(m).sort(), ['event', 'orderId', 'trackingCode', 'type']);
});
