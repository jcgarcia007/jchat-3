/**
 * JChat 3.0 — gift hold for the web (iOS / Android): never used. Devices hold the card with the native PaymentSheet
 * (services/stripe.ts holdGiftPayment). The web variant (giftHold.web.ts) asks the server for the PaymentIntent's client
 * secret so Stripe.js can confirm it.
 */

import type { GiftHoldResult } from '../utils/giftHold';

export type { GiftHoldResult } from '../utils/giftHold';

export async function fetchGiftHold(_giftOfferId: string): Promise<GiftHoldResult> {
  return { ok: false, code: 'NotSupported', message: 'gift_hold_web_only' };
}
