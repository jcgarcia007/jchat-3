// JChat 3.0 — buildTableContextMessage (utils/menuTableMessage.ts) and the in-memory table token
// (services/venueTable.ts). Run: node scripts/menu-table-message.test.mjs
import assert from 'node:assert/strict';
import { buildTableContextMessage } from '../utils/menuTableMessage.ts';
import { parseMenuSheetMessage } from '../utils/menuSheetMessage.ts';
import { clearEntryTableToken, getEntryTableToken, setEntryTableToken } from '../services/venueTable.ts';

const token = 'bar-xzx-table-1a2b3c4d';

// A valid table → exactly the documented message.
assert.deepEqual(buildTableContextMessage(token, 'T8'), { type: 'jchat:menu', event: 'context', table: { token, label: 'T8' } });

// No table, or a value that would not pass the menu's own validation → nothing is sent.
for (const [t, l] of [[null, 'T8'], [token, null], [undefined, undefined], ['', 'T8'], [token, ''], ['UPPER-TABLE-12345678', 'T8'], ['https://evil.example/x', 'T8'], [token, '<b>5</b>'], [token, 'line\nbreak'], [token, 'x'.repeat(41)], ['short', 'T8']]) {
  assert.equal(buildTableContextMessage(t, l), null, `${t} / ${l}`);
}

// The sheet only reacts to "ready" / "order_placed", from the menu's own origin.
const ORIGIN = 'https://jchat.cloud';
assert.equal(parseMenuSheetMessage({ origin: ORIGIN, data: { type: 'jchat:menu', event: 'ready' } }, ORIGIN), 'ready');
assert.equal(parseMenuSheetMessage({ origin: ORIGIN, data: { type: 'jchat:menu', event: 'order_placed' } }, ORIGIN), 'order_placed');
assert.equal(parseMenuSheetMessage({ origin: 'https://evil.example', data: { type: 'jchat:menu', event: 'ready' } }, ORIGIN), null);
assert.equal(parseMenuSheetMessage({ origin: ORIGIN, data: { type: 'jchat:menu', event: 'context' } }, ORIGIN), null);

// The token lives in memory, per room; a new entry replaces it; no table clears it.
setEntryTableToken('room-1', token);
assert.equal(getEntryTableToken('room-1'), token);
assert.equal(getEntryTableToken('room-2'), null, 'another room never gets it');
assert.equal(getEntryTableToken(undefined), null);
setEntryTableToken('room-1', null);
assert.equal(getEntryTableToken('room-1'), null, 'an entry without a table clears it');
setEntryTableToken('room-3', token);
clearEntryTableToken();
assert.equal(getEntryTableToken('room-3'), null);

console.log('menu table message OK');
