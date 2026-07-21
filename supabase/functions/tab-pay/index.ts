/**
 * JChat 3.0 — tab-pay Edge Function (Cobro parte A).
 * Runtime: Deno (Supabase Edge Functions)
 *
 * PUBLIC endpoint (verify_jwt = false in config.toml): the customer paying a tab
 * from their phone via the /pay/{token} QR page may have NO account, so this can't
 * require a JWT. It is NOT unauthenticated-open: the only input is an opaque,
 * unguessable pay_token, and it acts ONLY on a tab_payment that is still 'pending'
 * and method='card'. Same trust model as the Stripe webhook (verify_jwt=false,
 * protected by a secret it holds). No PII is ever returned — only a client secret.
 *
 * Why a separate function and not an action in `payments`: `payments` is verify_jwt
 * = true (all its actions are caller-scoped) and MUST stay that way. The Connect
 * routing is NOT duplicated — it comes from ../_shared/connect.ts, the same helper
 * `payments` uses.
 *
 * Action: { action: "create_tab_payment_intent", pay_token }
 *   → resolves the pending card payment, applies the SAME Connect gates + routing,
 *     stamps metadata.payment_kind='tab_settlement' (the discriminator that stops
 *     the webhook from creating a phantom order), saves stripe_pi_id, and returns
 *     { clientSecret, publishableKey }.
 *
 * Required secrets: STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *   EXPO_PUBLIC_STRIPE_PK, PLATFORM_FEE_PERCENT / PLATFORM_FEE_FIXED_CENTS (shared).
 */

import Stripe from "npm:stripe@16.2.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.44.4";
import { businessChargeGate, buildConnectPiParams } from "../_shared/connect.ts";

function getAdminClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

function getStripe(): Stripe {
  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!key) throw new Error("Missing STRIPE_SECRET_KEY");
  return new Stripe(key, { apiVersion: "2024-06-20" });
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}
function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status);
}

async function handleCreateTabPaymentIntent(body: Record<string, unknown>): Promise<Response> {
  const payToken = typeof body.pay_token === "string" ? body.pay_token.trim() : "";
  if (!payToken) return errorResponse("pay_token is required");

  const db = getAdminClient();
  const stripe = getStripe();

  // Resolve the payment (service_role bypasses RLS). Must be a PENDING card payment.
  const { data: pay, error: payErr } = await db
    .from("tab_payments")
    .select("id, tab_id, business_id, amount_cents, tip_cents, method, status, stripe_pi_id")
    .eq("pay_token", payToken)
    .maybeSingle();
  if (payErr) return errorResponse(`DB error: ${payErr.message}`, 500);
  if (!pay) return errorResponse("Este cobro no existe o ya no está disponible", 404);
  if (pay.method !== "card") return errorResponse("Este cobro no es con tarjeta", 400);
  if (pay.status !== "pending") return errorResponse("Este cobro ya no está pendiente", 409);

  const publishableKey = Deno.env.get("EXPO_PUBLIC_STRIPE_PK") ?? "";

  // Idempotent on page reload: if the PI already exists, return ITS client secret
  // rather than creating a second PaymentIntent for the same settlement.
  if (pay.stripe_pi_id) {
    const existing = await stripe.paymentIntents.retrieve(pay.stripe_pi_id as string);
    return jsonResponse({ clientSecret: existing.client_secret, publishableKey });
  }

  // Same Connect gates as the order flow: verified → account → charges enabled.
  const { data: business, error: bizErr } = await db
    .from("businesses")
    .select("id, stripe_account_id, status, stripe_charges_enabled")
    .eq("id", pay.business_id)
    .maybeSingle();
  if (bizErr) return errorResponse(`DB error: ${bizErr.message}`, 500);
  if (!business) return errorResponse("Business not found", 404);

  const gate = businessChargeGate(business as {
    stripe_account_id: string | null;
    status: string | null;
    stripe_charges_enabled: boolean | null;
  });
  if (gate) return errorResponse(gate.error, gate.status);

  // Charge = server amount + waiter-entered tip. Never a client figure.
  const chargeCents = (pay.amount_cents as number) + ((pay.tip_cents as number) ?? 0);

  // payment_kind is the discriminator that stops the webhook from creating a
  // phantom order for a tab settlement.
  const metadata: Record<string, string> = {
    payment_kind: "tab_settlement",
    tab_payment_id: pay.id as string,
    tab_id: pay.tab_id as string,
    business_id: pay.business_id as string,
  };

  const piParams = buildConnectPiParams({
    amountCents: chargeCents,
    currency: "usd",
    metadata,
    stripeAccountId: business.stripe_account_id as string, // gate guaranteed non-null
  });

  const paymentIntent = await stripe.paymentIntents.create(piParams, {
    idempotencyKey: `tabpi:${payToken}`,
  });

  // Bind the PI to the payment row so the webhook can settle by tab_payment_id and
  // reloads reuse this PI.
  const { error: updErr } = await db
    .from("tab_payments")
    .update({ stripe_pi_id: paymentIntent.id })
    .eq("id", pay.id);
  if (updErr) console.error("[tab-pay] failed to save stripe_pi_id:", updErr);

  return jsonResponse({ clientSecret: paymentIntent.client_secret, publishableKey });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body");
  }
  const action = typeof body.action === "string" ? body.action : null;

  try {
    switch (action) {
      case "create_tab_payment_intent":
        return await handleCreateTabPaymentIntent(body);
      default:
        return errorResponse(`Unknown action: ${action ?? "(none)"}`);
    }
  } catch (err) {
    console.error(`[tab-pay] error in action "${action}":`, err);
    return errorResponse("Internal server error", 500);
  }
});
