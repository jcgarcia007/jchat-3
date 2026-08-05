/**
 * JChat 3.0 — Terminal service (C2a)
 *
 * Client wrappers around the `terminal` Edge Function for Stripe Terminal
 * in-person POS payments. All calls go through the Supabase client so the
 * user's JWT is attached automatically — no Stripe keys live in the app.
 *
 * Edge Function: supabase/functions/terminal/index.ts
 *   connection_token      → getConnectionTokenSecret()  (used by tokenProvider)
 *   create_payment_intent → createPaymentIntent()
 *   mark_paid             → markPaid()
 *
 * Error mapping: HTTP status codes from the Edge Function are translated
 * to typed reasons so callers can show the right message without parsing strings.
 */

import { supabase, isSupabaseConfigured } from './supabase';

// ─── Result types ─────────────────────────────────────────────────────────────

/**
 * Shared error reasons for Terminal Edge Function calls.
 *   no_access        — 403: employee lacks pos_access at this business
 *   already_paid     — 409: the order has already been marked paid
 *   not_found        — 404: order or business not found
 *   no_stripe_account — 422: business has no connected Stripe account
 *   not_configured   — local guard: Supabase not configured
 *   error            — any other server/network error
 */
export type TerminalErrorReason =
  | 'no_access'
  | 'already_paid'
  | 'not_found'
  | 'no_stripe_account'
  | 'not_configured'
  | 'error';

export type CreatePaymentIntentResult =
  | { ok: true; clientSecret: string; paymentIntentId: string }
  | { ok: false; reason: TerminalErrorReason; message?: string };

export type MarkPaidResult =
  | { ok: true }
  /** pi.status !== 'succeeded' — piStatus is the raw Stripe status. */
  | { ok: false; reason: 'not_succeeded'; piStatus?: string }
  | { ok: false; reason: TerminalErrorReason; message?: string };

// ─── Internal error helpers ───────────────────────────────────────────────────

/**
 * Read the server-side { error: string } body from a FunctionsHttpError.
 * Mirrors the duck-typing approach in stripe.ts (instanceof Response is
 * unreliable under RN's fetch polyfill).
 */
async function readEfError(
  err: unknown,
): Promise<{ httpStatus: number | null; message: string }> {
  const fallback = err instanceof Error ? err.message : 'Unknown function error';
  const ctx = (err as { context?: unknown })?.context;
  if (!ctx || typeof ctx !== 'object') return { httpStatus: null, message: fallback };

  const rawStatus = (ctx as { status?: unknown }).status;
  const httpStatus = typeof rawStatus === 'number' ? rawStatus : null;

  // Clone to avoid consuming the body stream when available.
  const source =
    typeof (ctx as { clone?: unknown }).clone === 'function'
      ? ((ctx as { clone: () => unknown }).clone as () => unknown)()
      : ctx;

  if (typeof (source as { json?: unknown }).json === 'function') {
    try {
      const body = await ((source as { json: () => Promise<unknown> }).json)();
      const serverMsg = (body as { error?: unknown })?.error;
      if (typeof serverMsg === 'string' && serverMsg.length > 0) {
        return { httpStatus, message: serverMsg };
      }
    } catch {
      // fall through to text attempt
    }
  }

  if (typeof (source as { text?: unknown }).text === 'function') {
    try {
      const raw = await ((source as { text: () => Promise<string> }).text)();
      if (raw) {
        try {
          const body = JSON.parse(raw);
          const serverMsg = (body as { error?: unknown })?.error;
          if (typeof serverMsg === 'string' && serverMsg.length > 0) {
            return { httpStatus, message: serverMsg };
          }
        } catch {
          if (raw.length < 300) return { httpStatus, message: raw };
        }
      }
    } catch {
      // nothing more to try
    }
  }

  return { httpStatus, message: fallback };
}

/** Map HTTP status + message to a TerminalErrorReason. */
function mapReason(httpStatus: number | null, message: string): TerminalErrorReason {
  if (httpStatus === 403) return 'no_access';
  if (httpStatus === 404) return 'not_found';
  if (httpStatus === 409) return 'already_paid';
  if (httpStatus === 422 && message.toLowerCase().includes('stripe account')) {
    return 'no_stripe_account';
  }
  return 'error';
}

// ─── getConnectionTokenSecret ─────────────────────────────────────────────────

/**
 * Fetch a Stripe Terminal connection token secret for the given business.
 *
 * This function is designed to be used directly as the `tokenProvider` prop of
 * `StripeTerminalProvider`. If anything goes wrong it throws — the SDK catches
 * the error internally and retries or surfaces a reader-connection failure.
 *
 * @param businessId — the business whose connected Stripe account will be used
 * @throws Error on network failure, missing configuration, or a server error
 */
export async function getConnectionTokenSecret(businessId: string): Promise<string> {
  if (!isSupabaseConfigured) {
    throw new Error('[terminal] Supabase is not configured');
  }

  const { data, error } = await supabase.functions.invoke<{ secret: string }>(
    'terminal',
    { body: { action: 'connection_token', business_id: businessId } },
  );

  if (error) {
    const { message } = await readEfError(error);
    throw new Error(`[terminal] connection_token failed: ${message}`);
  }

  if (!data?.secret) {
    throw new Error('[terminal] connection_token: no secret in response');
  }

  return data.secret;
}

// ─── createPaymentIntent ──────────────────────────────────────────────────────

/**
 * Create a Stripe PaymentIntent for an existing POS order.
 *
 * The charge amount is read server-side from `orders.total_cents` — this call
 * never sends a price. The client_secret is needed by the Terminal SDK to
 * collect the payment from the physical card reader.
 *
 * @param orderId — the UUID of the order in the `orders` table
 */
export async function createPaymentIntent(
  orderId: string,
): Promise<CreatePaymentIntentResult> {
  if (!isSupabaseConfigured) return { ok: false, reason: 'not_configured' };

  const { data, error } = await supabase.functions.invoke<{
    client_secret: string;
    payment_intent_id: string;
  }>('terminal', {
    body: { action: 'create_payment_intent', order_id: orderId },
  });

  if (error) {
    const { httpStatus, message } = await readEfError(error);
    return { ok: false, reason: mapReason(httpStatus, message), message };
  }

  if (!data?.client_secret || !data?.payment_intent_id) {
    return { ok: false, reason: 'error', message: 'Incomplete response from server' };
  }

  return {
    ok: true,
    clientSecret: data.client_secret,
    paymentIntentId: data.payment_intent_id,
  };
}

// ─── markPaid ────────────────────────────────────────────────────────────────

/**
 * Ask the Edge Function to confirm the payment at Stripe and, if the
 * PaymentIntent has succeeded, mark the order as paid.
 *
 * The server retrieves the PI directly from Stripe — it never trusts the
 * client's claim that the charge went through. If the PI is not yet
 * `succeeded`, this returns `{ ok: false, reason: 'not_succeeded' }` and
 * the caller should retry or surface the `piStatus` to the user.
 *
 * @param orderId — the UUID of the order in the `orders` table
 */
export async function markPaid(orderId: string): Promise<MarkPaidResult> {
  if (!isSupabaseConfigured) return { ok: false, reason: 'not_configured' };

  const { data, error } = await supabase.functions.invoke<{
    ok: boolean;
    status?: string;
  }>('terminal', {
    body: { action: 'mark_paid', order_id: orderId },
  });

  if (error) {
    const { httpStatus, message } = await readEfError(error);
    return { ok: false, reason: mapReason(httpStatus, message), message };
  }

  if (data?.ok === true) return { ok: true };

  // EF returned 200 with ok: false — PI is not succeeded yet.
  return { ok: false, reason: 'not_succeeded', piStatus: data?.status };
}
