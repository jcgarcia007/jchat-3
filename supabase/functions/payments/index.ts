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
 * Security (P0-2, P0-3 — 2026-06-24; FIX #7 — 2026-07-08):
 *   ALL three actions verify the caller's JWT (verifyCaller) and operate on the
 *   verified authUserId — never body.user_id. create_payment_intent also
 *   recalculates all order amounts from the DB. The client-supplied
 *   total/subtotal/tax/discount are ignored; only tip_cents comes from the client
 *   (validated + capped at 200% of server subtotal). discount_cents is forced to 0
 *   until a promo-code table exists (TODO: Task 3.5).
 *
 * NOTE: user email is read from auth.users via the admin API (public.users has
 * no email column).
 */

import Stripe from "npm:stripe@16.2.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.44.4";

// 8% fallback when businesses.tax_rate IS NULL — matches client default.
// Change this constant (or set businesses.tax_rate per business) to adjust.
const TAX_FALLBACK = 0.08;

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

/**
 * Verify the caller's JWT (FIX #7). Returns { authUserId } or a 401/500 Response.
 * Same pattern as subscriptions/index.ts. authUserId is the ONLY trusted user
 * identity — body.user_id must never be used for auth or DB lookups.
 */
async function verifyCaller(req: Request): Promise<{ authUserId: string } | Response> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return errorResponse("Missing or invalid Authorization header", 401);
  }
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!anonKey || !supabaseUrl) {
    console.error("[payments] SUPABASE_ANON_KEY or SUPABASE_URL not set");
    return errorResponse("Internal server error", 500);
  }
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return errorResponse("Unauthorized", 401);
  return { authUserId: user.id };
}

interface CartItem { menu_item_id: string; name: string; qty: number; price_cents: number; options?: Record<string, unknown>; special_instructions?: string | null; }
interface OrderPayload { business_id: string; user_id: string; room_id?: string | null; order_type: "table" | "counter" | "gift"; gift_recipient_id?: string | null; subtotal_cents: number; tax_cents: number; tip_cents: number; discount_cents: number; total_cents: number; promo_code?: string | null; special_instructions?: string | null; table_label?: string | null; items: CartItem[]; }

/** Email lives in auth.users, not public.users — fetch via the admin API. */
async function userEmail(db: ReturnType<typeof getAdminClient>, userId: string): Promise<string | undefined> {
  const { data } = await db.auth.admin.getUserById(userId);
  return data.user?.email ?? undefined;
}

// FIX #7: operates on the JWT-verified caller (authUserId); body.user_id is ignored.
async function handleEnsureCustomer(authUserId: string): Promise<Response> {
  const db = getAdminClient();
  const stripe = getStripe();
  const { data: user, error: userErr } = await db.from("users").select("id, display_name, stripe_customer_id").eq("id", authUserId).maybeSingle();
  if (userErr) return errorResponse(`DB error: ${userErr.message}`, 500);
  if (!user) return errorResponse("User not found", 404);
  if (user.stripe_customer_id) return jsonResponse({ customer_id: user.stripe_customer_id });
  const customer = await stripe.customers.create({ email: await userEmail(db, authUserId), name: user.display_name ?? undefined, metadata: { supabase_user_id: authUserId } });
  const { error: updateErr } = await db.from("users").update({ stripe_customer_id: customer.id }).eq("id", authUserId);
  if (updateErr) console.error("[payments] failed to save stripe_customer_id:", updateErr);
  return jsonResponse({ customer_id: customer.id });
}

/**
 * FIX #6: resolve the DB price of a line's selected modifiers (size + extras),
 * reading prices from the server-owned menu_items.options jsonb — never the client.
 * Legacy shape: { sizes: [{label, price_cents}], extras: [{label, price_cents}] }.
 * Returns { cents } to add to the line, or { error } for a 400.
 *
 * Backward-compat: the client currently sends options:{} (Part B will send
 * { size, extras }). With an empty selection this returns { cents: 0 } → the
 * line price is unchanged (base only), so no current payment changes.
 */
function resolveModifierCents(
  // deno-lint-ignore no-explicit-any
  row: any,
  options: Record<string, unknown> | undefined,
  itemName: string,
): { cents: number } | { error: string } {
  const sel = options ?? {};
  const sizes = (row.options?.sizes ?? []) as Array<{ label?: string; price_cents?: number }>;
  const extras = (row.options?.extras ?? []) as Array<{ label?: string; price_cents?: number }>;
  let cents = 0;

  const selSize = typeof sel.size === "string" ? sel.size : null;
  if (selSize) {
    const match = sizes.find((s) => s.label === selSize);
    if (!match) return { error: `Invalid size "${selSize}" for ${itemName}` };
    cents += typeof match.price_cents === "number" ? match.price_cents : 0;
  }

  const selExtras = Array.isArray(sel.extras) ? sel.extras : [];
  for (const label of selExtras) {
    if (typeof label !== "string") continue;
    const match = extras.find((e) => e.label === label);
    if (!match) return { error: `Invalid extra "${label}" for ${itemName}` };
    cents += typeof match.price_cents === "number" ? match.price_cents : 0;
  }

  return { cents };
}

/**
 * authUserId: JWT-verified caller identity from Deno.serve — never use body.user_id
 * for authentication or DB lookups. body.user_id is kept as a trace field only.
 */
async function handleCreatePaymentIntent(body: Record<string, unknown>, authUserId: string): Promise<Response> {
  const payload = body.order as OrderPayload | undefined;
  if (!payload) return errorResponse("order payload is required");

  const { business_id, room_id, order_type, gift_recipient_id, promo_code, special_instructions, table_label, items } = payload;
  // Sanitize free-text table label (never trust the client; Stripe metadata is length-capped).
  const tableLabel = typeof table_label === "string"
    ? table_label.trim().slice(0, 40) || null
    : null;

  // tip_cents is the only client-supplied amount we accept; all others are recalculated.
  const clientTipCents = typeof payload.tip_cents === "number" ? payload.tip_cents : 0;
  // Retain client's user_id as trace for debugging; never used for auth or DB ops.
  const traceUserId = typeof payload.user_id === "string" ? payload.user_id : authUserId;

  if (!business_id) return errorResponse("order.business_id is required");
  if (!order_type || !["table", "counter", "gift"].includes(order_type)) {
    return errorResponse("order.order_type must be table, counter, or gift");
  }

  // Guard: non-empty cart
  if (!Array.isArray(items) || items.length === 0) return errorResponse("Cart is empty");

  // Validate per-line structure before any DB call
  for (const it of items) {
    if (typeof it.menu_item_id !== "string" || !it.menu_item_id) {
      return errorResponse("Each item must have a menu_item_id");
    }
    if (!Number.isInteger(it.qty) || it.qty < 1) {
      return errorResponse(`Invalid qty for item ${it.menu_item_id}`);
    }
  }

  const db = getAdminClient();
  const stripe = getStripe();

  // ── Fetch authenticated user (for Stripe customer) ────────────────────────
  const { data: user, error: userErr } = await db
    .from("users")
    .select("id, display_name, stripe_customer_id")
    .eq("id", authUserId)
    .maybeSingle();
  if (userErr) return errorResponse(`DB error: ${userErr.message}`, 500);
  if (!user) return errorResponse("User not found", 404);

  let customerId = user.stripe_customer_id as string | null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: await userEmail(db, authUserId),
      name: user.display_name ?? undefined,
      metadata: { supabase_user_id: authUserId },
    });
    customerId = customer.id;
    await db.from("users").update({ stripe_customer_id: customerId }).eq("id", authUserId);
  }

  // ── Fetch business (tax_rate + Stripe Connect account) ───────────────────
  const { data: business, error: bizErr } = await db
    .from("businesses")
    .select("id, stripe_account_id, tax_rate")
    .eq("id", business_id)
    .maybeSingle();
  if (bizErr) return errorResponse(`DB error: ${bizErr.message}`, 500);
  if (!business) return errorResponse("Business not found", 404);
  const stripeAccountId = business.stripe_account_id as string | null;

  // ── Validate items against DB (P0-2) ──────────────────────────────────────
  // De-duplicate IDs for the IN query; duplicates in items[] are intentional
  // (same dish added twice → two cart lines) and summed in recalculation below.
  const itemIds = [...new Set(items.map((it) => it.menu_item_id))];
  const { data: dbItems, error: itemsErr } = await db
    .from("menu_items")
    .select("id, price_cents, is_available, business_id, name, options")
    .in("id", itemIds);
  if (itemsErr) return errorResponse(`DB error fetching items: ${itemsErr.message}`, 500);

  // deno-lint-ignore no-explicit-any
  const dbMap = new Map<string, any>((dbItems ?? []).map((r: any) => [r.id as string, r]));

  for (const it of items) {
    const row = dbMap.get(it.menu_item_id);
    if (!row)                            return errorResponse(`Item not found: ${it.menu_item_id}`);
    if (row.business_id !== business_id) return errorResponse("Item does not belong to this business");
    if (!row.is_available)               return errorResponse(`Item not available: ${row.name}`);
  }

  // ── Server-side recalculation (P0-2 + FIX #6 modifiers) ───────────────────
  // Uses DB base price per item AND DB modifier prices (size/extras read from
  // menu_items.options); the client's price_cents and any prices in it.options
  // are ignored. Duplicate cart lines (same menu_item_id twice) are both summed.
  // lineUnitCents[idx] = DB base + DB modifiers for items[idx].
  const lineUnitCents: number[] = [];
  for (const it of items) {
    const row = dbMap.get(it.menu_item_id)!;
    const mod = resolveModifierCents(row, it.options, row.name as string);
    if ("error" in mod) return errorResponse(mod.error);
    lineUnitCents.push((row.price_cents as number) + mod.cents);
  }
  const serverSubtotalCents = items.reduce(
    (sum, it, idx) => sum + lineUnitCents[idx] * it.qty,
    0,
  );

  const taxRate = business.tax_rate != null ? Number(business.tax_rate) : TAX_FALLBACK;
  const serverTaxCents = Math.round(serverSubtotalCents * taxRate);

  // Tip: validate non-negative integer, capped at 200% of server subtotal.
  const maxTipCents = serverSubtotalCents * 2;
  if (!Number.isInteger(clientTipCents) || clientTipCents < 0 || clientTipCents > maxTipCents) {
    return errorResponse(`tip_cents out of range (0–${maxTipCents})`);
  }

  // No promo table to validate against; discount is always 0 for now.
  // TODO(Task 3.5): implement promo code validation and remove this override.
  const serverDiscountCents = 0;

  const serverTotalCents = serverSubtotalCents + serverTaxCents + clientTipCents - serverDiscountCents;
  if (serverTotalCents < 50) return errorResponse("Total is below Stripe minimum ($0.50)");

  // ── Build metadata with server-calculated values ───────────────────────────
  // stripe-webhook reads these fields from paymentIntent.metadata and writes
  // them verbatim to the orders row. By populating them here from server values,
  // the webhook stays correct without any changes.
  // item `p` uses the DB line unit (base + modifiers) so the webhook writes a
  // trustworthy order_items.price_cents snapshot — not the client's price.
  const itemsMeta = JSON.stringify(
    items.map((it, idx) => ({
      m: it.menu_item_id,
      q: it.qty,
      p: lineUnitCents[idx], // DB base + DB modifiers, not client
      ...(it.options ? { o: it.options } : {}),
      ...(it.special_instructions ? { s: it.special_instructions } : {}),
    })),
  );

  const metadata: Record<string, string> = {
    business_id,
    user_id:        authUserId,                       // JWT-verified
    order_type,
    subtotal_cents: String(serverSubtotalCents),       // server-recalculated
    tax_cents:      String(serverTaxCents),            // server-recalculated
    tip_cents:      String(clientTipCents),            // client-supplied, validated
    discount_cents: String(serverDiscountCents),       // = "0" until promo system
    total_cents:    String(serverTotalCents),          // server-recalculated
    items:          itemsMeta.slice(0, 490),
  };
  if (room_id)             metadata.room_id = room_id;
  if (gift_recipient_id)   metadata.gift_recipient_id = gift_recipient_id;
  if (promo_code)          metadata.promo_code = promo_code;
  if (special_instructions) metadata.special_instructions = special_instructions.slice(0, 490);
  if (tableLabel)           metadata.table_label = tableLabel;
  if (itemsMeta.length > 490) metadata.items_overflow = "1";
  // Only logged when body.user_id differs from JWT — aids debugging.
  if (traceUserId !== authUserId) metadata.client_user_id = traceUserId;

  // ── Idempotency key (unique per payment ATTEMPT) ───────────────────────────
  // A key derived from the cart (user+business+total+items) is deterministic, so a
  // customer repeating an identical order reuses it with different params (e.g. a new
  // table_label) → Stripe 400. The client sends a fresh key per attempt; we namespace
  // it with the JWT-verified user so one client can't collide with another's key.
  const rawKey = typeof body.idempotency_key === "string" ? body.idempotency_key.trim() : "";
  const safeKey = /^[A-Za-z0-9_-]{8,64}$/.test(rawKey) ? rawKey : null;
  const idempotencyKey = `pi:${authUserId}:${safeKey ?? crypto.randomUUID()}`;

  // ── Create PaymentIntent ───────────────────────────────────────────────────
  const ephemeralKey = await stripe.ephemeralKeys.create(
    { customer: customerId },
    { apiVersion: "2024-06-20" },
  );

  const piParams: Stripe.PaymentIntentCreateParams = {
    amount: serverTotalCents, // server-calculated; client total_cents is ignored
    currency: "usd",
    customer: customerId,
    automatic_payment_methods: { enabled: true },
    metadata,
  };

  if (stripeAccountId) {
    const platformFeePercent = parseFloat(Deno.env.get("PLATFORM_FEE_PERCENT") ?? "2.9");
    const platformFeeFixed = parseInt(Deno.env.get("PLATFORM_FEE_FIXED_CENTS") ?? "30", 10);
    // Platform fee based on server total, not client total.
    const platformFeeCents = Math.round((serverTotalCents * platformFeePercent) / 100) + platformFeeFixed;
    piParams.application_fee_amount = platformFeeCents;
    piParams.transfer_data = { destination: stripeAccountId };
    piParams.on_behalf_of = stripeAccountId;
  }

  const paymentIntent = await stripe.paymentIntents.create(piParams, { idempotencyKey });
  const publishableKey = Deno.env.get("EXPO_PUBLIC_STRIPE_PK") ?? "";

  // serverTotalCents + breakdown are returned for future UX reconciliation.
  // The client currently ignores these fields; a follow-up can use them to
  // update the checkout screen if the server total differs from the client estimate.
  return jsonResponse({
    clientSecret:   paymentIntent.client_secret,
    ephemeralKey:   ephemeralKey.secret,
    customer:       customerId,
    publishableKey,
    serverTotalCents,
    serverBreakdown: {
      subtotalCents:  serverSubtotalCents,
      taxCents:       serverTaxCents,
      tipCents:       clientTipCents,
      discountCents:  serverDiscountCents,
    },
  });
}

// FIX #7: operates on the JWT-verified caller (authUserId); body.user_id is ignored.
async function handleCreateSetupIntent(authUserId: string): Promise<Response> {
  const db = getAdminClient();
  const stripe = getStripe();
  const { data: user, error: userErr } = await db.from("users").select("id, display_name, stripe_customer_id").eq("id", authUserId).maybeSingle();
  if (userErr) return errorResponse(`DB error: ${userErr.message}`, 500);
  if (!user) return errorResponse("User not found", 404);
  let customerId = user.stripe_customer_id as string | null;
  if (!customerId) {
    const customer = await stripe.customers.create({ email: await userEmail(db, authUserId), name: user.display_name ?? undefined, metadata: { supabase_user_id: authUserId } });
    customerId = customer.id;
    await db.from("users").update({ stripe_customer_id: customerId }).eq("id", authUserId);
  }
  const setupIntent = await stripe.setupIntents.create({ customer: customerId, automatic_payment_methods: { enabled: true }, metadata: { supabase_user_id: authUserId } });
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

  // ── JWT verification (P0-3 / FIX #7) ──────────────────────────────────────
  // ALL three actions operate on the authenticated caller's own identity.
  // verifyCaller validates the token; authUserId is the only trusted user id.
  // body.user_id is never used for auth or DB lookups (was an IDOR on the
  // Stripe customer in ensure_customer / create_setup_intent before this fix).
  const auth = await verifyCaller(req);
  if (auth instanceof Response) return auth;
  const authUserId = auth.authUserId;

  try {
    switch (action) {
      case "ensure_customer":       return await handleEnsureCustomer(authUserId);
      case "create_payment_intent": return await handleCreatePaymentIntent(body, authUserId);
      case "create_setup_intent":   return await handleCreateSetupIntent(authUserId);
      default: return errorResponse(`Unknown action: ${action ?? "(none)"}`);
    }
  } catch (err) {
    console.error(`[payments] error in action "${action}":`, err);
    return errorResponse("Internal server error", 500);
  }
});
