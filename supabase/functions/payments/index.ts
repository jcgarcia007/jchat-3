/**
 * JChat 3.0 — Payments Edge Function (Task 3.6)
 * Runtime: Deno (Supabase Edge Functions)
 *
 * RULE 4 COMPLIANCE: ALL Stripe API calls live here. The mobile client NEVER
 * creates a PaymentIntent or SetupIntent — it only receives a client_secret
 * and calls presentPaymentSheet. API keys never touch the client.
 *
 * Actions (POST body: { action, ...params }):
 *   ensure_customer        — idempotent: create a Stripe Customer if missing, save to users.stripe_customer_id
 *   create_payment_intent  — server-side PaymentIntent for an order total; Stripe Connect transfer to business
 *   create_setup_intent    — SetupIntent for saving a card (no charge)
 *
 * Deploy:
 *   supabase functions deploy payments
 *
 * Required env vars (Supabase dashboard → Edge Functions → Secrets):
 *   STRIPE_SECRET_KEY         — sk_live_… or sk_test_…
 *   SUPABASE_URL              — auto-injected by Supabase
 *   SUPABASE_SERVICE_ROLE_KEY — set manually in secrets
 *   EXPO_PUBLIC_STRIPE_PK     — pk_live_… or pk_test_… (returned to client for StripeProvider)
 *
 * See README.md for full deploy notes.
 */

// ── Deno imports ──────────────────────────────────────────────────────────────
import Stripe from "npm:stripe@16.2.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.44.4";

// ── Supabase admin client (service role — bypasses RLS) ──────────────────────

function getAdminClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

// ── Stripe client ─────────────────────────────────────────────────────────────

function getStripe(): Stripe {
  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!key) throw new Error("Missing STRIPE_SECRET_KEY");
  return new Stripe(key, { apiVersion: "2024-06-20" });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
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

// ── Types for order cart passed from mobile ───────────────────────────────────

interface CartItem {
  menu_item_id: string;
  name: string;
  qty: number;
  price_cents: number;
  options?: Record<string, unknown>;
  special_instructions?: string | null;
}

interface OrderPayload {
  business_id: string;
  user_id: string;
  room_id?: string | null;
  order_type: "table" | "counter" | "gift";
  gift_recipient_id?: string | null;
  subtotal_cents: number;
  tax_cents: number;
  tip_cents: number;
  discount_cents: number;
  total_cents: number;
  promo_code?: string | null;
  special_instructions?: string | null;
  items: CartItem[];
}

// ── Action: ensure_customer ───────────────────────────────────────────────────
// Idempotent: if users.stripe_customer_id is already set, returns existing id.

async function handleEnsureCustomer(
  body: Record<string, unknown>,
): Promise<Response> {
  const userId = typeof body.user_id === "string" ? body.user_id : null;
  if (!userId) return errorResponse("user_id is required");

  const db = getAdminClient();
  const stripe = getStripe();

  // Fetch user
  const { data: user, error: userErr } = await db
    .from("users")
    .select("id, email, display_name, stripe_customer_id")
    .eq("id", userId)
    .maybeSingle();

  if (userErr) return errorResponse(`DB error: ${userErr.message}`, 500);
  if (!user) return errorResponse("User not found", 404);

  // Return existing customer id if already set
  if (user.stripe_customer_id) {
    return jsonResponse({ customer_id: user.stripe_customer_id });
  }

  // Create a new Stripe Customer
  const customer = await stripe.customers.create({
    email: user.email ?? undefined,
    name: user.display_name ?? undefined,
    metadata: { supabase_user_id: userId },
  });

  // Persist to users table (service-role bypasses RLS)
  const { error: updateErr } = await db
    .from("users")
    .update({ stripe_customer_id: customer.id })
    .eq("id", userId);

  if (updateErr) {
    console.error("[payments] failed to save stripe_customer_id:", updateErr);
    // Still return the customer id — client can retry if needed
  }

  return jsonResponse({ customer_id: customer.id });
}

// ── Action: create_payment_intent ─────────────────────────────────────────────
// Creates a PaymentIntent for a full order total SERVER-SIDE.
// Uses Stripe Connect: business receives payment via transfer_data/on_behalf_of.
// Returns { clientSecret, ephemeralKey, customer, publishableKey } for mobile PaymentSheet.
//
// PaymentIntent metadata stores full cart so the stripe-webhook function can
// create the orders + order_items rows after payment_intent.succeeded fires.

async function handleCreatePaymentIntent(
  body: Record<string, unknown>,
): Promise<Response> {
  const payload = body.order as OrderPayload | undefined;
  if (!payload) return errorResponse("order payload is required");

  const {
    business_id,
    user_id,
    room_id,
    order_type,
    gift_recipient_id,
    subtotal_cents,
    tax_cents,
    tip_cents,
    discount_cents,
    total_cents,
    promo_code,
    special_instructions,
    items,
  } = payload;

  if (!business_id) return errorResponse("order.business_id is required");
  if (!user_id) return errorResponse("order.user_id is required");
  if (!total_cents || total_cents < 50)
    return errorResponse("order.total_cents must be at least 50 (Stripe minimum)");

  const db = getAdminClient();
  const stripe = getStripe();

  // 1. Resolve Stripe Customer (ensure_customer inline to avoid extra round-trip)
  const { data: user, error: userErr } = await db
    .from("users")
    .select("id, email, display_name, stripe_customer_id")
    .eq("id", user_id)
    .maybeSingle();

  if (userErr) return errorResponse(`DB error: ${userErr.message}`, 500);
  if (!user) return errorResponse("User not found", 404);

  let customerId = user.stripe_customer_id as string | null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      name: user.display_name ?? undefined,
      metadata: { supabase_user_id: user_id },
    });
    customerId = customer.id;
    await db.from("users").update({ stripe_customer_id: customerId }).eq("id", user_id);
  }

  // 2. Resolve business Stripe Connect account
  const { data: business, error: bizErr } = await db
    .from("businesses")
    .select("id, stripe_account_id")
    .eq("id", business_id)
    .maybeSingle();

  if (bizErr) return errorResponse(`DB error: ${bizErr.message}`, 500);
  if (!business) return errorResponse("Business not found", 404);

  const stripeAccountId = business.stripe_account_id as string | null;

  // 3. Ephemeral key — lets the PaymentSheet manage saved cards for this customer
  const ephemeralKey = await stripe.ephemeralKeys.create(
    { customer: customerId },
    { apiVersion: "2024-06-20" },
  );

  // 4. Build PaymentIntent params
  // Metadata encodes the full cart so the webhook can create the order record.
  // JSON-encode items array into a single metadata string (Stripe metadata values ≤ 500 chars each).
  const itemsMeta = JSON.stringify(
    items.map((it) => ({
      m: it.menu_item_id,
      q: it.qty,
      p: it.price_cents,
      ...(it.options ? { o: it.options } : {}),
      ...(it.special_instructions ? { s: it.special_instructions } : {}),
    })),
  );

  const metadata: Record<string, string> = {
    business_id,
    user_id,
    order_type,
    subtotal_cents: String(subtotal_cents),
    tax_cents: String(tax_cents),
    tip_cents: String(tip_cents),
    discount_cents: String(discount_cents),
    total_cents: String(total_cents),
    items: itemsMeta.slice(0, 490), // Stripe metadata value max 500 chars
  };

  if (room_id) metadata.room_id = room_id;
  if (gift_recipient_id) metadata.gift_recipient_id = gift_recipient_id;
  if (promo_code) metadata.promo_code = promo_code;
  if (special_instructions) metadata.special_instructions = special_instructions.slice(0, 490);

  // If items JSON exceeds 490 chars, store full payload in a separate overflow key
  if (itemsMeta.length > 490) {
    metadata.items_overflow = "1"; // signal to webhook to query its own DB snapshot
    console.warn(
      `[payments] items metadata truncated (${itemsMeta.length} chars). ` +
        "Webhook will need to reconstruct from metadata fields.",
    );
  }

  const piParams: Stripe.PaymentIntentCreateParams = {
    amount: total_cents,
    currency: "usd",
    customer: customerId,
    automatic_payment_methods: { enabled: true },
    metadata,
  };

  // Stripe Connect: route payment to business account
  // If the business has a connected Stripe account, use transfer_data + on_behalf_of.
  // If not (e.g. not yet onboarded), charge normally (platform takes full amount).
  if (stripeAccountId) {
    // Platform fee: 2.9% + 30¢ platform cut (adjust as needed — stored in env)
    const platformFeePercent = parseFloat(Deno.env.get("PLATFORM_FEE_PERCENT") ?? "2.9");
    const platformFeeFixed = parseInt(Deno.env.get("PLATFORM_FEE_FIXED_CENTS") ?? "30", 10);
    const platformFeeCents = Math.round((total_cents * platformFeePercent) / 100) + platformFeeFixed;

    piParams.application_fee_amount = platformFeeCents;
    piParams.transfer_data = { destination: stripeAccountId };
    piParams.on_behalf_of = stripeAccountId;
  }

  const paymentIntent = await stripe.paymentIntents.create(piParams);

  const publishableKey = Deno.env.get("EXPO_PUBLIC_STRIPE_PK") ?? "";

  return jsonResponse({
    clientSecret: paymentIntent.client_secret,
    ephemeralKey: ephemeralKey.secret,
    customer: customerId,
    publishableKey,
  });
}

// ── Action: create_setup_intent ───────────────────────────────────────────────
// Creates a SetupIntent so the user can save a card for future purchases.
// Returns { clientSecret, ephemeralKey, customer, publishableKey }.

async function handleCreateSetupIntent(
  body: Record<string, unknown>,
): Promise<Response> {
  const userId = typeof body.user_id === "string" ? body.user_id : null;
  if (!userId) return errorResponse("user_id is required");

  const db = getAdminClient();
  const stripe = getStripe();

  // Ensure Stripe customer exists
  const { data: user, error: userErr } = await db
    .from("users")
    .select("id, email, display_name, stripe_customer_id")
    .eq("id", userId)
    .maybeSingle();

  if (userErr) return errorResponse(`DB error: ${userErr.message}`, 500);
  if (!user) return errorResponse("User not found", 404);

  let customerId = user.stripe_customer_id as string | null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      name: user.display_name ?? undefined,
      metadata: { supabase_user_id: userId },
    });
    customerId = customer.id;
    await db.from("users").update({ stripe_customer_id: customerId }).eq("id", userId);
  }

  const setupIntent = await stripe.setupIntents.create({
    customer: customerId,
    automatic_payment_methods: { enabled: true },
    metadata: { supabase_user_id: userId },
  });

  const ephemeralKey = await stripe.ephemeralKeys.create(
    { customer: customerId },
    { apiVersion: "2024-06-20" },
  );

  const publishableKey = Deno.env.get("EXPO_PUBLIC_STRIPE_PK") ?? "";

  return jsonResponse({
    clientSecret: setupIntent.client_secret,
    ephemeralKey: ephemeralKey.secret,
    customer: customerId,
    publishableKey,
  });
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request): Promise<Response> => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body");
  }

  const action = typeof body.action === "string" ? body.action : null;

  try {
    switch (action) {
      case "ensure_customer":
        return await handleEnsureCustomer(body);
      case "create_payment_intent":
        return await handleCreatePaymentIntent(body);
      case "create_setup_intent":
        return await handleCreateSetupIntent(body);
      default:
        return errorResponse(`Unknown action: ${action ?? "(none)"}`);
    }
  } catch (err) {
    console.error(`[payments] error in action "${action}":`, err);
    return errorResponse("Internal server error", 500);
  }
});
