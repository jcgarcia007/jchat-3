// JChat 3.0 — the order_placed message of the web menu sheet and the claim of the guest order
// (utils/menuSheetMessage.ts parseMenuOrderPlaced, utils/claimEmbeddedOrder.ts). Synthetic ids and codes only.
// Run: node scripts/menu-order-claim.test.mjs
import assert from 'node:assert/strict';
import { parseMenuOrderPlaced, parseMenuSheetMessage } from '../utils/menuSheetMessage.ts';
import { buildClaimArgs, claimErrorKind } from '../utils/claimEmbeddedOrder.ts';

const ORIGIN = 'https://jchat.cloud';
const ID = '0b4895d0-5dc5-4c7f-8303-52748d0fe823';
const CODE = 'AbCdEfGhIjKlMnOpQrStUv12';
const msg = (data, origin = ORIGIN) => ({ origin, data });
const placed = (extra = {}) => ({ type: 'jchat:menu', event: 'order_placed', ...extra });

// With and without the fields.
assert.deepEqual(parseMenuOrderPlaced(msg(placed({ orderId: ID, trackingCode: CODE })), ORIGIN), { orderId: ID, trackingCode: CODE });
assert.deepEqual(parseMenuOrderPlaced(msg(placed({ trackingCode: CODE })), ORIGIN), { trackingCode: CODE });
assert.deepEqual(parseMenuOrderPlaced(msg(placed({ orderId: ID })), ORIGIN), { orderId: ID });
assert.deepEqual(parseMenuOrderPlaced(msg(placed()), ORIGIN), {}, 'the bare event (tab orders) still counts as "an order was placed"');

// Malformed fields are dropped, not forwarded.
assert.deepEqual(parseMenuOrderPlaced(msg(placed({ orderId: 'nope', trackingCode: 'short' })), ORIGIN), {});
assert.deepEqual(parseMenuOrderPlaced(msg(placed({ orderId: 5, trackingCode: { a: 1 } })), ORIGIN), {});
assert.deepEqual(parseMenuOrderPlaced(msg(placed({ trackingCode: 'x'.repeat(200) })), ORIGIN), {});
assert.deepEqual(parseMenuOrderPlaced(msg(placed({ trackingCode: 'https://evil.example/aaaaaaaaaaaa' })), ORIGIN), {});

// Bad origins and shapes are refused outright (null), whatever the payload.
for (const origin of ['https://evil.example', 'https://jchat.cloud.evil.com', 'http://jchat.cloud', 'https://app.jchat.cloud', 'null', '']) {
  assert.equal(parseMenuOrderPlaced(msg(placed({ orderId: ID, trackingCode: CODE }), origin), ORIGIN), null, origin);
}
for (const data of [null, undefined, 'order_placed', 42, [], {}, { type: 'other', event: 'order_placed' }, { type: 'jchat:menu', event: 'ready' }, { type: 'jchat:menu', event: 'context' }]) {
  assert.equal(parseMenuOrderPlaced(msg(data), ORIGIN), null, JSON.stringify(data));
}
// The local test origin works when it is the configured one.
assert.deepEqual(parseMenuOrderPlaced(msg(placed({ orderId: ID, trackingCode: CODE }), 'http://127.0.0.1:3100'), 'http://127.0.0.1:3100'), { orderId: ID, trackingCode: CODE });
// The older event parser still sees the same message as order_placed.
assert.equal(parseMenuSheetMessage(msg(placed({ orderId: ID, trackingCode: CODE })), ORIGIN), 'order_placed');

// RPC arguments: exactly the three named parameters; nothing to claim without both id and code.
const ROOM = '9a462992-2dbf-4264-a4b6-c365bd4626f1';
assert.deepEqual(buildClaimArgs({ orderId: ID, trackingCode: CODE }, ROOM), { p_order_id: ID, p_tracking_code: CODE, p_room_id: ROOM });
assert.deepEqual(buildClaimArgs({ orderId: ID, trackingCode: CODE }, null), { p_order_id: ID, p_tracking_code: CODE, p_room_id: null });
assert.deepEqual(buildClaimArgs({ orderId: ID, trackingCode: CODE }, undefined), { p_order_id: ID, p_tracking_code: CODE, p_room_id: null });
assert.equal(buildClaimArgs({ trackingCode: CODE }, ROOM), null);
assert.equal(buildClaimArgs({ orderId: ID }, ROOM), null);
assert.equal(buildClaimArgs({}, ROOM), null);

// Error mapping (SQLSTATE first, message second).
assert.equal(claimErrorKind({ code: '42501', message: 'claim_not_allowed' }), 'claim_not_allowed');
assert.equal(claimErrorKind({ code: '22023', message: 'invalid_claim' }), 'invalid_claim');
assert.equal(claimErrorKind({ code: '28000', message: 'not_authenticated' }), 'not_authenticated');
assert.equal(claimErrorKind({ message: 'claim_not_allowed' }), 'claim_not_allowed');
assert.equal(claimErrorKind({ code: '57014', message: 'timeout' }), 'error');
assert.equal(claimErrorKind(null), 'error');
assert.equal(claimErrorKind(undefined), 'error');

console.log('menu order claim OK');
