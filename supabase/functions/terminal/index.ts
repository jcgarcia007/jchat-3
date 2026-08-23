/**
 * JChat 3.0 — Terminal Edge Function
 * Stripe Terminal in-person payments for the employee POS (direct charges model).
 *
 * Actions dispatched via { action: string } in the JSON body.
 *
 * ── Employee/POS actions (require valid JWT + pos_can_access) ────────────────
 *   connection_token         { business_id }  → { secret }
 *   get_or_create_location   { business_id }  → { location_id }
 *   create_payment_intent    { order_id }     → { client_secret, payment_intent_id }
 *   mark_paid                { order_id }     → { ok: boolean, status?: string }
 *   create_tab_payment_intent{ business_id, table_id }
 *                                             → { client_secret, payment_intent_id, payment_id, amount_cents }
 *   mark_tab_paid            { payment_id }   → { ok: boolean, tab_closed?: boolean, status?: string }
 *   charge_split_check       { payment_id, tip_cents? }
 *                                             → { client_secret, payment_intent_id, payment_id,
 *                                                 base_cents, tip_cents, total_cents, amount_cents }
 *
 * ── Owner-only actions (require valid JWT + owner_id === authUserId) ─────────
 *   list_readers     { business_id }                           → { ok, readers[] }
 *   register_reader  { business_id, registration_code, label } → { ok, reader }
 *   update_reader    { business_id, reader_id, label }         → { ok, reader }
 *   remove_reader    { business_id, reader_id }                → { ok, id }
 *
 * ── Security invariants ──────────────────────────────────────────────────────
 *   • POS actions: pos_can_access(p_business_id) via JWT (auth.uid() is server-side).
 *   • Owner actions: businesses.owner_id === authUserId (requireOwnerAccount helper).
 *   • Amounts are read from orders.total_cents (service role); never from the client.
 *   • Direct charges model: every Stripe API call carries { stripeAccount }.
 *     NO on_behalf_of, NO transfer_data, NO application_fee.
 *   • mark_paid retrieves the PaymentIntent directly from Stripe to confirm
 *     pi.status === 'succeeded' — it never trusts the client's claim.
 *   • update_reader / remove_reader: reader is retrieved first from the connected
 *     account to confirm ownership before any mutation.
 *
 * ── Required env vars ────────────────────────────────────────────────────────
 *   STRIPE_SECRET_KEY         — platform secret key (sk_live_… or sk_test_…)
 *   SUPABASE_URL              — auto-injected
 *   SUPABASE_SERVICE_ROLE_KEY — set in Edge Function secrets
 *   SUPABASE_ANON_KEY         — for JWT verification (same as other functions)
 *
 * Deploy (after audit):
 *   supabase functions deploy terminal
 */

// ── Imports ───────────────────────────────────────────────────────────────────

import Stripe from "npm:stripe@16.2.0";
import {
  createClient,
  type SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2.44.4";

// ── Supabase clients ──────────────────────────────────────────────────────────

/** Admin (service role) client — bypasses RLS for server-side reads/writes. */
function getAdminClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

/** User-scoped client — preserves auth.uid() for RPC pos_can_access. */
function getUserClient(authHeader: string): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY");
  return createClient(url, key, {
    global: { headers: { Authorization: authHeader } },
  });
}

// ── Stripe client (platform key) ─────────────────────────────────────────────

function getStripe(): Stripe {
  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!key) throw new Error("Missing STRIPE_SECRET_KEY");
  return new Stripe(key, { apiVersion: "2024-06-20" });
}

// ── CORS + response helpers ───────────────────────────────────────────────────

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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

// ── Credential redaction (used in register_reader error details) ──────────────

function redactCreds(text: string): string {
  return text
    .replace(/Bearer [^"'\s,\]}\n]+/g, "Bearer REDACTED")
    .replace(/key=[^&"'\s,\]}\n]+/g, "key=REDACTED");
}

// ── Auth helpers ──────────────────────────────────────────────────────────────

interface CallerInfo {
  authUserId: string;
  userClient: SupabaseClient;
}

/**
 * Verify the caller's JWT. Returns CallerInfo or a 401 Response.
 * Same pattern as subscriptions/index.ts (verify_jwt = false, manual check).
 */
async function verifyCaller(
  req: Request,
): Promise<CallerInfo | Response> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return errorResponse("Missing or invalid Authorization header", 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) {
    console.error("[terminal] SUPABASE_URL or SUPABASE_ANON_KEY not set");
    return errorResponse("Internal server error", 500);
  }

  const userClient = getUserClient(authHeader);
  const {
    data: { user },
    error: authError,
  } = await userClient.auth.getUser();

  if (authError || !user) return errorResponse("Unauthorized", 401);
  return { authUserId: user.id, userClient };
}

/**
 * Verify POS access using the CALLER's auth context (auth.uid() set by JWT).
 * Calls the pos_can_access(p_business_id) RPC which reads from the employee
 * record server-side — the caller never supplies their own user id.
 * Returns null on success, or a 403/500 Response on failure.
 */
async function checkPosAccess(
  userClient: SupabaseClient,
  businessId: string,
): Promise<Response | null> {
  const { data, error } = await userClient.rpc("pos_can_access", {
    p_business_id: businessId,
  });
  if (error) {
    console.error("[terminal] pos_can_access error:", error.message);
    return errorResponse("POS access check failed", 500);
  }
  if (data !== true) {
    return errorResponse("Forbidden: no POS access for this business", 403);
  }
  return null;
}

// ── Shared: resolve stripe_account_id for a business ─────────────────────────

async function getStripeAccount(
  db: SupabaseClient,
  businessId: string,
): Promise<{ stripeAccount: string } | Response> {
  const { data, error } = await db
    .from("businesses")
    .select("stripe_account_id")
    .eq("id", businessId)
    .maybeSingle();
  if (error) {
    console.error("[terminal] businesses lookup error:", error.message);
    return errorResponse("Internal server error", 500);
  }
  const stripeAccount =
    (data as { stripe_account_id: string | null } | null)?.stripe_account_id ?? null;
  if (!stripeAccount) {
    return errorResponse("Business has no connected Stripe account", 422);
  }
  return { stripeAccount };
}

// ── Owner gate: verify caller is the business owner + return stripeAccount ────
//
// Used by the reader-management actions (list/register/update/remove).
// Only the business owner may manage readers; employees and platform admins
// are intentionally excluded from this gate.
//
// Returns { stripeAccount } on success, or a 403/404/422/500 Response on failure.

async function requireOwnerAccount(
  businessId: string,
  authUserId: string,
): Promise<{ stripeAccount: string } | Response> {
  const db = getAdminClient();
  const { data: biz, error } = await db
    .from("businesses")
    .select("owner_id, stripe_account_id")
    .eq("id", businessId)
    .maybeSingle();
  if (error) {
    console.error("[terminal] requireOwnerAccount db error:", error.message);
    return errorResponse("Internal server error", 500);
  }
  if (!biz) return errorResponse("Business not found", 404);
  const b = biz as { owner_id: string | null; stripe_account_id: string | null };
  if (b.owner_id !== authUserId) {
    return errorResponse("Forbidden: only the business owner can manage readers", 403);
  }
  if (!b.stripe_account_id) {
    return errorResponse("Business has no connected Stripe account", 422);
  }
  return { stripeAccount: b.stripe_account_id };
}

// ── Shared: resolve (or lazily create) the Terminal Location for a business ───
//
// Lists existing locations on the connected account (limit 1) — reuses the
// first one found to avoid duplicates. Creates one if none exist.
// Same logic as handleGetOrCreateLocation but returns the id directly (not a
// full Response) so that register_reader can consume it without nested awaits.
//
// Returns location id string, or a Response on Stripe error.

async function resolveLocationId(
  db: SupabaseClient,
  stripe: Stripe,
  businessId: string,
  stripeAccount: string,
): Promise<string | Response> {
  const { data: bizData } = await db
    .from("businesses")
    .select("name, country")
    .eq("id", businessId)
    .maybeSingle();
  const biz = bizData as { name?: string | null; country?: string | null } | null;
  const displayName = (biz?.name ?? "JChat POS").trim() || "JChat POS";
  const country = (biz?.country ?? "US").toUpperCase().slice(0, 2) || "US";

  try {
    const list = await stripe.terminal.locations.list(
      { limit: 1 },
      { stripeAccount },
    );
    if (list.data.length > 0) {
      console.log(
        `[terminal] resolveLocationId: reusing location=${list.data[0].id} business=${businessId}`,
      );
      return list.data[0].id;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Stripe error";
    console.error("[terminal] locations.list error (resolveLocationId):", msg);
    return errorResponse(msg, 502);
  }

  try {
    const location = await stripe.terminal.locations.create(
      {
        display_name: displayName,
        address: {
          country,
          line1: "1 Main St",
          city: "San Francisco",
          state: "CA",
          postal_code: "94105",
        },
      },
      { stripeAccount },
    );
    console.log(
      `[terminal] resolveLocationId: created location=${location.id} business=${businessId} country=${country}`,
    );
    return location.id;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Stripe error";
    console.error("[terminal] locations.create error (resolveLocationId):", msg);
    return errorResponse(msg, 502);
  }
}

// ── Action: get_or_create_location ───────────────────────────────────────────
//
// Returns a Terminal Location id on the connected Stripe account.
// Lists first (limit=1) to avoid duplicates; creates one if none exist.
// The locationId is REQUIRED by ConnectBluetoothReaderParams — must be fetched
// server-side because we never expose the platform Stripe secret to the client.
//
// Location address is a placeholder; the business owner can update it via the
// Stripe dashboard once the Terminal integration is live. country is read from
// businesses.country so the correct EMV config is applied to the M2 reader.

async function handleGetOrCreateLocation(
  body: Record<string, unknown>,
  userClient: SupabaseClient,
): Promise<Response> {
  const businessId = typeof body.business_id === "string" ? body.business_id : null;
  if (!businessId) return errorResponse("business_id is required");

  // 1. Verify POS access (auth.uid() from JWT, never from body).
  const accessErr = await checkPosAccess(userClient, businessId);
  if (accessErr) return accessErr;

  const db = getAdminClient();

  // 2. Get the connected Stripe account + business metadata.
  const accountResult = await getStripeAccount(db, businessId);
  if (accountResult instanceof Response) return accountResult;
  const { stripeAccount } = accountResult;

  // 3. Fetch business name + country for the location display_name/address.
  const { data: bizData } = await db
    .from("businesses")
    .select("name, country")
    .eq("id", businessId)
    .maybeSingle();
  const biz = bizData as { name?: string | null; country?: string | null } | null;
  const displayName = (biz?.name ?? "JChat POS").trim() || "JChat POS";
  // country must be a 2-letter ISO code; fall back to "US" if unknown.
  const country = (biz?.country ?? "US").toUpperCase().slice(0, 2) || "US";

  const stripe = getStripe();

  // 4. List existing Terminal Locations on the connected account (limit 1).
  //    This prevents duplicate locations on every session start.
  let locationId: string | null = null;
  try {
    const list = await stripe.terminal.locations.list(
      { limit: 1 },
      { stripeAccount },
    );
    if (list.data.length > 0) {
      locationId = list.data[0].id;
      console.log(
        `[terminal] get_or_create_location: reusing existing location=${locationId} for business=${businessId}`,
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Stripe error";
    console.error("[terminal] locations.list error:", msg);
    return errorResponse(msg, 502);
  }

  // 5. Create a new location if none exist on this connected account.
  //    The address is a placeholder — business owner updates it via Stripe dashboard.
  //    For non-US countries the address fields may need adjustment; Stripe validates
  //    them in live mode but is lenient in test mode.
  if (!locationId) {
    try {
      const location = await stripe.terminal.locations.create(
        {
          display_name: displayName,
          address: {
            country,
            // Placeholder US address — valid for test mode.
            // For production the business owner should update via Stripe dashboard.
            line1: "1 Main St",
            city: "San Francisco",
            state: "CA",
            postal_code: "94105",
          },
        },
        { stripeAccount },
      );
      locationId = location.id;
      console.log(
        `[terminal] get_or_create_location: created location=${locationId} for business=${businessId} country=${country}`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Stripe error";
      console.error("[terminal] locations.create error:", msg);
      return errorResponse(msg, 502);
    }
  }

  return jsonResponse({ location_id: locationId });
}

// ── Action: connection_token ──────────────────────────────────────────────────

async function handleConnectionToken(
  body: Record<string, unknown>,
  userClient: SupabaseClient,
): Promise<Response> {
  const businessId = typeof body.business_id === "string" ? body.business_id : null;
  if (!businessId) return errorResponse("business_id is required");

  // 1. Verify POS access (auth.uid() from JWT, not from body).
  const accessErr = await checkPosAccess(userClient, businessId);
  if (accessErr) return accessErr;

  const db = getAdminClient();

  // 2. Get the business's connected account id (service role).
  const accountResult = await getStripeAccount(db, businessId);
  if (accountResult instanceof Response) return accountResult;
  const { stripeAccount } = accountResult;

  // 3. Create a ConnectionToken on the connected account (direct charges).
  //    The secret is returned to the SDK on the device — it authenticates the reader.
  const stripe = getStripe();
  let token: Stripe.Terminal.ConnectionToken;
  try {
    token = await stripe.terminal.connectionTokens.create({}, { stripeAccount });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Stripe error";
    console.error("[terminal] connectionTokens.create error:", msg);
    return errorResponse(msg, 502);
  }

  console.log(`[terminal] connection_token issued for business=${businessId}`);
  return jsonResponse({ secret: token.secret });
}

// ── Action: create_payment_intent ─────────────────────────────────────────────

async function handleCreatePaymentIntent(
  body: Record<string, unknown>,
  userClient: SupabaseClient,
): Promise<Response> {
  const orderId = typeof body.order_id === "string" ? body.order_id : null;
  if (!orderId) return errorResponse("order_id is required");

  const db = getAdminClient();

  // 1. Load the order server-side. The amount comes from HERE — never from the client.
  const { data: orderData, error: orderErr } = await db
    .from("orders")
    .select("id, business_id, total_cents, paid_at, stripe_pi_id")
    .eq("id", orderId)
    .maybeSingle();

  if (orderErr) {
    console.error("[terminal] orders lookup error:", orderErr.message);
    return errorResponse("Internal server error", 500);
  }

  const order = orderData as {
    id: string;
    business_id: string;
    total_cents: number;
    paid_at: string | null;
    stripe_pi_id: string | null;
  } | null;

  if (!order) return errorResponse("Order not found", 404);

  // 2. Verify POS access for the business that owns this order.
  const accessErr = await checkPosAccess(userClient, order.business_id);
  if (accessErr) return accessErr;

  // 3. Guard: already paid.
  if (order.paid_at !== null) {
    return errorResponse("Order is already paid", 409);
  }

  // 4. Guard: amount must be positive. Server-side only — client figure ignored.
  if (order.total_cents <= 0) {
    return errorResponse("Order total must be greater than zero", 422);
  }

  // 5. Resolve the connected account.
  const accountResult = await getStripeAccount(db, order.business_id);
  if (accountResult instanceof Response) return accountResult;
  const { stripeAccount } = accountResult;

  // 6. Create the PaymentIntent on the connected account (direct charges model).
  //    No on_behalf_of, no transfer_data, no application_fee.
  const stripe = getStripe();
  let pi: Stripe.PaymentIntent;
  try {
    pi = await stripe.paymentIntents.create(
      {
        amount: order.total_cents,       // server-owned amount — never from client body
        currency: "usd",
        payment_method_types: ["card_present"],
        capture_method: "automatic",
        metadata: { order_id: orderId },
      },
      { stripeAccount },                 // direct charges: charge lands on connected account
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Stripe error";
    console.error("[terminal] paymentIntents.create error:", msg);
    return errorResponse(msg, 502);
  }

  // 7. Persist the PaymentIntent id so mark_paid can retrieve it later.
  const { error: updateErr } = await db
    .from("orders")
    .update({ stripe_pi_id: pi.id })
    .eq("id", orderId);
  if (updateErr) {
    // Non-fatal: the PI was created. Surface the id in the response so nothing is lost.
    console.error("[terminal] failed to save stripe_pi_id:", updateErr.message);
  }

  if (!pi.client_secret) {
    return errorResponse("PaymentIntent has no client_secret", 500);
  }

  console.log(
    `[terminal] create_payment_intent: order=${orderId} pi=${pi.id} amount=${order.total_cents}`,
  );
  return jsonResponse({
    client_secret: pi.client_secret,
    payment_intent_id: pi.id,
  });
}

// ── Action: mark_paid ─────────────────────────────────────────────────────────

async function handleMarkPaid(
  body: Record<string, unknown>,
  userClient: SupabaseClient,
): Promise<Response> {
  const orderId = typeof body.order_id === "string" ? body.order_id : null;
  if (!orderId) return errorResponse("order_id is required");

  const db = getAdminClient();

  // 1. Load the order (service role).
  const { data: orderData, error: orderErr } = await db
    .from("orders")
    .select("id, business_id, stripe_pi_id")
    .eq("id", orderId)
    .maybeSingle();

  if (orderErr) {
    console.error("[terminal] orders lookup error:", orderErr.message);
    return errorResponse("Internal server error", 500);
  }

  const order = orderData as {
    id: string;
    business_id: string;
    stripe_pi_id: string | null;
  } | null;

  if (!order) return errorResponse("Order not found", 404);

  // 2. Verify POS access.
  const accessErr = await checkPosAccess(userClient, order.business_id);
  if (accessErr) return accessErr;

  // 3. Must have a PaymentIntent id on record.
  if (!order.stripe_pi_id) {
    return errorResponse("No payment intent recorded for this order", 422);
  }

  // 4. Resolve the connected account.
  const accountResult = await getStripeAccount(db, order.business_id);
  if (accountResult instanceof Response) return accountResult;
  const { stripeAccount } = accountResult;

  // 5. Retrieve the PaymentIntent DIRECTLY from Stripe — never trust the client's
  //    claim that the payment succeeded. Only pi.status === 'succeeded' is definitive.
  const stripe = getStripe();
  let pi: Stripe.PaymentIntent;
  try {
    pi = await stripe.paymentIntents.retrieve(
      order.stripe_pi_id,
      undefined,
      { stripeAccount },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Stripe error";
    console.error("[terminal] paymentIntents.retrieve error:", msg);
    return errorResponse(msg, 502);
  }

  console.log(
    `[terminal] mark_paid: order=${orderId} pi=${pi.id} status=${pi.status}`,
  );

  // 6. Mark the order paid only when Stripe confirms success.
  //    .is("paid_at", null) makes the DB update idempotent.
  if (pi.status === "succeeded") {
    const { error: updateErr } = await db
      .from("orders")
      .update({ paid_at: new Date().toISOString() })
      .eq("id", orderId)
      .is("paid_at", null);
    if (updateErr) {
      console.error("[terminal] failed to mark order paid:", updateErr.message);
      return errorResponse("Failed to mark order as paid", 500);
    }
    return jsonResponse({ ok: true });
  }

  return jsonResponse({ ok: false, status: pi.status });
}

// ── Action: create_tab_payment_intent ────────────────────────────────────────
//
// Creates a single PaymentIntent for the full open tab of a table.
// Base amount is computed server-side via pos_tab_total — the client body is
// never trusted for monetary values.
//
// Optional tip_cents (integer ≥ 0, ≤ tab base): the PaymentIntent is created
// with amount = base + tip. pos_payments.amount_cents stores the base only so
// that mark_tab_paid can derive tip = pi.amount − base correctly.
//
// Response: { base_cents, tip_cents, total_cents, amount_cents (= total, compat) }

async function handleCreateTabPaymentIntent(
  body: Record<string, unknown>,
  userClient: SupabaseClient,
): Promise<Response> {
  const businessId = typeof body.business_id === "string" ? body.business_id : null;
  const tableId = typeof body.table_id === "string" ? body.table_id : null;
  if (!businessId) return errorResponse("business_id is required");
  if (!tableId) return errorResponse("table_id is required");

  // 1. Verify POS access (auth.uid() from JWT, never from body).
  const accessErr = await checkPosAccess(userClient, businessId);
  if (accessErr) return accessErr;

  const db = getAdminClient();

  // 2. Compute tab total server-side — base amount never comes from the client.
  const { data: tabTotalData, error: tabErr } = await db.rpc("pos_tab_total", {
    p_business_id: businessId,
    p_table_id: tableId,
  });
  if (tabErr) {
    console.error("[terminal] pos_tab_total error:", tabErr.message);
    return errorResponse("Internal server error", 500);
  }
  const baseCents = typeof tabTotalData === "number" ? tabTotalData : 0;
  if (baseCents <= 0) {
    return errorResponse("Nothing to charge: tab total is zero", 409);
  }

  // 3. Parse and validate optional tip_cents.
  //    tip_cents is sent by the client ONLY as a positive selection (15%/18%/20%/custom).
  //    We cap it at the base (100% tip limit) as a sanity guard.
  //    The tip does NOT affect pos_payments.amount_cents — that stays at base so
  //    mark_tab_paid can derive tipCents = pi.amount − base.
  const tipCentsRaw = body.tip_cents;
  let tipCents = 0;
  if (tipCentsRaw !== undefined && tipCentsRaw !== null) {
    if (
      typeof tipCentsRaw !== "number" ||
      !Number.isInteger(tipCentsRaw) ||
      tipCentsRaw < 0
    ) {
      return errorResponse("tip_cents must be a non-negative integer", 422);
    }
    if (tipCentsRaw > baseCents) {
      return errorResponse(
        `tip_cents (${tipCentsRaw}) cannot exceed the tab total (${baseCents})`,
        422,
      );
    }
    tipCents = tipCentsRaw;
  }
  const totalCents = baseCents + tipCents;

  // 4. Resolve the connected Stripe account.
  const accountResult = await getStripeAccount(db, businessId);
  if (accountResult instanceof Response) return accountResult;
  const { stripeAccount } = accountResult;

  // 5. Create the PaymentIntent with the full amount (base + tip).
  //    No on_behalf_of, no transfer_data, no application_fee.
  const stripe = getStripe();
  let pi: Stripe.PaymentIntent;
  try {
    pi = await stripe.paymentIntents.create(
      {
        amount: totalCents,                 // server-owned total (base + tip)
        currency: "usd",
        payment_method_types: ["card_present"],
        capture_method: "automatic",
        metadata: { table_id: tableId, kind: "full", tip_cents: String(tipCents) },
      },
      { stripeAccount },                   // direct charges: charge lands on connected account
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Stripe error";
    console.error("[terminal] paymentIntents.create (tab) error:", msg);
    return errorResponse(msg, 502);
  }

  if (!pi.client_secret) {
    return errorResponse("PaymentIntent has no client_secret", 500);
  }

  // 6. Record the pending payment in pos_payments with amount_cents = BASE only.
  //    tip is implicit: mark_tab_paid reads pi.amount from Stripe and derives
  //    tip = pi.amount − pos_payments.amount_cents automatically.
  const { data: insertData, error: insertErr } = await db
    .from("pos_payments")
    .insert({
      business_id: businessId,
      table_id: tableId,
      amount_cents: baseCents,            // base only — tip is NOT stored here
      kind: "full",
      stripe_pi_id: pi.id,
      status: "pending",
    })
    .select("id")
    .single();

  if (insertErr || !insertData) {
    // PI was created — log but don't block. Operator can reconcile via Stripe dashboard.
    console.error(
      "[terminal] pos_payments insert error:",
      insertErr?.message ?? "no data returned",
    );
    return jsonResponse({
      client_secret: pi.client_secret,
      payment_intent_id: pi.id,
      payment_id: null,
      base_cents: baseCents,
      tip_cents: tipCents,
      total_cents: totalCents,
      amount_cents: totalCents,           // compat alias (= total)
    });
  }

  const paymentId = (insertData as { id: string }).id;

  console.log(
    `[terminal] create_tab_payment_intent: business=${businessId} table=${tableId}` +
    ` pi=${pi.id} base=${baseCents} tip=${tipCents} total=${totalCents} payment_id=${paymentId}`,
  );
  return jsonResponse({
    client_secret: pi.client_secret,
    payment_intent_id: pi.id,
    payment_id: paymentId,
    base_cents: baseCents,
    tip_cents: tipCents,
    total_cents: totalCents,
    amount_cents: totalCents,             // compat alias (= total)
  });
}

// ── Action: mark_tab_paid ─────────────────────────────────────────────────────
//
// Confirms tab payment by retrieving the PI directly from Stripe (never trusting
// the client). On success, delegates all DB marking to pos_apply_payment RPC
// (SECURITY DEFINER, not client-accessible), which marks the payment succeeded,
// covers order_items, closes fully-covered orders, and returns tab_closed.

async function handleMarkTabPaid(
  body: Record<string, unknown>,
  userClient: SupabaseClient,
): Promise<Response> {
  const paymentId = typeof body.payment_id === "string" ? body.payment_id : null;
  if (!paymentId) return errorResponse("payment_id is required");

  const db = getAdminClient();

  // 1. Load the pos_payments row by payment_id (admin — bypasses RLS).
  const { data: paymentData, error: paymentErr } = await db
    .from("pos_payments")
    .select("id, business_id, table_id, amount_cents, stripe_pi_id, status, receipt_code")
    .eq("id", paymentId)
    .maybeSingle();

  if (paymentErr) {
    console.error("[terminal] pos_payments lookup error:", paymentErr.message);
    return errorResponse("Internal server error", 500);
  }

  const payment = paymentData as {
    id: string;
    business_id: string;
    table_id: string;
    amount_cents: number;
    stripe_pi_id: string | null;
    status: string;
    receipt_code: string | null;
  } | null;

  if (!payment) return errorResponse("Payment record not found", 404);

  // 2. Verify POS access for the business that owns this payment.
  const accessErr = await checkPosAccess(userClient, payment.business_id);
  if (accessErr) return accessErr;

  // 3. Must have a Stripe PaymentIntent id on record (set during create).
  if (!payment.stripe_pi_id) {
    return errorResponse("No payment intent recorded for this payment", 422);
  }

  // 4. Resolve the connected Stripe account.
  const accountResult = await getStripeAccount(db, payment.business_id);
  if (accountResult instanceof Response) return accountResult;
  const { stripeAccount } = accountResult;

  // 5. Retrieve the PI directly from Stripe — NEVER trust the client's success claim.
  const stripe = getStripe();
  let pi: Stripe.PaymentIntent;
  try {
    pi = await stripe.paymentIntents.retrieve(
      payment.stripe_pi_id,
      { expand: ["charges.data.payment_method_details"] },
      { stripeAccount },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Stripe error";
    console.error("[terminal] paymentIntents.retrieve (tab) error:", msg);
    return errorResponse(msg, 502);
  }

  console.log(
    `[terminal] mark_tab_paid: payment=${paymentId} pi=${pi.id} status=${pi.status}`,
  );

  if (pi.status !== "succeeded") {
    return jsonResponse({ ok: false, status: pi.status });
  }

  // 6. Payment confirmed by Stripe. Compute tip and delegate all DB marking
  //    to pos_apply_payment (SECURITY DEFINER — not exposed to clients).
  //    The RPC atomically marks pos_payments succeeded, covers order_items,
  //    closes orders whose items are fully paid, and returns tab_closed.
  const tipCents = Math.max(0, pi.amount - payment.amount_cents);

  const { data: rpcData, error: rpcErr } = await db.rpc("pos_apply_payment", {
    p_payment_id: paymentId,
    p_tip_cents: tipCents,
  });

  if (rpcErr) {
    console.error("[terminal] pos_apply_payment error:", rpcErr.message);
    return errorResponse("Failed to apply payment", 500);
  }

  const tabClosed = rpcData === true;

  console.log(
    `[terminal] mark_tab_paid: applied payment=${paymentId} tip=${tipCents} tab_closed=${tabClosed}`,
  );

  // 7. Inject receipt_code + card details (non-fatal — never abort the payment).
  let receiptCode: string | null = null;
  if (!payment.receipt_code) {
    try {
      // Generate a 22-char URL-safe base64 code from 16 random bytes.
      const raw = new Uint8Array(16);
      crypto.getRandomValues(raw);
      const code = btoa(String.fromCharCode(...raw))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=/g, "");

      // Extract card details from the expanded PI.
      const charge =
        (pi as any).charges?.data?.[0] ?? null;
      const pmd = charge?.payment_method_details ?? null;
      // card_present first (M2 reader), card as fallback (other payment methods)
      const cardInfo = pmd?.card_present ?? pmd?.card ?? null;
      const cardBrand: string | null = cardInfo?.brand ?? null;
      const cardLast4: string | null = cardInfo?.last4 ?? null;

      const { error: rcErr } = await db
        .from("pos_payments")
        .update({ receipt_code: code, card_brand: cardBrand, card_last4: cardLast4 })
        .eq("id", paymentId)
        .is("receipt_code", null); // idempotency guard

      if (rcErr) {
        console.error("[terminal] receipt_code update error:", rcErr.message);
      } else {
        receiptCode = code;
      }
    } catch (err) {
      console.error(
        "[terminal] receipt injection failed (non-fatal):",
        err instanceof Error ? err.message : String(err),
      );
    }
  } else {
    receiptCode = payment.receipt_code;
  }

  return jsonResponse({ ok: true, tab_closed: tabClosed, receipt_code: receiptCode });
}

// ── Action: charge_split_check ────────────────────────────────────────────────
//
// Creates a Stripe PaymentIntent for one already-created split-payment row in
// pos_payments (e.g. inserted by the pos_create_split RPC). The base amount is
// read exclusively from pos_payments.amount_cents — the client body never
// supplies or influences the base monetary value.
//
// Optional tip_cents: integer ≥ 0, capped at pos_payments.amount_cents (100 %).
// PI amount = base + tip_cents. pos_payments.amount_cents is NOT updated — the
// tip is stored only in the PI's metadata so mark_tab_paid can derive it as
// pi.amount − base.
//
// Returns: { client_secret, payment_intent_id, payment_id,
//            base_cents, tip_cents, total_cents, amount_cents (= total) }
//
// The caller must later call mark_tab_paid { payment_id } to confirm the charge
// server-side; mark_tab_paid already handles both full and split rows.

async function handleChargeSplitCheck(
  body: Record<string, unknown>,
  userClient: SupabaseClient,
): Promise<Response> {
  const paymentId = typeof body.payment_id === "string" ? body.payment_id : null;
  if (!paymentId) return errorResponse("payment_id is required");

  // Validate tip_cents: optional integer ≥ 0 (cap enforced after base is loaded)
  const rawTip = body.tip_cents;
  const tipCentsRaw =
    typeof rawTip === "number" && Number.isInteger(rawTip) && rawTip >= 0
      ? rawTip
      : 0;

  const db = getAdminClient();

  // 1. Load the pos_payments row by payment_id (admin — bypasses RLS).
  const { data: paymentData, error: paymentErr } = await db
    .from("pos_payments")
    .select("id, business_id, table_id, amount_cents, kind, status, stripe_pi_id")
    .eq("id", paymentId)
    .maybeSingle();

  if (paymentErr) {
    console.error("[terminal] pos_payments lookup error:", paymentErr.message);
    return errorResponse("Internal server error", 500);
  }

  const payment = paymentData as {
    id: string;
    business_id: string;
    table_id: string;
    amount_cents: number;
    kind: string;
    status: string;
    stripe_pi_id: string | null;
  } | null;

  if (!payment) return errorResponse("Payment record not found", 404);

  // 2. Verify POS access for the business that owns this payment record.
  const accessErr = await checkPosAccess(userClient, payment.business_id);
  if (accessErr) return accessErr;

  // 3. Guards — amounts come from the DB row, never from the client.
  if (payment.status !== "pending") {
    return errorResponse("payment not pending", 409);
  }
  if (payment.amount_cents <= 0) {
    return errorResponse("Payment amount must be greater than zero", 422);
  }

  // Cap tip at 100 % of the base (guard against client bugs; sane maximum).
  const tipCents = Math.min(tipCentsRaw, payment.amount_cents);
  const totalCents = payment.amount_cents + tipCents;

  // 4. Resolve the connected Stripe account.
  const accountResult = await getStripeAccount(db, payment.business_id);
  if (accountResult instanceof Response) return accountResult;
  const { stripeAccount } = accountResult;

  // 5. Create the PaymentIntent on the connected account (direct charges model).
  //    No on_behalf_of, no transfer_data, no application_fee.
  //    Base amount is ALWAYS from pos_payments.amount_cents — never from the client body.
  //    tip_cents is validated and added server-side; stored in PI metadata only.
  //    pos_payments.amount_cents is NOT updated — mark_tab_paid derives tip as
  //    pi.amount − base (pi.amount is the source of truth).
  //    Note: calling this twice creates a second PI; the orphan auto-cancels (v1 caveat).
  const stripe = getStripe();
  let pi: Stripe.PaymentIntent;
  try {
    pi = await stripe.paymentIntents.create(
      {
        amount: totalCents,                 // base + tip — server-owned; never from client
        currency: "usd",
        payment_method_types: ["card_present"],
        capture_method: "automatic",
        metadata: {
          payment_id: paymentId,
          table_id: payment.table_id,
          kind: payment.kind,
          base_cents: String(payment.amount_cents),
          tip_cents: String(tipCents),
        },
      },
      { stripeAccount },                   // direct charges: charge lands on connected account
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Stripe error";
    console.error("[terminal] paymentIntents.create (split) error:", msg);
    return errorResponse(msg, 502);
  }

  if (!pi.client_secret) {
    return errorResponse("PaymentIntent has no client_secret", 500);
  }

  // 6. Persist the PaymentIntent id back to the pos_payments row so that
  //    mark_tab_paid can retrieve it from Stripe for confirmation.
  //    pos_payments.amount_cents stays = base (tip derived from pi.amount − base).
  const { error: updateErr } = await db
    .from("pos_payments")
    .update({ stripe_pi_id: pi.id })
    .eq("id", paymentId);

  if (updateErr) {
    // Non-fatal: PI was created. Return PI data so the device can still collect.
    // Operator must reconcile via the Stripe dashboard if mark_tab_paid fails later.
    console.error("[terminal] pos_payments stripe_pi_id update error:", updateErr.message);
  }

  console.log(
    `[terminal] charge_split_check: payment=${paymentId} pi=${pi.id} base=${payment.amount_cents} tip=${tipCents} total=${totalCents} kind=${payment.kind}`,
  );
  return jsonResponse({
    client_secret: pi.client_secret,
    payment_intent_id: pi.id,
    payment_id: paymentId,
    base_cents: payment.amount_cents,
    tip_cents: tipCents,
    total_cents: totalCents,
    amount_cents: totalCents,             // compat alias for callers using amountCents
  });
}

// ── Action: list_readers (owner only) ────────────────────────────────────────
//
// Lists all Terminal readers registered on the business's connected Stripe account.
// Bluetooth readers (M2, WisePad 3) appear here only if they were registered via
// the API; in practice they are paired at transaction time by the SDK and may not
// appear in this list — the UI should note this.
//
// Body: { business_id }
// Response: { ok: true, readers: ReaderSummary[] }

async function handleListReaders(
  body: Record<string, unknown>,
  authUserId: string,
): Promise<Response> {
  const businessId = typeof body.business_id === "string" ? body.business_id : null;
  if (!businessId) return errorResponse("business_id is required");

  const ownerResult = await requireOwnerAccount(businessId, authUserId);
  if (ownerResult instanceof Response) return ownerResult;
  const { stripeAccount } = ownerResult;

  const stripe = getStripe();
  try {
    const readers = await stripe.terminal.readers.list(
      { limit: 100 },
      { stripeAccount },
    );
    console.log(
      `[terminal] list_readers: business=${businessId} count=${readers.data.length}`,
    );
    return jsonResponse({
      ok: true,
      readers: readers.data.map((r) => ({
        id: r.id,
        label: r.label,
        device_type: r.device_type,  // e.g. 'bbpos_wisepos_e' | 'stripe_s700' | 'stripe_m2' …
        status: r.status,            // 'online' | 'offline' | null
        serial_number: r.serial_number,
        location: typeof r.location === "string" ? r.location : r.location?.id ?? null,
      })),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Stripe error";
    console.error("[terminal] readers.list error:", msg);
    return errorResponse(msg, 502);
  }
}

// ── Action: register_reader (owner only) ─────────────────────────────────────
//
// Registers a smart reader (WisePOS E, S700, S710, T600, Verifone) on the
// business's connected Stripe account via a registration code (3-word pairing
// code shown on the reader's screen, e.g. "sepia-cerulean-orca").
//
// Bluetooth readers (M2, WisePad 3) are NOT registered via API — they pair at
// transaction time. This action will fail for those device types.
//
// Body: { business_id, registration_code, label? }
// Response: { ok: true, reader } on success
//           { ok: false, error: "register_failed", detail } on Stripe error
//             (detail is redacted — no keys or tokens)

async function handleRegisterReader(
  body: Record<string, unknown>,
  authUserId: string,
): Promise<Response> {
  const businessId = typeof body.business_id === "string" ? body.business_id : null;
  if (!businessId) return errorResponse("business_id is required");

  const ownerResult = await requireOwnerAccount(businessId, authUserId);
  if (ownerResult instanceof Response) return ownerResult;
  const { stripeAccount } = ownerResult;

  // Validate the registration code: Stripe issues 3-word hyphen-separated codes,
  // e.g. "sepia-cerulean-orca". Test mode uses "simulated-wpe".
  // Pattern: 2–4 lowercase alpha words joined by hyphens.
  const code = (typeof body.registration_code === "string"
    ? body.registration_code
    : ""
  ).trim().toLowerCase();
  if (!code || !/^[a-z]+(-[a-z]+){1,3}$/.test(code)) {
    return errorResponse("registration_code is missing or has an invalid format", 400);
  }

  // Label: free text, max 60 chars, falls back to "Lector" if empty.
  const label = (typeof body.label === "string" ? body.label : "")
    .trim()
    .slice(0, 60) || "Lector";

  const db = getAdminClient();
  const stripe = getStripe();

  // Resolve (or lazily create) the Terminal Location for this business.
  const locationResult = await resolveLocationId(db, stripe, businessId, stripeAccount);
  if (locationResult instanceof Response) return locationResult;
  const locationId = locationResult;

  try {
    const reader = await stripe.terminal.readers.create(
      { registration_code: code, label, location: locationId },
      { stripeAccount },
    );
    console.log(
      `[terminal] register_reader: business=${businessId} reader=${reader.id}` +
      ` label="${reader.label}" device_type=${reader.device_type}`,
    );
    return jsonResponse({
      ok: true,
      reader: {
        id: reader.id,
        label: reader.label,
        device_type: reader.device_type,
        status: reader.status,
        serial_number: reader.serial_number,
        location: typeof reader.location === "string"
          ? reader.location
          : reader.location?.id ?? null,
      },
    });
  } catch (err) {
    // Surface structured errors the UI can display (invalid/expired code, already
    // registered, offline). Redact to avoid leaking platform credentials.
    const msg = err instanceof Error ? err.message : "Stripe error";
    console.error("[terminal] readers.create error:", msg);
    return jsonResponse(
      {
        ok: false,
        error: "register_failed",
        detail: redactCreds(msg).slice(0, 300),
      },
      400,
    );
  }
}

// ── Action: update_reader (owner only) ────────────────────────────────────────
//
// Renames a Terminal reader that belongs to this business's connected account.
// Retrieves the reader first to confirm it exists on the account (Stripe returns
// 404 for readers that don't belong to the given { stripeAccount }) before
// issuing the update — defence-in-depth ownership check.
//
// Body: { business_id, reader_id, label }
// Response: { ok: true, reader }

async function handleUpdateReader(
  body: Record<string, unknown>,
  authUserId: string,
): Promise<Response> {
  const businessId = typeof body.business_id === "string" ? body.business_id : null;
  const readerId = typeof body.reader_id === "string" ? body.reader_id : null;
  if (!businessId) return errorResponse("business_id is required");
  if (!readerId) return errorResponse("reader_id is required");

  const ownerResult = await requireOwnerAccount(businessId, authUserId);
  if (ownerResult instanceof Response) return ownerResult;
  const { stripeAccount } = ownerResult;

  const label = (typeof body.label === "string" ? body.label : "").trim().slice(0, 60);
  if (!label) return errorResponse("label is required and cannot be empty");

  const stripe = getStripe();

  // Defence: retrieve the reader first to confirm it exists on this account.
  // Stripe returns 404 for readers that don't belong to the connected account.
  // stripe@16 types `retrieve` as Response<Reader|DeletedReader>; cast via unknown
  // to access Reader fields safely — the retrieve always returns a Reader here
  // (DeletedReader only comes from the object notation after deletion).
  try {
    const retrieved = await stripe.terminal.readers.retrieve(
      readerId,
      undefined,
      { stripeAccount },
    );
    if ((retrieved as unknown as { deleted?: boolean }).deleted) {
      return errorResponse("Reader not found or not accessible", 404);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Stripe error";
    console.error("[terminal] readers.retrieve (update check) error:", msg);
    return errorResponse("Reader not found or not accessible", 404);
  }

  // stripe@16 types `update` as Response<Reader|DeletedReader>; update never
  // deletes the reader, so cast to Reader via unknown to access its fields.
  type ReaderLike = {
    id: string;
    label: string;
    device_type: string;
    status: string | null;
    serial_number: string;
    location: string | { id: string } | null;
  };

  try {
    const updated = await stripe.terminal.readers.update(
      readerId,
      { label },
      { stripeAccount },
    ) as unknown as ReaderLike;
    console.log(
      `[terminal] update_reader: business=${businessId} reader=${readerId} label="${label}"`,
    );
    return jsonResponse({
      ok: true,
      reader: {
        id: updated.id,
        label: updated.label,
        device_type: updated.device_type,
        status: updated.status,
        serial_number: updated.serial_number,
        location: typeof updated.location === "string"
          ? updated.location
          : updated.location?.id ?? null,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Stripe error";
    console.error("[terminal] readers.update error:", msg);
    return errorResponse(msg, 502);
  }
}

// ── Action: remove_reader (owner only) ───────────────────────────────────────
//
// Deletes (deregisters) a Terminal reader from the business's connected Stripe
// account. Retrieves the reader first to confirm ownership before deletion.
// After removal the reader can be re-registered via a new pairing code.
//
// Body: { business_id, reader_id }
// Response: { ok: true, id }

async function handleRemoveReader(
  body: Record<string, unknown>,
  authUserId: string,
): Promise<Response> {
  const businessId = typeof body.business_id === "string" ? body.business_id : null;
  const readerId = typeof body.reader_id === "string" ? body.reader_id : null;
  if (!businessId) return errorResponse("business_id is required");
  if (!readerId) return errorResponse("reader_id is required");

  const ownerResult = await requireOwnerAccount(businessId, authUserId);
  if (ownerResult instanceof Response) return ownerResult;
  const { stripeAccount } = ownerResult;

  const stripe = getStripe();

  // Defence: retrieve the reader first to confirm it exists on this account.
  // Stripe returns 404 for readers that don't belong to the connected account,
  // preventing a caller from blindly deleting readers on other accounts.
  try {
    const existing = await stripe.terminal.readers.retrieve(
      readerId,
      undefined,
      { stripeAccount },
    );
    if ((existing as unknown as { deleted?: boolean }).deleted) {
      return errorResponse("Reader not found or not accessible", 404);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Stripe error";
    console.error("[terminal] readers.retrieve (remove check) error:", msg);
    return errorResponse("Reader not found or not accessible", 404);
  }

  try {
    await stripe.terminal.readers.del(readerId, { stripeAccount });
    console.log(
      `[terminal] remove_reader: business=${businessId} reader=${readerId} deleted`,
    );
    return jsonResponse({ ok: true, id: readerId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Stripe error";
    console.error("[terminal] readers.del error:", msg);
    return errorResponse(msg, 502);
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request): Promise<Response> => {
  // CORS preflight — required before any cross-origin POST
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return errorResponse("Content-Type must be application/json");
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body");
  }

  const action = typeof body.action === "string" ? body.action : null;

  // All three actions require a valid employee JWT. Verify once up front.
  const authResult = await verifyCaller(req);
  if (authResult instanceof Response) return authResult;
  const { authUserId, userClient } = authResult;

  console.log(`[terminal] action="${action}" user=${authUserId}`);

  try {
    switch (action) {
      case "connection_token":
        return await handleConnectionToken(body, userClient);

      case "get_or_create_location":
        return await handleGetOrCreateLocation(body, userClient);

      case "create_payment_intent":
        return await handleCreatePaymentIntent(body, userClient);

      case "mark_paid":
        return await handleMarkPaid(body, userClient);

      // ── Tab payment actions (C7 / 3a) ──────────────────────────────────────
      case "create_tab_payment_intent":
        return await handleCreateTabPaymentIntent(body, userClient);

      case "mark_tab_paid":
        return await handleMarkTabPaid(body, userClient);

      // ── Split-check action (3b) ─────────────────────────────────────────────
      case "charge_split_check":
        return await handleChargeSplitCheck(body, userClient);

      // ── Owner-only: reader management (Fase 1 — dispositivos de pago) ───────
      case "list_readers":
        return await handleListReaders(body, authUserId);

      case "register_reader":
        return await handleRegisterReader(body, authUserId);

      case "update_reader":
        return await handleUpdateReader(body, authUserId);

      case "remove_reader":
        return await handleRemoveReader(body, authUserId);

      default:
        return errorResponse(`Unknown action: ${action ?? "(none)"}`);
    }
  } catch (err) {
    console.error(`[terminal] unhandled error in action "${action}":`, err);
    return errorResponse("Internal server error", 500);
  }
});
