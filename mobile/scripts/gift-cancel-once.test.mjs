// JChat 3.0 — closing the gift sheet with an unpaid offer sends gift_offer_cancel ONCE.
// handleClose → cancelUnpaidOffer cancels the offer, and the web unmount cleanup cancels `offerIdRef.current` too. The ref used to be
// refreshed only on the next render, so the cleanup still saw the id and sent a second cancel. cancelUnpaidOffer must clear the ref itself.
// Run: node --test scripts/gift-cancel-once.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../components/gift/GiftSheet.tsx', import.meta.url), 'utf8');
const fn = src.slice(src.indexOf('const cancelUnpaidOffer'), src.indexOf('const handleClose'));
const cleanup = src.slice(src.indexOf('useEffect(\n    () => () => {'), src.indexOf('// Every opening starts clean'));

test('cancelUnpaidOffer sends the cancel and clears offerIdRef in the same call (after sending, before the state update)', () => {
  const iCancel = fn.indexOf('cancelGiftOffer(id)');
  const iRef = fn.indexOf('offerIdRef.current = null');
  const iState = fn.indexOf('setOfferId(null)');
  assert.ok(iCancel >= 0 && iRef > iCancel && iState > iRef, 'expected cancelGiftOffer(id); offerIdRef.current = null; setOfferId(null)');
});

test('the unmount cleanup still cancels an open, unpaid offer from the ref (leaving the page without the close button)', () => {
  assert.match(cleanup, /offerIdRef\.current/);
  assert.match(cleanup, /!heldRef\.current && !payBusyRef\.current\) void cancelGiftOffer\(open\)/);
});

test('simulation: close then unmount sends one cancel; unmount alone still sends one', () => {
  const run = (closeFirst) => {
    let ref = 'offer-1'; let sent = 0;
    const cancelUnpaid = (id) => { if (!id) return; sent++; ref = null; };   // the fixed cancelUnpaidOffer
    const cleanupFn = () => { if (ref) sent++; };
    if (closeFirst) cancelUnpaid(ref);
    cleanupFn();
    return sent;
  };
  assert.equal(run(true), 1);
  assert.equal(run(false), 1);
});
