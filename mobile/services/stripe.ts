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

// ── Types ─────────────────────────────────────────────────────────────────────

export type StripeResult = { ok: true } | { ok: false; code: string; message: string };

export interface OrderPayload {
  /** Supabase business UUID */
  businessId: string;
  /** Supabase user UUID (logged-in user) */
  userId: string;
  roomId?: string | null;
  orderType: 'table' | 'counter' | 'gift';
  giftRecipientId?: string | null;
  subtotalCents: number;
  taxCents: number;
  tipCents: number;
  discountCents: number;
  totalCents: number;
  promoCode?: string | null;
  specialInstructions?: string | null;
  items: {
    menuItemId: string;
    name: string;
    qty: number;
    priceCents: number;
    options?: Record<string, unknown>;
    specialInstructions?: string | null;
  }[];
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
    throw new Error('Supabase is not configured. Cannot create a PaymentIntent.');
  }

  // Map camelCase → snake_case for the Edge Function body
  const { data, error } = await supabase.functions.invoke<PaymentSheetParams>('payments', {
    body: {
      action: 'create_payment_intent',
      order: {
        business_id: order.businessId,
        user_id: order.userId,
        room_id: order.roomId ?? null,
        order_type: order.orderType,
        gift_recipient_id: order.giftRecipientId ?? null,
        subtotal_cents: order.subtotalCents,
        tax_cents: order.taxCents,
        tip_cents: order.tipCents,
        discount_cents: order.discountCents,
        total_cents: order.totalCents,
        promo_code: order.promoCode ?? null,
        special_instructions: order.specialInstructions ?? null,
        items: order.items.map((it) => ({
          menu_item_id: it.menuItemId,
          name: it.name,
          qty: it.qty,
          price_cents: it.priceCents,
          options: it.options,
          special_instructions: it.specialInstructions ?? null,
        })),
      },
    },
  });

  if (error) {
    throw new Error(`payments/create_payment_intent failed: ${error.message}`);
  }

  if (!data?.clientSecret) {
    throw new Error('payments/create_payment_intent returned no clientSecret');
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
export async function initAndPresentPaymentSheet(
  order: OrderPayload,
): Promise<StripeResult> {
  try {
    const params = await fetchPaymentSheetParams(order);

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
      // Appearance — uses JChat brand color (BRAND token: #5C7CFA)
      appearance: {
        colors: {
          primary: '#5C7CFA',
        },
      },
      returnURL: 'jchat://stripe-return',
    });

    if (initError) {
      console.error('[stripe] initPaymentSheet error:', initError);
      return {
        ok: false,
        code: initError.code,
        message: initError.localizedMessage ?? initError.message,
      };
    }

    const { error: presentError } = await presentPaymentSheet();

    if (presentError) {
      if (presentError.code === 'Canceled') {
        // User dismissed the sheet — not an error, just a cancel
        return { ok: false, code: 'Canceled', message: 'Payment cancelled' };
      }
      console.error('[stripe] presentPaymentSheet error:', presentError);
      return {
        ok: false,
        code: presentError.code,
        message: presentError.localizedMessage ?? presentError.message,
      };
    }

    // Sheet was confirmed — payment succeeded. The server webhook will create the order.
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown payment error';
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
export async function saveCard(userId: string): Promise<StripeResult> {
  if (!isSupabaseConfigured) {
    return {
      ok: false,
      code: 'NotConfigured',
      message: 'Supabase is not configured. Cannot save card.',
    };
  }

  try {
    const { data, error } = await supabase.functions.invoke<SetupSheetParams>('payments', {
      body: { action: 'create_setup_intent', user_id: userId },
    });

    if (error) {
      return {
        ok: false,
        code: 'FunctionError',
        message: `payments/create_setup_intent failed: ${error.message}`,
      };
    }

    if (!data?.clientSecret) {
      return {
        ok: false,
        code: 'NoClientSecret',
        message: 'payments/create_setup_intent returned no clientSecret',
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
          primary: '#5C7CFA',
        },
      },
      returnURL: 'jchat://stripe-return',
    });

    if (initError) {
      return {
        ok: false,
        code: initError.code,
        message: initError.localizedMessage ?? initError.message,
      };
    }

    const { error: presentError } = await presentPaymentSheet();

    if (presentError) {
      if (presentError.code === 'Canceled') {
        return { ok: false, code: 'Canceled', message: 'Card save cancelled' };
      }
      return {
        ok: false,
        code: presentError.code,
        message: presentError.localizedMessage ?? presentError.message,
      };
    }

    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error saving card';
    console.error('[stripe] saveCard error:', err);
    return { ok: false, code: 'UnexpectedError', message };
  }
}
