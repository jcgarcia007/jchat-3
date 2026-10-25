/**
 * JChat 3.0 — feature switches of the web build.
 */

/**
 * Gifts from the browser (Stripe.js card form over the PaymentIntent that payments/gift_hold creates).
 * While false, the web never offers the gift option (hooks/useGiftAvailable answers "not available" on the web), so
 * nobody reaches a payment that cannot be completed. Devices are never affected by this switch.
 * Set it to true only after the test-mode run of the card flow has been approved.
 */
export const WEB_GIFTS_ENABLED = false;
