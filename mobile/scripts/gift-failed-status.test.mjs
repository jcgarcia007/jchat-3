// JChat 3.0 — a gift whose payment failed (status 'failed') has its own text in the chat card, in es and en; it is not "Cancelado".
// Run: node --test scripts/gift-failed-status.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const card = readFileSync(new URL('../components/gift/GiftCard.tsx', import.meta.url), 'utf8');
const locale = (l) => JSON.parse(readFileSync(new URL(`../i18n/locales/${l}/chat.json`, import.meta.url), 'utf8')).giftCard;

test('GiftCard.statusText has a case for "failed" before the default (cancelled)', () => {
  const sw = card.slice(card.indexOf('const statusText'), card.indexOf('const canRespond'));
  const iFailed = sw.indexOf("case 'failed'");
  assert.ok(iFailed > 0, "no case 'failed'");
  assert.ok(iFailed < sw.indexOf('default:'), 'failed must come before the default branch');
  assert.match(sw, /case 'failed':[\s\S]*giftCard\.senderFailed[\s\S]*giftCard\.failed/);
});

test('es and en both have failed and senderFailed, different from the cancelled text', () => {
  for (const l of ['es', 'en']) {
    const g = locale(l);
    assert.ok(g.failed && g.senderFailed, `${l}: missing failed / senderFailed`);
    assert.notEqual(g.failed, g.cancelled, `${l}: failed must not read as cancelled`);
    assert.match(g.senderFailed, /\{\{name\}\}/, `${l}: senderFailed names the recipient`);
  }
  assert.equal(locale('es').failed, 'No se pudo cobrar');
  assert.equal(locale('en').failed, 'Payment failed');
});
