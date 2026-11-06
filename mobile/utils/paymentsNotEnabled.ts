/**
 * Does this quote / payment error mean "the venue cannot charge in the app" (no Stripe Connect account yet)? The server answers 409 with
 * code 'payments_not_enabled'; before that code existed it answered the bare message below, so both forms are accepted. The checkout then shows a
 * plain notice (order at the counter), keeps Pay disabled and offers no Retry: retrying cannot fix it.
 */
export const PAYMENTS_NOT_ENABLED_CODE = 'payments_not_enabled';
const LEGACY_MESSAGE = /not set up to accept payments/i;

export function isPaymentsNotEnabled(error: unknown): boolean {
  const e = error as { code?: unknown; message?: unknown } | null;
  if (typeof e?.code === 'string' && e.code.toLowerCase() === PAYMENTS_NOT_ENABLED_CODE) return true;
  return typeof e?.message === 'string' && LEGACY_MESSAGE.test(e.message);
}
