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
 *   no_access         — 403: employee lacks pos_access at this business
 *   already_paid      — 409: the order has already been marked paid
 *   empty_tab         — 409: tab total is zero (nothing to charge)
 *   not_found         — 404: order, payment record, or business not found
 *   no_stripe_account — 422: business has no connected Stripe account
 *   not_configured    — local guard: Supabase not configured
 *   error             — any other server/network error
 */
export type TerminalErrorReason =
  | 'no_access'
  | 'already_paid'
  | 'empty_tab'
  | 'not_pending'
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

/**
 * Result of createTabPaymentIntent.
 *   baseCents  — tab total without tip (= pos_payments.amount_cents)
 *   tipCents   — tip selected by the waiter (may be 0)
 *   totalCents — PI amount = baseCents + tipCents (what the card is charged)
 *   amountCents — alias of totalCents (backwards-compat for screens that already use it)
 *   paymentId  — null if the pos_payments INSERT failed after PI creation;
 *                the PI is still valid — operator must reconcile via Stripe.
 */
export type CreateTabPaymentIntentResult =
  | {
      ok: true;
      clientSecret: string;
      paymentIntentId: string;
      paymentId: string | null;
      baseCents: number;
      tipCents: number;
      totalCents: number;
      /** @deprecated use totalCents — kept for backwards compat */
      amountCents: number;
    }
  | { ok: false; reason: TerminalErrorReason; message?: string };

export type MarkTabPaidResult =
  | { ok: true; tabClosed: boolean }
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

// ─── getOrCreateTerminalLocation ─────────────────────────────────────────────

/**
 * Fetch (or create) a Stripe Terminal Location on the business's connected
 * Stripe account. The locationId is required by ConnectBluetoothReaderParams
 * and must always come from the server — never generated client-side.
 *
 * The EF lists existing locations first (limit=1) to avoid duplicates.
 * If none exist it creates one with the business name and a placeholder address
 * (editable via the Stripe dashboard for production use).
 *
 * @param businessId — the business whose connected Stripe account will be used
 */
export type GetOrCreateLocationResult =
  | { ok: true; locationId: string }
  | { ok: false; reason: TerminalErrorReason; message?: string };

export async function getOrCreateTerminalLocation(
  businessId: string,
): Promise<GetOrCreateLocationResult> {
  if (!isSupabaseConfigured) return { ok: false, reason: 'not_configured' };

  const { data, error } = await supabase.functions.invoke<{
    location_id: string;
  }>('terminal', {
    body: { action: 'get_or_create_location', business_id: businessId },
  });

  if (error) {
    const { httpStatus, message } = await readEfError(error);
    return { ok: false, reason: mapReason(httpStatus, message), message };
  }

  if (!data?.location_id) {
    return { ok: false, reason: 'error', message: 'No location_id in response' };
  }

  return { ok: true, locationId: data.location_id };
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

// ─── chargeSplitCheck ─────────────────────────────────────────────────────────

/**
 * Result of chargeSplitCheck.
 * Same shape as CreateTabPaymentIntentResult but paymentId is never null
 * (the row already exists) and 409 maps to 'not_pending' (the payment row is
 * not in the expected 'pending' status — already charged or cancelled).
 */
export type ChargeSplitCheckResult =
  | { ok: true; clientSecret: string; paymentIntentId: string; paymentId: string; amountCents: number }
  | { ok: false; reason: TerminalErrorReason; message?: string };

/**
 * Create a Stripe PaymentIntent for a single split-check row (pos_payments).
 *
 * The amount is read server-side from pos_payments.amount_cents — this call
 * never sends a price. Returns { ok: false, reason: 'not_pending' } when the
 * payment row is no longer in 'pending' status (e.g. already collected).
 *
 * @param paymentId — the UUID of the pos_payments row created by posCreateSplit
 */
export async function chargeSplitCheck(paymentId: string): Promise<ChargeSplitCheckResult> {
  if (!isSupabaseConfigured) return { ok: false, reason: 'not_configured' };

  const { data, error } = await supabase.functions.invoke<{
    client_secret: string;
    payment_intent_id: string;
    payment_id: string;
    amount_cents: number;
  }>('terminal', {
    body: { action: 'charge_split_check', payment_id: paymentId },
  });

  if (error) {
    const { httpStatus, message } = await readEfError(error);
    // 409 from this action means the payment row is not in 'pending' status
    // (already charged or cancelled) — distinct from 'already_paid'.
    if (httpStatus === 409) return { ok: false, reason: 'not_pending', message };
    return { ok: false, reason: mapReason(httpStatus, message), message };
  }

  if (!data?.client_secret || !data?.payment_intent_id || data?.amount_cents == null) {
    return { ok: false, reason: 'error', message: 'Incomplete response from server' };
  }

  return {
    ok: true,
    clientSecret: data.client_secret,
    paymentIntentId: data.payment_intent_id,
    paymentId: data.payment_id,
    amountCents: data.amount_cents,
  };
}

// ─── createTabPaymentIntent ───────────────────────────────────────────────────

/**
 * Create a Stripe PaymentIntent for the full tab of a table (all unpaid orders).
 *
 * The base amount is read server-side via pos_tab_total — this call never
 * sends a price. An optional tipCents (integer ≥ 0) is forwarded to the EF;
 * the PI total = base + tip. pos_payments.amount_cents stores the base only
 * so markTabPaid can derive tip = pi.amount − base correctly.
 *
 * Returns `{ ok: false, reason: 'empty_tab' }` when the tab total is zero.
 * paymentId may be null in the rare case where the pos_payments INSERT failed
 * after a successful PI creation; the PI is still valid for collection.
 *
 * @param businessId — the business whose connected Stripe account will be used
 * @param tableId    — the UUID of the table in the `tables` table
 * @param tipCents   — waiter-selected tip in cents (default 0 = no tip)
 */
export async function createTabPaymentIntent(
  businessId: string,
  tableId: string,
  tipCents = 0,
): Promise<CreateTabPaymentIntentResult> {
  if (!isSupabaseConfigured) return { ok: false, reason: 'not_configured' };

  const { data, error } = await supabase.functions.invoke<{
    client_secret: string;
    payment_intent_id: string;
    payment_id: string | null;
    base_cents: number;
    tip_cents: number;
    total_cents: number;
    amount_cents: number;  // compat alias = total_cents
  }>('terminal', {
    body: {
      action: 'create_tab_payment_intent',
      business_id: businessId,
      table_id: tableId,
      tip_cents: tipCents,
    },
  });

  if (error) {
    const { httpStatus, message } = await readEfError(error);
    // 409 from this action means "nothing to charge" (tab total is zero),
    // not "already paid" — override mapReason's default for 409.
    if (httpStatus === 409) return { ok: false, reason: 'empty_tab', message };
    return { ok: false, reason: mapReason(httpStatus, message), message };
  }

  if (!data?.client_secret || !data?.payment_intent_id || data?.total_cents == null) {
    return { ok: false, reason: 'error', message: 'Incomplete response from server' };
  }

  const baseCents  = data.base_cents  ?? data.amount_cents ?? 0;
  const tipCentsR  = data.tip_cents   ?? 0;
  const totalCents = data.total_cents ?? data.amount_cents ?? 0;

  return {
    ok: true,
    clientSecret: data.client_secret,
    paymentIntentId: data.payment_intent_id,
    paymentId: data.payment_id ?? null,
    baseCents,
    tipCents: tipCentsR,
    totalCents,
    amountCents: totalCents,
  };
}

// ─── markTabPaid ──────────────────────────────────────────────────────────────

/**
 * Confirm that a tab PaymentIntent has succeeded and mark all unpaid orders
 * for the table as paid.
 *
 * The server retrieves the PI directly from Stripe — it never trusts the
 * client's claim that the charge succeeded. Returns `{ ok: true, tabClosed }`
 * where tabClosed is true when the server confirmed all orders are paid.
 *
 * @param paymentId — the UUID of the pos_payments record (from createTabPaymentIntent)
 */
export async function markTabPaid(paymentId: string): Promise<MarkTabPaidResult> {
  if (!isSupabaseConfigured) return { ok: false, reason: 'not_configured' };

  const { data, error } = await supabase.functions.invoke<{
    ok: boolean;
    tab_closed?: boolean;
    status?: string;
  }>('terminal', {
    body: { action: 'mark_tab_paid', payment_id: paymentId },
  });

  if (error) {
    const { httpStatus, message } = await readEfError(error);
    return { ok: false, reason: mapReason(httpStatus, message), message };
  }

  if (data?.ok === true) {
    return { ok: true, tabClosed: data.tab_closed ?? false };
  }

  // EF returned 200 with ok: false — PI is not succeeded yet.
  return { ok: false, reason: 'not_succeeded', piStatus: data?.status };
}
