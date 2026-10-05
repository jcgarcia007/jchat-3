/**
 * JChat 3.0 — Stripe client wrapper (Task 3.6)
 *
 * RULE 4 COMPLIANCE: This file NEVER creates a PaymentIntent or SetupIntent.
 * All Stripe API calls happen server-side in the `payments` Edge Function.
 * This module only calls that function and presents the PaymentSheet that
 * stripe-react-native provides using the client_secret it receives.
 *
 * Usage:
 *   const result = await initAndPresentPaymentSheet({ order: myCart, userId });
 *   if (result.ok) { // payment confirmed — server already created the order }
 *   else { showFailureSheet(result.message); }
 *
 * TODO(paypal): PayPal is a Stripe payment method. To enable, pass
 *   `paymentMethodTypes: ['card', 'paypal']` in the create_payment_intent
 *   action body and ensure the Stripe PayPal integration is active on the account.
 *
 * TODO(payouts): Payout schedule updates (daily / weekly / monthly) are done
 *   server-side by calling the `stripe-connect` Edge Function with
 *   action: 'update_payout_schedule'. Wire this from the dashboard payout
 *   settings screen when that UI is built.
 */

import {
  initPaymentSheet,
  presentPaymentSheet,
  initStripe,
} from '@stripe/stripe-react-native';
import { supabase, isSupabaseConfigured } from './supabase';
import { readVenueCoords } from './venueAccess';
import { AppError, toUserMessage } from '../utils/errors';
import { palette } from '../theme/tokens';

// ── Types ─────────────────────────────────────────────────────────────────────

/** Money breakdown the server returns (quote_order, and TOTAL_CHANGED answers). */
export interface QuoteBreakdown {
  subtotalCents: number;
  taxCents: number;
  taxRate: number;
  taxSource: TaxSource;
  tipCents: number;
  totalCents: number;
}

/** saveCard has no payment intent: a plain ok / error. */
export type SaveCardResult = { ok: true } | { ok: false; code: string; message: string };

export type StripeResult =
  | { ok: true; paymentIntentId: string }
  | { ok: false; code: string; message: string; breakdown?: QuoteBreakdown };

/** Where the tax rate came from: the business, the US state table, or nowhere (0 %). */
export type TaxSource = 'business' | 'state' | 'none';

export interface OrderItemInput {
  menuItemId: string;
  qty: number;
  options?: Record<string, unknown>;
  specialInstructions?: string | null;
}

/** What the server needs to price an order. Prices, names, tax and totals are NEVER sent. */
export interface OrderRequest {
  /** Supabase business UUID */
  businessId: string;
  roomId?: string | null;
  orderType: 'table' | 'counter' | 'gift';
  giftRecipientId?: string | null;
  tableLabel?: string | null;
  specialInstructions?: string | null;
  tipCents: number;
  items: OrderItemInput[];
}

export interface OrderPayload extends OrderRequest {
  /** Signed-in user UUID (trace only: the server trusts the JWT). */
  userId: string;
  /** One key per QUOTE (`q_<quote_hash>`); the server namespaces it with the JWT user. */
  idempotencyKey?: string;
  /** The total the customer saw; the server answers TOTAL_CHANGED instead of charging a different one. */
  expectedTotalCents?: number;
}

export interface QuoteLine {
  menu_item_id: string;
  name: string;
  qty: number;
  unit_cents: number;
  line_cents: number;
  options: Record<string, unknown>;
}

/** The server's answer to quote_order — shown to the user exactly as returned. */
export interface OrderQuote {
  lines: QuoteLine[];
  subtotal_cents: number;
  tax_cents: number;
  tax_rate: number;
  tax_source: TaxSource;
  tip_cents: number;
  total_cents: number;
  quote_hash: string;
}

/** Shape returned by the `payments` Edge Function for create_payment_intent */
interface PaymentSheetParams {
  clientSecret: string;
  ephemeralKey: string;
  customer: string;
  publishableKey: string;
}

/** Shape returned by the `payments` Edge Function for create_setup_intent */
interface SetupSheetParams {
  clientSecret: string;
  ephemeralKey: string;
  customer: string;
  publishableKey: string;
}

// ── error helpers ─────────────────────────────────────────────────────────────

/**
 * Extrae el mensaje real de un error de supabase.functions.invoke.
 * FunctionsHttpError trae la respuesta HTTP en .context con body { error: string }.
 *
 * OJO (aprendido en device): NO usar `ctx instanceof Response`. En React Native el
 * fetch está polyfilleado y la Response de supabase-js NO es instancia de la Response
 * global → el instanceof da false y el mensaje del servidor se pierde. Duck-typing.
 */
async function readFunctionError(
  error: unknown,
): Promise<{ status: number | null; message: string; code?: string; breakdown?: QuoteBreakdown }> {
  const fallback =
    error instanceof Error ? error.message : 'Unknown function error';

  type FnCtx = { status?: unknown; json?: unknown; clone?: unknown; text?: unknown };
  const ctx = (error as { context?: unknown })?.context as FnCtx | undefined;

  if (!ctx || typeof ctx !== 'object') {
    return { status: null, message: fallback };
  }

  const status = typeof ctx.status === 'number' ? ctx.status : null;

  // Leer el body sin consumir el original cuando se pueda clonar.
  const source: FnCtx =
    typeof ctx.clone === 'function'
      ? (ctx.clone as () => FnCtx)()
      : ctx;

  // 1) Intento directo: .json()
  if (typeof source.json === 'function') {
    try {
      const body = await (source.json as () => Promise<unknown>)();
      const serverMsg = (body as { error?: unknown })?.error;
      if (typeof serverMsg === 'string' && serverMsg.length > 0) {
        const code = (body as { code?: unknown })?.code;
        return {
          status,
          message: serverMsg,
          code: typeof code === 'string' ? code : undefined,
          breakdown: (body as { breakdown?: QuoteBreakdown })?.breakdown,
        };
      }
    } catch {
      // sigue al intento por texto
    }
  }

  // 2) Fallback: .text() y parseo manual (por si el body ya se consumió o no es JSON)
  if (typeof source.text === 'function') {
    try {
      const raw = await (source.text as () => Promise<string>)();
      if (raw) {
        try {
          const body = JSON.parse(raw);
          const serverMsg = (body as { error?: unknown })?.error;
          if (typeof serverMsg === 'string' && serverMsg.length > 0) {
            const code = (body as { code?: unknown })?.code;
            return {
              status,
              message: serverMsg,
              code: typeof code === 'string' ? code : undefined,
              breakdown: (body as { breakdown?: QuoteBreakdown })?.breakdown,
            };
          }
        } catch {
          // el body no era JSON; devolvemos el texto crudo si es corto y útil
          if (raw.length < 300) return { status, message: raw };
        }
      }
    } catch {
      // nada más que intentar
    }
  }

  return { status, message: fallback };
}

class PaymentsFunctionError extends Error {
  constructor(
    message: string,
    public status: number | null,
    public code?: string,
    public breakdown?: QuoteBreakdown,
  ) {
    super(message);
    this.name = 'PaymentsFunctionError';
  }
}

// ── order body / quote ────────────────────────────────────────────────────────

/**
 * camelCase → snake_case body for the Edge Function. No prices, names or totals go out.
 * Golden rule: the device coordinates travel with the order so the SERVER decides whether the person
 * is inside the venue (without permission they are simply omitted → the server treats it as outside).
 */
async function toOrderBody(order: OrderRequest, userId?: string) {
  const coords = await readVenueCoords();
  return {
    ...(coords ? { lat: coords.lat, lng: coords.lng } : {}),
    business_id: order.businessId,
    ...(userId ? { user_id: userId } : {}),
    room_id: order.roomId ?? null,
    order_type: order.orderType,
    table_label: order.tableLabel ?? null,
    gift_recipient_id: order.giftRecipientId ?? null,
    special_instructions: order.specialInstructions ?? null,
    tip_cents: order.tipCents,
    items: order.items.map((it) => ({
      menu_item_id: it.menuItemId,
      qty: it.qty,
      options: it.options,
      special_instructions: it.specialInstructions ?? null,
    })),
  };
}

/** Thrown by quoteOrder; `code` is the server's error code (e.g. 'MODIFIERS_INVALID'). */
export class QuoteError extends Error {
  constructor(message: string, public status: number | null, public code?: string) {
    super(message);
    this.name = 'QuoteError';
  }
}

/**
 * Ask the server to price an order (payments / quote_order). Creates nothing. The checkout
 * screen displays EXACTLY what comes back and uses quote_hash as the payment idempotency key.
 */
export async function quoteOrder(order: OrderRequest): Promise<OrderQuote> {
  if (!isSupabaseConfigured) throw new QuoteError('Supabase is not configured.', null);
  const { data, error } = await supabase.functions.invoke<OrderQuote>('payments', {
    body: { action: 'quote_order', order: await toOrderBody(order) },
  });
  if (error) {
    const { status, message, code } = await readFunctionError(error);
    throw new QuoteError(message, status, code);
  }
  if (!data?.quote_hash) throw new QuoteError('The server returned no quote.', null, 'NO_QUOTE');
  return data;
}

// ── fetchPaymentSheetParams ───────────────────────────────────────────────────

/**
 * Call the `payments` Edge Function to create a server-side PaymentIntent.
 * Returns the params needed to initialise the Stripe PaymentSheet.
 *
 * @throws Error if the function call fails or returns an error.
 */
export async function fetchPaymentSheetParams(
  order: OrderPayload,
): Promise<PaymentSheetParams> {
  if (!isSupabaseConfigured) {
    throw new AppError('NOT_CONFIGURED');
  }

  const { data, error } = await supabase.functions.invoke<PaymentSheetParams>('payments', {
    body: {
      action: 'create_payment_intent',
      idempotency_key: order.idempotencyKey ?? null,
      expected_total_cents: order.expectedTotalCents ?? null,
      order: await toOrderBody(order, order.userId),
    },
  });

  if (error) {
    const { status, message, code, breakdown } = await readFunctionError(error);
    console.error('[stripe] create_payment_intent failed:', status, code, message);
    throw new PaymentsFunctionError(message, status, code, breakdown);
  }

  if (!data?.clientSecret) {
    throw new AppError('PAYMENT_FAILED');
  }

  return data;
}

// ── initAndPresentPaymentSheet ────────────────────────────────────────────────

/**
 * Full payment flow:
 * 1. Fetch PaymentIntent params from the server (never client-side).
 * 2. Initialize the Stripe PaymentSheet with Apple Pay + Google Pay + saved cards.
 * 3. Present the sheet to the user.
 * 4. Return a typed StripeResult.
 *
 * On success the server-side webhook (`stripe-webhook` function) will fire
 * `payment_intent.succeeded` and create the order row — the checkout screen
 * should navigate to the order tracking screen once the webhook confirms.
 *
 * On failure returns { ok: false, code, message } so the checkout screen can
 * present a failure bottom sheet without crashing.
 */
/** Initializes and presents the PaymentSheet for already-fetched params (shared by orders and gifts). */
async function presentSheetForParams(params: PaymentSheetParams): Promise<StripeResult> {
  // The PaymentIntent id is the part of the client secret before "_secret".
  const paymentIntentId = params.clientSecret.split('_secret')[0];

  // Initialize Stripe with the publishable key from the server response
  // (allows the key to come from env without baking it into the bundle at build time)
  await initStripe({
    publishableKey: params.publishableKey,
    merchantIdentifier: 'merchant.com.jchat.app',
    // TODO(paypal): add urlScheme if PayPal redirect flow is enabled
  });

  const { error: initError } = await initPaymentSheet({
    merchantDisplayName: 'JChat',
    customerId: params.customer,
    customerEphemeralKeySecret: params.ephemeralKey,
    paymentIntentClientSecret: params.clientSecret,
    // Allow saving the card for future purchases
    setupIntentClientSecret: undefined, // Not needed when using PI; ephemeral key handles saved methods
    allowsDelayedPaymentMethods: false,
    // Apple Pay
    applePay: {
      merchantCountryCode: 'US',
    },
    // Google Pay
    googlePay: {
      merchantCountryCode: 'US',
      testEnv: __DEV__,
    },
    // Appearance — uses the JChat brand color token
    appearance: {
      colors: {
        primary: palette.brand,
      },
    },
    returnURL: 'jchat://stripe-return',
  });

  if (initError) {
    console.error('[stripe] initPaymentSheet error:', initError);
    return {
      ok: false,
      code: initError.code,
      message: toUserMessage(initError, 'errors:app.PAYMENT_FAILED'),
    };
  }

  const { error: presentError } = await presentPaymentSheet();

  if (presentError) {
    if (presentError.code === 'Canceled') {
      // User dismissed the sheet — not an error, just a cancel
      return { ok: false, code: 'Canceled', message: toUserMessage(new AppError('PAYMENT_CANCELLED')) };
    }
    console.error('[stripe] presentPaymentSheet error:', presentError);
    return {
      ok: false,
      code: presentError.code,
      message: toUserMessage(presentError, 'errors:app.PAYMENT_FAILED'),
    };
  }

  // Sheet was confirmed — payment succeeded. The server webhook will create the order.
  return { ok: true, paymentIntentId };
}

export async function initAndPresentPaymentSheet(
  order: OrderPayload,
): Promise<StripeResult> {
  try {
    const params = await fetchPaymentSheetParams(order);
    return await presentSheetForParams(params);
  } catch (err) {
    if (err instanceof PaymentsFunctionError) {
      // 409 TOTAL_CHANGED = the price moved since the quote: nothing was charged, re-quote.
      if (err.code === 'TOTAL_CHANGED') {
        return { ok: false, code: 'TotalChanged', message: toUserMessage(err), breakdown: err.breakdown };
      }
      if (err.code === 'MODIFIERS_INVALID') {
        return { ok: false, code: 'ModifiersInvalid', message: toUserMessage(err) };
      }
      // 409 = el negocio no puede cobrar aún (gates de Connect); 4xx = validación.
      return {
        ok: false,
        code: err.status === 409 ? 'BusinessNotReady' : 'ServerError',
        message: toUserMessage(new AppError(err.status === 409 ? 'BUSINESS_NOT_READY' : 'PAYMENT_FAILED')),
      };
    }
    const message = toUserMessage(err, 'errors:app.PAYMENT_FAILED');
    console.error('[stripe] unexpected error:', err);
    return { ok: false, code: 'UnexpectedError', message };
  }
}

// ── saveCard ──────────────────────────────────────────────────────────────────

/**
 * SetupIntent flow: present the PaymentSheet configured for card saving only
 * (no immediate charge). User can use the saved card for future purchases.
 *
 * The Edge Function creates the SetupIntent server-side; this module presents it.
 */
export async function saveCard(userId: string): Promise<SaveCardResult> {
  if (!isSupabaseConfigured) {
    return {
      ok: false,
      code: 'NotConfigured',
      message: toUserMessage(new AppError('NOT_CONFIGURED')),
    };
  }

  try {
    const { data, error } = await supabase.functions.invoke<SetupSheetParams>('payments', {
      body: { action: 'create_setup_intent', user_id: userId },
    });

    if (error) {
      const { status, message } = await readFunctionError(error);
      console.error('[stripe] create_setup_intent failed:', status, message);
      return { ok: false, code: 'FunctionError', message: toUserMessage(new AppError('CARD_SAVE_FAILED')) };
    }

    if (!data?.clientSecret) {
      return {
        ok: false,
        code: 'NoClientSecret',
        message: toUserMessage(new AppError('CARD_SAVE_FAILED')),
      };
    }

    await initStripe({
      publishableKey: data.publishableKey,
      merchantIdentifier: 'merchant.com.jchat.app',
    });

    const { error: initError } = await initPaymentSheet({
      merchantDisplayName: 'JChat',
      customerId: data.customer,
      customerEphemeralKeySecret: data.ephemeralKey,
      setupIntentClientSecret: data.clientSecret,
      allowsDelayedPaymentMethods: false,
      appearance: {
        colors: {
          primary: palette.brand,
        },
      },
      returnURL: 'jchat://stripe-return',
    });

    if (initError) {
      return {
        ok: false,
        code: initError.code,
        message: toUserMessage(initError, 'errors:app.PAYMENT_FAILED'),
      };
    }

    const { error: presentError } = await presentPaymentSheet();

    if (presentError) {
      if (presentError.code === 'Canceled') {
        return { ok: false, code: 'Canceled', message: toUserMessage(new AppError('CARD_SAVE_CANCELLED')) };
      }
      return {
        ok: false,
        code: presentError.code,
        message: toUserMessage(presentError, 'errors:app.PAYMENT_FAILED'),
      };
    }

    return { ok: true };
  } catch (err) {
    const message = toUserMessage(err, 'errors:app.CARD_SAVE_FAILED');
    console.error('[stripe] saveCard error:', err);
    return { ok: false, code: 'UnexpectedError', message };
  }
}


// ── Gift hold ─────────────────────────────────────────────────────────────────

/**
 * Gift: asks the server to HOLD (not charge) the sender's card for an offer and presents the
 * PaymentSheet. The server re-prices the offer itself (payments / gift_hold): nothing about the
 * amount comes from here. On `ok` the card is on hold (the offer then becomes 'held' via the webhook
 * and the card appears in the chat); the charge only happens if the recipient accepts.
 */
export async function holdGiftPayment(giftOfferId: string): Promise<StripeResult> {
  if (!isSupabaseConfigured) {
    return { ok: false, code: 'NotConfigured', message: toUserMessage(new AppError('NOT_CONFIGURED')) };
  }
  try {
    const { data, error } = await supabase.functions.invoke<PaymentSheetParams>('payments', {
      body: { action: 'gift_hold', gift_offer_id: giftOfferId },
    });
    if (error) {
      const { status, message, code } = await readFunctionError(error);
      console.error('[stripe] gift_hold failed:', status, code, message);
      return { ok: false, code: code ?? 'ServerError', message };
    }
    if (!data?.clientSecret) return { ok: false, code: 'ServerError', message: toUserMessage(new AppError('PAYMENT_FAILED')) };
    return await presentSheetForParams(data);
  } catch (err) {
    console.error('[stripe] gift hold unexpected error:', err);
    return { ok: false, code: 'UnexpectedError', message: toUserMessage(err, 'errors:app.PAYMENT_FAILED') };
  }
}
