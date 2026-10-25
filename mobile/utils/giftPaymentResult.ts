/**
 * JChat 3.0 — what the web does with the answer of stripe.confirmPayment for a gift (pure: no I/O, runs in Node tests).
 *
 * A gift's PaymentIntent has capture_method 'manual' (payments/gift_hold): confirming it does NOT charge the card, it puts
 * the PaymentIntent in `requires_capture` = "the card is on hold". That is the success of this step; the charge happens only
 * if the recipient accepts (gift-worker). The webhook then marks the offer as held and the gift card appears in the chat.
 */

/** The part of stripe.confirmPayment's result this module reads (so tests need no Stripe.js). */
export interface ConfirmResultLike {
  error?: { type?: string; code?: string; message?: string } | null;
  paymentIntent?: { status?: string } | null;
}

export type GiftPaymentOutcome =
  /** The card is on hold (requires_capture; `succeeded` is accepted too). */
  | { kind: 'held' }
  /** Stripe is still working on it: show "processing", do not let the person pay twice. */
  | { kind: 'processing' }
  /**
   * The person can try again (refused card, incomplete or invalid data). `message` is Stripe's own, localized text.
   * `declined` = the bank / Stripe refused the card (Stripe fires payment_failed, which the server counts: 3 close the offer);
   * incomplete or invalid data never reaches the bank and is not counted.
   */
  | { kind: 'retry'; message: string | null; declined: boolean }
  /** The offer was closed on the server (3 refusals, 15 minutes, cancelled): its PaymentIntent no longer takes a card. */
  | { kind: 'closed' }
  /** Anything else: show the generic error. `code` is for logs only. */
  | { kind: 'failed'; code: string };

/** Server-side limit (migration 242, gift_offer_register_payment_failure): the 3rd refusal cancels the offer. */
export const GIFT_MAX_PAYMENT_ATTEMPTS = 3;

export function giftPaymentOutcome(result: ConfirmResultLike): GiftPaymentOutcome {
  const error = result.error;
  if (error) {
    if (error.code === 'payment_intent_unexpected_state') return { kind: 'closed' };
    if (error.type === 'card_error' || error.type === 'validation_error') {
      return {
        kind: 'retry',
        message: typeof error.message === 'string' && error.message.length > 0 ? error.message : null,
        declined: error.type === 'card_error',
      };
    }
    return { kind: 'failed', code: error.code ?? error.type ?? 'unknown' };
  }
  switch (result.paymentIntent?.status) {
    case 'requires_capture':
    case 'succeeded':
      return { kind: 'held' };
    case 'processing':
      return { kind: 'processing' };
    case 'requires_payment_method':
      return { kind: 'retry', message: null, declined: true };
    case undefined:
      return { kind: 'failed', code: 'no_payment_intent' };
    default:
      return { kind: 'failed', code: result.paymentIntent?.status ?? 'unknown' };
  }
}

/** Stripe.js locale for the app's language (the form's labels and Stripe's error messages). */
export function stripeLocale(language: string | null | undefined): 'es' | 'en' {
  return (language ?? '').toLowerCase().startsWith('es') ? 'es' : 'en';
}
