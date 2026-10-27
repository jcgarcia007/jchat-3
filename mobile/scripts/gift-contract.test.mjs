// The gift's server ↔ client contract, checked statically (no database, no Stripe, no network). Run from mobile/:
//   node --test scripts/gift-contract.test.mjs
// What the DATABASE does with these functions is tested against a real Postgres in supabase/tests (run by loadtest/run-sql-tests.sh).

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const repo = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

const m202 = repo('supabase/migrations/202_gift_offers.sql');
const worker = repo('supabase/functions/gift-worker/index.ts');
const webhook = repo('supabase/functions/stripe-webhook/index.ts');
const payments = repo('supabase/functions/payments/index.ts');
const card = read('components/gift/GiftCard.tsx');
const es = JSON.parse(read('i18n/locales/es/chat.json'));
const en = JSON.parse(read('i18n/locales/en/chat.json'));

const STATUSES = m202.match(/check \(status in \(([^)]*)\)\)/)[1].split(',').map((s) => s.trim().replace(/'/g, ''));

test('the database knows nine gift statuses', () => {
  assert.deepEqual([...STATUSES].sort(), ['accepted', 'awaiting_payment', 'cancelled', 'declined', 'draft', 'expired', 'failed', 'held', 'paid']);
});

test('every status a PERSON can meet in a chat card has its own text in es and en; the ones that fall into the default are the known gaps', () => {
  const body = card.slice(card.indexOf('const statusText = (() => {'), card.indexOf('const canRespond'));
  const handled = [...body.matchAll(/case '([a-z_]+)':/g)].map((m) => m[1]);
  assert.deepEqual(handled.sort(), ['accepted', 'declined', 'expired', 'held', 'paid']);
  // 'cancelled' is the default branch on purpose; draft / awaiting_payment never reach a chat card (no message exists before 'held');
  // 'failed' DOES (an accepted offer whose capture failed) and also falls into "Cancelado": a documented gap (e2e/local/gift-accept.spec.ts).
  const defaults = STATUSES.filter((s) => !handled.includes(s));
  assert.deepEqual(defaults.sort(), ['awaiting_payment', 'cancelled', 'draft', 'failed']);
  for (const key of ['waitingSender', 'waitingRecipient', 'accepted', 'paid', 'declined', 'expired', 'cancelled', 'senderAccepted', 'senderDeclined', 'senderExpired']) {
    assert.ok(es.giftCard[key], `es.giftCard.${key}`);
    assert.ok(en.giftCard[key], `en.giftCard.${key}`);
  }
});

test('gift-worker: accepted → capture ONLY a held PaymentIntent; declined / expired / cancelled → cancel; the decision comes from the DATABASE status', () => {
  assert.match(worker, /const CANCEL_STATUSES = \["declined", "expired", "cancelled"\];/);
  assert.match(worker, /if \(offer\.status === "accepted"\) \{[\s\S]*?if \(pi\.status !== "requires_capture"\) \{[\s\S]*?action: "none"[\s\S]*?\}[\s\S]*?paymentIntents\.capture\(piId, \{\}, \{ idempotencyKey: `gift-capture:\$\{offerId\}` \}\)/);
  assert.match(worker, /if \(CANCEL_STATUSES\.includes\(offer\.status as string\)\) \{[\s\S]*?paymentIntents\.cancel\(piId, \{ cancellation_reason: "requested_by_customer" \}, \{ idempotencyKey: `gift-cancel:\$\{offerId\}` \}\)/);
  // the offer's own PaymentIntent must be the one named; the secret is compared in constant time; held / paid / failed / draft do nothing
  assert.match(worker, /if \(offer\.stripe_pi_id !== piId\) return json\(\{ error: "pi_mismatch" \}, 409\);/);
  assert.match(worker, /x-push-secret/);
  assert.match(worker, /held \/ paid \/ failed \/ draft…: nothing to do/);
  // nothing about the card or the customer is logged
  assert.doesNotMatch(worker, /console\.(log|error)\([^)]*(card|email|customer|client_secret)/i);
});

test('stripe-webhook: a gift refusal is REGISTERED (3 close the offer), a hold on a closed offer is released, never an accepted one', () => {
  assert.match(webhook, /gift_offer_register_payment_failure/);
  assert.match(webhook, /const GIFT_ORPHAN_STATUSES = \["cancelled", "failed", "expired", "declined"\];/);
  assert.match(webhook, /idempotencyKey: `gift-orphan:\$\{piId\}`/);
  assert.doesNotMatch(webhook.slice(webhook.indexOf('GIFT_ORPHAN_STATUSES')), /GIFT_ORPHAN_STATUSES = \[[^\]]*"(accepted|paid|held)"/);
  // the order is created only after the capture, and only for an accepted offer
  assert.match(webhook, /expected 'accepted'/);
});

test('payments/gift_hold: card only, manual capture, priced by the server, one PaymentIntent per offer', () => {
  assert.match(payments, /payment_method_types: \["card"\],\s*capture_method: "manual" as const/);
  assert.match(payments, /idempotencyKey: `gift:\$\{offerId\}`/);
  assert.match(payments, /if \(!offer \|\| offer\.from_user_id !== authUserId\) return jsonResponse\(\{ error: "gift_not_found", code: "gift_not_found" \}, 404\);/);
  assert.match(payments, /const totalCents = subtotalCents \+ taxCents; \/\/ no tip on gifts/);
  assert.match(payments, /if \(totalCents < 50\)/);
});

test('the SQL state machine (migration 202): hold only from awaiting_payment, answer only while held and before the 15 min, 15-minute window', () => {
  assert.match(m202, /if g\.status <> 'awaiting_payment' then return jsonb_build_object\('ok', true, 'status', g\.status\); end if;/);
  assert.match(m202, /update public\.gift_offers set status = 'held', held_at = now\(\), expires_at = now\(\) \+ interval '15 minutes'/);
  assert.match(m202, /if g\.status <> 'held' then raise exception 'gift_not_open'/);
  assert.match(m202, /if g\.expires_at < now\(\) then update public\.gift_offers set status = 'expired'[^;]*; raise exception 'gift_expired'/);
  assert.match(m202, /status = 'paid', order_id = p_order_id where stripe_pi_id = p_stripe_pi_id and status = 'accepted'/);
  assert.match(m202, /status = 'failed' where stripe_pi_id = p_stripe_pi_id and status in \('awaiting_payment','accepted'\)/);
});

test('every error code the gift SQL raises is known to the client and translated in es and en (nothing raw reaches the person)', () => {
  const svc = read('services/giftOffers.ts');
  const known = [...svc.slice(svc.indexOf('const KNOWN'), svc.indexOf('export function giftErrorCode')).matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  assert.ok(known.length >= 8, 'the client lists its known codes');
  const raised = new Set();
  for (const sql of [m202, repo('supabase/migrations/242_gift_server_rules.sql')]) {
    for (const m of sql.matchAll(/raise exception '([a-z_]+)'/g)) raised.add(m[1]);
  }
  // not_authenticated is the sign-in guard of every function (the app never gets there signed in). `not_found` (an offer id that does not
  // exist, raised by gift_offer_view / gift_offer_cancel) is NOT in the client's list: it reaches the person as the generic gift error.
  // That is the only unmapped code today (low severity: it needs a stale or invented offer id); if one more appears, this test says so.
  const unmapped = [...raised].filter((c) => c !== 'not_authenticated' && !known.includes(c));
  assert.deepEqual(unmapped, ['not_found'], 'the SQL raises codes the client does not map');
  for (const code of known) {
    assert.ok(es.gift.errors[code], `es.gift.errors.${code}`);
    assert.ok(en.gift.errors[code], `en.gift.errors.${code}`);
  }
  assert.ok(es.gift.errors.generic && en.gift.errors.generic, 'and a generic fallback');
});
