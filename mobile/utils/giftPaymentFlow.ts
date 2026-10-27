/**
 * JChat 3.0 — what the web does with each answer of stripe.confirmPayment for a gift, and when a wallet button shows (pure: no I/O,
 * runs in Node tests). The card's Pay button and the wallet's (Apple Pay / Google Pay, Express Checkout Element) confirm the SAME
 * PaymentIntent through ONE function in GiftPaymentForm.web.tsx; this module is its decision table, so both paths count attempts,
 * close the offer and talk to the person identically.
 *
 * The server closes an offer at the 3rd refusal (migration 242), counting payment_intent.payment_failed — for a card typed into the
 * form and for a refused wallet alike. The client mirrors that count only to say "N attempts left"; a wallet sheet the person
 * simply CLOSES (the element's `cancel` event) never reaches confirmPayment, so it is not an attempt.
 */

import { GIFT_MAX_PAYMENT_ATTEMPTS, type GiftPaymentOutcome } from './giftPaymentResult';

export type GiftPaymentStep =
  /** The card is on hold: the offer is on its way to the recipient. */
  | { kind: 'held' }
  /** The bank is still working: show "processing" and do not let the person pay twice. */
  | { kind: 'processing' }
  /** The server closed the offer (or its PaymentIntent no longer takes a payment). */
  | { kind: 'closed' }
  /**
   * A refusal or an invalid entry. `declines` is the new count (only a refusal by the bank counts), `left` the attempts remaining,
   * `exhausted` true when this refusal was the last one (the offer is now closed), `message` Stripe's own localized text.
   */
  | { kind: 'retry'; declines: number; left: number; exhausted: boolean; counted: boolean; message: string | null }
  /** Anything unexpected: the generic error. `code` is for logs only. */
  | { kind: 'failed'; code: string };

export function nextGiftStep(outcome: GiftPaymentOutcome, declines: number): GiftPaymentStep {
  switch (outcome.kind) {
    case 'held':
      return { kind: 'held' };
    case 'processing':
      return { kind: 'processing' };
    case 'closed':
      return { kind: 'closed' };
    case 'retry': {
      const used = outcome.declined ? declines + 1 : declines;
      const left = Math.max(0, GIFT_MAX_PAYMENT_ATTEMPTS - used);
      return { kind: 'retry', declines: used, left, exhausted: outcome.declined && left <= 0, counted: outcome.declined, message: outcome.message };
    }
    default:
      return { kind: 'failed', code: outcome.code };
  }
}

/** The shape of the Express Checkout Element's `availablepaymentmethodschange` payload that matters here. */
export interface WalletAvailability {
  applePay?: { available: boolean };
  googlePay?: { available: boolean };
  link?: { available: boolean };
  paypal?: { available: boolean };
  amazonPay?: { available: boolean };
  klarna?: { available: boolean };
}

/** True only when Apple Pay or Google Pay can be shown (nothing else is ever enabled in this form). `undefined` = no wallet at all. */
export function walletAvailable(paymentMethods: WalletAvailability | null | undefined): boolean {
  return Boolean(paymentMethods?.applePay?.available || paymentMethods?.googlePay?.available);
}
