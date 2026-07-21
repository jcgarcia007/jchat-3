/**
 * Shared Stripe Connect helpers — the ONE place the destination-charge routing
 * lives. Both `payments` (customer order checkout) and `tab-pay` (public tab
 * settlement) import this, so the money always reaches the business's connected
 * account the same way and the Connect block is never copied (D-… / task rule).
 *
 * Deno Edge Functions: this file sits outside a function folder in _shared and is
 * bundled into each function that imports it via `../_shared/connect.ts`.
 */

import type Stripe from "npm:stripe@16.2.0";

/** The fields the gate needs — a subset of the businesses row. */
export interface BusinessChargeState {
  stripe_account_id: string | null;
  status: string | null;
  stripe_charges_enabled: boolean | null;
}

/**
 * Can this business LEGITIMATELY receive a charge right now? Returns the SAME
 * error message + status the payment flow has always returned, or null when the
 * business is clear to charge. Callers turn { error, status } into their response.
 *
 * Order matters: verified → has Connect account → onboarding finished. Skipping
 * any of these once routed money to the platform account or failed at the register.
 */
export function businessChargeGate(
  business: BusinessChargeState,
): { error: string; status: number } | null {
  if (business.status !== "verified") {
    return { error: "This business is pending verification", status: 409 };
  }
  if (!business.stripe_account_id) {
    return { error: "This business is not set up to accept payments yet", status: 409 };
  }
  if (!business.stripe_charges_enabled) {
    return { error: "This business has not completed Stripe onboarding", status: 409 };
  }
  return null;
}

/**
 * Build PaymentIntent params with the destination-charge routing: the platform
 * takes application_fee_amount, the rest is transferred to the connected account
 * (on_behalf_of makes the connected account the merchant of record). `amountCents`
 * is server-owned — never a client figure.
 *
 * Assumes the business already passed businessChargeGate, so stripeAccountId is set.
 */
export function buildConnectPiParams(opts: {
  amountCents: number;
  currency: string;
  metadata: Record<string, string>;
  stripeAccountId: string;
  customer?: string;
  receiptEmail?: string | null;
}): Stripe.PaymentIntentCreateParams {
  const platformFeePercent = parseFloat(Deno.env.get("PLATFORM_FEE_PERCENT") ?? "2.9");
  const platformFeeFixed = parseInt(Deno.env.get("PLATFORM_FEE_FIXED_CENTS") ?? "30", 10);
  const platformFeeCents =
    Math.round((opts.amountCents * platformFeePercent) / 100) + platformFeeFixed;

  const params: Stripe.PaymentIntentCreateParams = {
    amount: opts.amountCents,
    currency: opts.currency,
    automatic_payment_methods: { enabled: true },
    metadata: opts.metadata,
    application_fee_amount: platformFeeCents,
    transfer_data: { destination: opts.stripeAccountId },
    on_behalf_of: opts.stripeAccountId,
  };
  if (opts.customer) params.customer = opts.customer;
  if (opts.receiptEmail) params.receipt_email = opts.receiptEmail;
  return params;
}
