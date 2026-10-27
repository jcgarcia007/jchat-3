/**
 * JChat 3.0 — what payments/gift_hold answers, as the web needs it (pure: no I/O, runs in Node tests).
 *
 * On devices the PaymentSheet is opened from the same answer (services/stripe.ts holdGiftPayment). The web only needs the
 * PaymentIntent's client secret and the publishable key to confirm the card with Stripe.js; the amount is whatever the
 * SERVER priced (serverTotalCents) and is shown, never sent.
 */

export interface GiftHoldParams {
  clientSecret: string;
  publishableKey: string;
  /** The total the server priced, in cents (for display only). */
  totalCents: number;
  /** Refusals the server has already counted for this offer (payment_failures, migration 242); 0 for a new offer or an older server. */
  paymentFailures: number;
}

export type GiftHoldResult = ({ ok: true } & GiftHoldParams) | { ok: false; code: string; message: string };

/** The successful body of payments/gift_hold, or null when it lacks what Stripe.js needs. */
export function parseGiftHoldData(data: unknown): GiftHoldParams | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  if (typeof d.clientSecret !== 'string' || !d.clientSecret.includes('_secret')) return null;
  if (typeof d.publishableKey !== 'string' || !d.publishableKey.startsWith('pk_')) return null;
  const total = typeof d.serverTotalCents === 'number' && Number.isFinite(d.serverTotalCents) ? d.serverTotalCents : 0;
  const failures = typeof d.paymentFailures === 'number' && Number.isFinite(d.paymentFailures) ? Math.max(0, Math.floor(d.paymentFailures)) : 0;
  return { clientSecret: d.clientSecret, publishableKey: d.publishableKey, totalCents: total, paymentFailures: failures };
}

/**
 * The refusal of payments/gift_hold: `{ error, code? }` (gift_unavailable, gift_not_open, gift_retry_later, …). The code
 * lets the caller show the translated text of that case; `fallback` is the generic translated message.
 */
export function giftHoldFailure(body: unknown, fallback: string): { code: string; message: string } {
  const b = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const code = typeof b.code === 'string' && b.code.length > 0 ? b.code : 'ServerError';
  const message = typeof b.error === 'string' && b.error.length > 0 ? b.error : fallback;
  return { code, message };
}
