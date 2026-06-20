/**
 * JChat 3.0 — Payments Edge Function (Task 3.6)
 * Runtime: Deno (Supabase Edge Functions)
 *
 * RULE 4: ALL Stripe calls live here. The client never creates a
 * PaymentIntent/SetupIntent — it only receives a client_secret.
 *
 * Actions (POST { action, ...params }):
 *   ensure_customer | create_payment_intent | create_setup_intent
 *
 * Required secrets: STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *   EXPO_PUBLIC_STRIPE_PK (returned to client). See README.md.
 *
 * NOTE: user email is read from auth.users via the admin API (public.users has
 * no email column).
 */

import Stripe from "npm:stripe@16.2.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.44.4";

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
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
}
function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status);
}

interface CartItem { menu_item_id: string; name: string; qty: number; price_cents: number; options?: Record<string, unknown>; special_instructions?: string | null; }
interface OrderPayload { business_id: string; user_id: string; room_id?: string | null; order_type: "table" | "counter" | "gift"; gift_recipient_id?: string | null; subtotal_cents: number; tax_cents: number; tip_cents: number; discount_cents: number; total_cents: number; promo_code?: string | null; special_instructions?: string | null; items: CartItem[]; }

/** Email lives in auth.users, not public.users — fetch via the admin API. */
async function userEmail(db: ReturnType<typeof getAdminClient>, userId: string): Promise<string | undefined> {
  const { data } = await db.auth.admin.getUserById(userId);
  return data.user?.email ?? undefined;
}

async function handleEnsureCustomer(body: Record<string, unknown>): Promise<Response> {
  const userId = typeof body.user_id === "string" ? body.user_id : null;
  if (!userId) return errorResponse("user_id is required");
  const db = getAdminClient();
  const stripe = getStripe();
  const { data: user, error: userErr } = await db.from("users").select("id, display_name, stripe_customer_id").eq("id", userId).maybeSingle();
  if (userErr) return errorResponse(`DB error: ${userErr.message}`, 500);
  if (!user) return errorResponse("User not found", 404);
  if (user.stripe_customer_id) return jsonResponse({ customer_id: user.stripe_customer_id });
  const customer = await stripe.customers.create({ email: await userEmail(db, userId), name: user.display_name ?? undefined, metadata: { supabase_user_id: userId } });
  const { error: updateErr } = await db.from("users").update({ stripe_customer_id: customer.id }).eq("id", userId);
  if (updateErr) console.error("[payments] failed to save stripe_customer_id:", updateErr);
  return jsonResponse({ customer_id: customer.id });
}

async function handleCreatePaymentIntent(body: Record<string, unknown>): Promise<Response> {
  const payload = body.order as OrderPayload | undefined;
  if (!payload) return errorResponse("order payload is required");
  const { business_id, user_id, room_id, order_type, gift_recipient_id, subtotal_cents, tax_cents, tip_cents, discount_cents, total_cents, promo_code, special_instructions, items } = payload;
  if (!business_id) return errorResponse("order.business_id is required");
  if (!user_id) return errorResponse("order.user_id is required");
  if (!total_cents || total_cents < 50) return errorResponse("order.total_cents must be at least 50 (Stripe minimum)");
  const db = getAdminClient();
  const stripe = getStripe();
  const { data: user, error: userErr } = await db.from("users").select("id, display_name, stripe_customer_id").eq("id", user_id).maybeSingle();
  if (userErr) return errorResponse(`DB error: ${userErr.message}`, 500);
  if (!user) return errorResponse("User not found", 404);
  let customerId = user.stripe_customer_id as string | null;
  if (!customerId) {
    const customer = await stripe.customers.create({ email: await userEmail(db, user_id), name: user.display_name ?? undefined, metadata: { supabase_user_id: user_id } });
    customerId = customer.id;
    await db.from("users").update({ stripe_customer_id: customerId }).eq("id", user_id);
  }
  const { data: business, error: bizErr } = await db.from("businesses").select("id, stripe_account_id").eq("id", business_id).maybeSingle();
  if (bizErr) return errorResponse(`DB error: ${bizErr.message}`, 500);
  if (!business) return errorResponse("Business not found", 404);
  const stripeAccountId = business.stripe_account_id as string | null;
  const ephemeralKey = await stripe.ephemeralKeys.create({ customer: customerId }, { apiVersion: "2024-06-20" });
  const itemsMeta = JSON.stringify(items.map((it) => ({ m: it.menu_item_id, q: it.qty, p: it.price_cents, ...(it.options ? { o: it.options } : {}), ...(it.special_instructions ? { s: it.special_instructions } : {}) })));
  const metadata: Record<string, string> = { business_id, user_id, order_type, subtotal_cents: String(subtotal_cents), tax_cents: String(tax_cents), tip_cents: String(tip_cents), discount_cents: String(discount_cents), total_cents: String(total_cents), items: itemsMeta.slice(0, 490) };
  if (room_id) metadata.room_id = room_id;
  if (gift_recipient_id) metadata.gift_recipient_id = gift_recipient_id;
  if (promo_code) metadata.promo_code = promo_code;
  if (special_instructions) metadata.special_instructions = special_instructions.slice(0, 490);
  if (itemsMeta.length > 490) metadata.items_overflow = "1";
  const piParams: Stripe.PaymentIntentCreateParams = { amount: total_cents, currency: "usd", customer: customerId, automatic_payment_methods: { enabled: true }, metadata };
  if (stripeAccountId) {
    const platformFeePercent = parseFloat(Deno.env.get("PLATFORM_FEE_PERCENT") ?? "2.9");
    const platformFeeFixed = parseInt(Deno.env.get("PLATFORM_FEE_FIXED_CENTS") ?? "30", 10);
    const platformFeeCents = Math.round((total_cents * platformFeePercent) / 100) + platformFeeFixed;
    piParams.application_fee_amount = platformFeeCents;
    piParams.transfer_data = { destination: stripeAccountId };
    piParams.on_behalf_of = stripeAccountId;
  }
  const paymentIntent = await stripe.paymentIntents.create(piParams);
  const publishableKey = Deno.env.get("EXPO_PUBLIC_STRIPE_PK") ?? "";
  return jsonResponse({ clientSecret: paymentIntent.client_secret, ephemeralKey: ephemeralKey.secret, customer: customerId, publishableKey });
}

async function handleCreateSetupIntent(body: Record<string, unknown>): Promise<Response> {
  const userId = typeof body.user_id === "string" ? body.user_id : null;
  if (!userId) return errorResponse("user_id is required");
  const db = getAdminClient();
  const stripe = getStripe();
  const { data: user, error: userErr } = await db.from("users").select("id, display_name, stripe_customer_id").eq("id", userId).maybeSingle();
  if (userErr) return errorResponse(`DB error: ${userErr.message}`, 500);
  if (!user) return errorResponse("User not found", 404);
  let customerId = user.stripe_customer_id as string | null;
  if (!customerId) {
    const customer = await stripe.customers.create({ email: await userEmail(db, userId), name: user.display_name ?? undefined, metadata: { supabase_user_id: userId } });
    customerId = customer.id;
    await db.from("users").update({ stripe_customer_id: customerId }).eq("id", userId);
  }
  const setupIntent = await stripe.setupIntents.create({ customer: customerId, automatic_payment_methods: { enabled: true }, metadata: { supabase_user_id: userId } });
  const ephemeralKey = await stripe.ephemeralKeys.create({ customer: customerId }, { apiVersion: "2024-06-20" });
  const publishableKey = Deno.env.get("EXPO_PUBLIC_STRIPE_PK") ?? "";
  return jsonResponse({ clientSecret: setupIntent.client_secret, ephemeralKey: ephemeralKey.secret, customer: customerId, publishableKey });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return errorResponse("Invalid JSON body"); }
  const action = typeof body.action === "string" ? body.action : null;
  try {
    switch (action) {
      case "ensure_customer": return await handleEnsureCustomer(body);
      case "create_payment_intent": return await handleCreatePaymentIntent(body);
      case "create_setup_intent": return await handleCreateSetupIntent(body);
      default: return errorResponse(`Unknown action: ${action ?? "(none)"}`);
    }
  } catch (err) {
    console.error(`[payments] error in action "${action}":`, err);
    return errorResponse("Internal server error", 500);
  }
});
