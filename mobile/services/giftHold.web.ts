/**
 * JChat 3.0 — gift hold (web): asks payments/gift_hold for the PaymentIntent of a gift offer and returns what Stripe.js needs
 * to confirm the card (client secret + publishable key). It is the SAME server action the app calls: the server checks that the
 * offer is mine and still a draft, that we are both present in the venue, re-prices the offer from the database and creates
 * the PaymentIntent with capture_method 'manual' (the card is only HELD; it is charged if the recipient accepts). Nothing about
 * the amount comes from here.
 *
 * Nothing secret is logged: only the HTTP status and the error code.
 */

import { supabase, isSupabaseConfigured } from './supabase';
import { AppError, toUserMessage } from '../utils/errors';
import { giftHoldFailure, parseGiftHoldData, type GiftHoldResult } from '../utils/giftHold';

export type { GiftHoldResult } from '../utils/giftHold';

/** The JSON body of an Edge Function error response (duck-typed like services/stripe.ts: no `instanceof Response`). */
async function errorBody(error: unknown): Promise<{ status: number | null; body: unknown }> {
  const ctx = (error as { context?: unknown } | null)?.context as
    | { status?: unknown; clone?: unknown; json?: unknown }
    | undefined;
  if (!ctx || typeof ctx !== 'object') return { status: null, body: null };
  const status = typeof ctx.status === 'number' ? ctx.status : null;
  const source = (typeof ctx.clone === 'function' ? (ctx.clone as () => typeof ctx)() : ctx) as { json?: unknown };
  if (typeof source.json !== 'function') return { status, body: null };
  try {
    return { status, body: await (source.json as () => Promise<unknown>)() };
  } catch {
    return { status, body: null };
  }
}

export async function fetchGiftHold(giftOfferId: string): Promise<GiftHoldResult> {
  if (!isSupabaseConfigured) {
    return { ok: false, code: 'NotConfigured', message: toUserMessage(new AppError('NOT_CONFIGURED')) };
  }
  const generic = toUserMessage(new AppError('PAYMENT_FAILED'));
  try {
    const { data, error } = await supabase.functions.invoke('payments', {
      body: { action: 'gift_hold', gift_offer_id: giftOfferId },
    });
    if (error) {
      const { status, body } = await errorBody(error);
      const failure = giftHoldFailure(body, generic);
      console.error('[giftHold] gift_hold failed:', status, failure.code);
      return { ok: false, ...failure };
    }
    const params = parseGiftHoldData(data);
    if (!params) return { ok: false, code: 'ServerError', message: generic };
    return { ok: true, ...params };
  } catch (err) {
    console.error('[giftHold] unexpected error');
    return { ok: false, code: 'UnexpectedError', message: toUserMessage(err, 'errors:app.PAYMENT_FAILED') };
  }
}
