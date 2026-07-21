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
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.44.4";
import { businessChargeGate, buildConnectPiParams } from "../_shared/connect.ts";

/** Supabase client bound to the CALLER's JWT (RLS + auth.uid() apply). */
// deno-lint-ignore no-explicit-any
type UserClient = SupabaseClient<any, "public", any>;

// 8% fallback when businesses.tax_rate IS NULL — matches client default.
// Change this constant (or set businesses.tax_rate per business) to adjust.
const TAX_FALLBACK = 0.08;

/**
 * THE tax rounding. Every flow (payment intent, waiter order, editing a waiter
 * order) must round identically — two roundings of the same subtotal that differ
 * by a cent is a money bug that only shows up in reconciliation.
 */
function computeTaxCents(subtotalCents: number, taxRate: number): number {
  return Math.round(subtotalCents * taxRate);
}

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
  // supabase-js always sends apikey + x-client-info; omitting them makes the browser
  // block the request after a successful preflight (only OPTIONS reaches the function).
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
// Returns the caller's id AND the JWT-scoped client that proved it. The client is
// what lets an action ask the DB a question *as the caller* (e.g. RLS helpers like
// is_waiter_of_table, which read auth.uid()); the admin client would bypass that
// and answer for the service role, i.e. check nothing. Additive: existing callers
// destructure only authUserId.
async function verifyCaller(
  req: Request,
): Promise<{ authUserId: string; userClient: UserClient } | Response> {
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
  return { authUserId: user.id, userClient };
}

interface CartItem { menu_item_id: string; name: string; qty: number; price_cents: number; options?: Record<string, unknown>; special_instructions?: string | null; }
interface OrderPayload { business_id: string; user_id: string; room_id?: string | null; order_type: "table" | "counter" | "gift"; gift_recipient_id?: string | null; subtotal_cents: number; tax_cents: number; tip_cents: number; discount_cents: number; total_cents: number; promo_code?: string | null; special_instructions?: string | null; table_label?: string | null; table_qr_token?: string | null; items: CartItem[]; }

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
 * Resolve the DB price of a line's modifier-group selections (new system).
 * The client sends only { g: groupId, c: [choiceLabel] }; ALL prices come from
 * modifier_groups.choices in the DB. Rejects groups not linked to the item and
 * unknown choice labels. Returns the cents to add + the verified labels (for the
 * kitchen), or { error } for a 400.
 */
function resolveGroupModifierCents(
  itemId: string,
  itemName: string,
  selections: unknown,
  // deno-lint-ignore no-explicit-any
  groupsByItem: Map<string, Map<string, any>>,
): { cents: number; labels: string[] } | { error: string } {
  if (!Array.isArray(selections) || selections.length === 0) return { cents: 0, labels: [] };
  // deno-lint-ignore no-explicit-any
  const groups = groupsByItem.get(itemId) ?? new Map<string, any>();
  let cents = 0;
  const labels: string[] = [];
  // deno-lint-ignore no-explicit-any
  for (const sel of selections as any[]) {
    const gid = typeof sel?.g === "string" ? sel.g : null;
    if (!gid) return { error: `Invalid modifier group for ${itemName}` };
    const group = groups.get(gid);
    if (!group) return { error: `Modifier group not available for ${itemName}` };
    const choices = Array.isArray(group.choices) ? group.choices : [];
    const chosen = Array.isArray(sel.c) ? sel.c : [];
    for (const label of chosen) {
      if (typeof label !== "string") continue;
      // deno-lint-ignore no-explicit-any
      const match = choices.find((c: any) => c?.label === label);
      if (!match) return { error: `Invalid choice "${label}" for ${itemName}` };
      cents += typeof match.price_cents === "number" ? match.price_cents : 0;
      labels.push(label);
    }
  }
  return { cents, labels };
}

/** Minimum shape a line needs to be priced. */
interface PriceableItem {
  menu_item_id: string;
  qty: number;
  options?: Record<string, unknown>;
}

interface PricedLines {
  /** Per-line unit price: DB base + DB modifiers. Index-aligned with items[]. */
  lineUnitCents: number[];
  /** Server-VERIFIED option labels per line (what the kitchen should see). */
  resolvedOptions: Record<string, unknown>[];
  /** Sum of lineUnitCents[i] * items[i].qty. */
  subtotalCents: number;
}

/**
 * THE single server-side price calculator (extracted verbatim from
 * handleCreatePaymentIntent so create_waiter_order reuses it instead of growing a
 * second source of truth about money).
 *
 * Validates each line against the DB (exists / same business / available), resolves
 * BOTH modifier systems (legacy menu_items.options sizes+extras, and the newer
 * modifier_groups.choices), and returns server-owned amounts. Every price comes
 * from the database — any amount sent by the client is ignored.
 *
 * Returns { error, status } instead of a Response so callers own the HTTP shape.
 */
async function priceLinesFromDb(
  db: ReturnType<typeof getAdminClient>,
  businessId: string,
  items: PriceableItem[],
): Promise<PricedLines | { error: string; status?: number }> {
  // De-duplicate IDs for the IN query; duplicates in items[] are intentional
  // (same dish added twice → two cart lines) and summed in recalculation below.
  const itemIds = [...new Set(items.map((it) => it.menu_item_id))];
  const { data: dbItems, error: itemsErr } = await db
    .from("menu_items")
    .select("id, price_cents, is_available, business_id, name, options")
    .in("id", itemIds);
  if (itemsErr) return { error: `DB error fetching items: ${itemsErr.message}`, status: 500 };

  // deno-lint-ignore no-explicit-any
  const dbMap = new Map<string, any>((dbItems ?? []).map((r: any) => [r.id as string, r]));

  for (const it of items) {
    const row = dbMap.get(it.menu_item_id);
    if (!row)                           return { error: `Item not found: ${it.menu_item_id}` };
    if (row.business_id !== businessId) return { error: "Item does not belong to this business" };
    if (!row.is_available)              return { error: `Item not available: ${row.name}` };
  }

  // Modifier groups linked to the ordered items (new system). Prices come from here,
  // never from the client.
  const { data: mimgRows, error: mgErr } = await db
    .from("menu_item_modifier_groups")
    .select("menu_item_id, modifier_groups(id, label, choices)")
    .in("menu_item_id", itemIds);
  if (mgErr) return { error: `DB error fetching modifier groups: ${mgErr.message}`, status: 500 };

  // menu_item_id → (group_id → group)
  // deno-lint-ignore no-explicit-any
  const groupsByItem = new Map<string, Map<string, any>>();
  // deno-lint-ignore no-explicit-any
  for (const row of (mimgRows ?? []) as any[]) {
    const g = Array.isArray(row.modifier_groups) ? row.modifier_groups[0] : row.modifier_groups;
    if (!g) continue;
    const mid = row.menu_item_id as string;
    if (!groupsByItem.has(mid)) groupsByItem.set(mid, new Map());
    groupsByItem.get(mid)!.set(g.id as string, g);
  }

  // Uses DB base price per item AND DB modifier prices; the client's price_cents
  // and any prices inside it.options are ignored.
  const lineUnitCents: number[] = [];
  const resolvedOptions: Record<string, unknown>[] = [];
  for (const it of items) {
    const row = dbMap.get(it.menu_item_id)!;
    // Legacy sizes/extras (menu_items.options)
    const legacy = resolveModifierCents(row, it.options, row.name as string);
    if ("error" in legacy) return { error: legacy.error };
    // New modifier groups (modifier_groups.choices)
    const mods = resolveGroupModifierCents(
      it.menu_item_id,
      row.name as string,
      (it.options as Record<string, unknown> | undefined)?.modifiers,
      groupsByItem,
    );
    if ("error" in mods) return { error: mods.error };

    lineUnitCents.push((row.price_cents as number) + legacy.cents + mods.cents);

    const sel = (it.options ?? {}) as Record<string, unknown>;
    resolvedOptions.push({
      ...(typeof sel.size === "string" ? { size: sel.size } : {}),
      ...(Array.isArray(sel.extras) && sel.extras.length ? { extras: sel.extras } : {}),
      ...(mods.labels.length ? { modifiers: mods.labels } : {}),
    });
  }

  const subtotalCents = items.reduce((sum, it, idx) => sum + lineUnitCents[idx] * it.qty, 0);
  return { lineUnitCents, resolvedOptions, subtotalCents };
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

  // C2: optional table QR token. Resolved SERVER-SIDE below (never trust a
  // client-supplied table_id). The client only sends the opaque token.
  const tableQrToken = typeof payload.table_qr_token === "string"
    ? payload.table_qr_token.trim() || null
    : null;

  // Optional guest contact (receipt / refund). Sanitised; never trusted raw.
  const rawEmail = typeof body.contact_email === "string" ? body.contact_email.trim() : "";
  const rawPhone = typeof body.contact_phone === "string" ? body.contact_phone.trim() : "";
  const rawName = typeof body.contact_name === "string" ? body.contact_name.trim() : "";
  const contactEmail = rawEmail ? rawEmail.slice(0, 120) : null;
  const contactPhone = rawPhone ? rawPhone.slice(0, 30) : null;
  // Name the order is served under (C3'): guest input, or the profile name. Same
  // path as email/phone → metadata → webhook → orders.contact_name (max 60).
  const contactName = rawName ? rawName.slice(0, 60) : null;

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

  // ── Fetch business (tax_rate + Stripe Connect account + gating state) ─────
  const { data: business, error: bizErr } = await db
    .from("businesses")
    .select("id, stripe_account_id, tax_rate, status, stripe_charges_enabled")
    .eq("id", business_id)
    .maybeSingle();
  if (bizErr) return errorResponse(`DB error: ${bizErr.message}`, 500);
  if (!business) return errorResponse("Business not found", 404);
  const stripeAccountId = business.stripe_account_id as string | null;

  // ── Connect preconditions (gates only — amount recalculation is unchanged) ──
  // Verify the business may LEGITIMATELY receive this money before creating any
  // PaymentIntent. Missing any gate previously meant either the money silently
  // landed in the platform account (no destination) or the charge failed at the
  // register. All return 409 (conflict with the business's current state).
  //
  // Shared gate (verified → Connect account → onboarding finished). Same errors,
  // now reused by the tab-settlement flow too.
  const gate = businessChargeGate(business as {
    stripe_account_id: string | null;
    status: string | null;
    stripe_charges_enabled: boolean | null;
  });
  if (gate) {
    return errorResponse(gate.error, gate.status);
  }

  // ── Validate items + server-side recalculation (P0-2 + FIX #6 modifiers) ──
  // Extracted to priceLinesFromDb so the waiter-order action reuses the exact
  // same calculator. Behaviour and error strings are unchanged.
  const priced = await priceLinesFromDb(db, business_id, items);
  if ("error" in priced) return errorResponse(priced.error, priced.status ?? 400);
  const { lineUnitCents, resolvedOptions, subtotalCents: serverSubtotalCents } = priced;

  const taxRate = business.tax_rate != null ? Number(business.tax_rate) : TAX_FALLBACK;
  const serverTaxCents = computeTaxCents(serverSubtotalCents, taxRate);

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

  // C2: resolve the table QR token SERVER-SIDE. The client sends only the opaque
  // token; we look up the table and REQUIRE it to belong to THIS business (a
  // cross-business token is rejected — otherwise a customer could attach their
  // order to another venue's table). Unknown/inactive token → ignored (order
  // proceeds with no table). NEVER trust a client-supplied table_id.
  let resolvedTableId: string | null = null;
  if (tableQrToken) {
    const { data: tableRow, error: tableErr } = await db
      .from("tables")
      .select("id, business_id")
      .eq("qr_token", tableQrToken)
      .eq("is_active", true)
      .maybeSingle();
    if (tableErr) {
      console.error("[payments] table_qr_token lookup failed:", tableErr.message);
    } else if (!tableRow) {
      console.warn("[payments] table_qr_token not found or inactive — order has no table");
    } else if (tableRow.business_id !== business_id) {
      return errorResponse("La mesa no pertenece a este negocio", 400);
    } else {
      resolvedTableId = tableRow.id as string;
    }
  }

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
  if (resolvedTableId)      metadata.table_id = resolvedTableId;
  if (contactEmail)         metadata.contact_email = contactEmail;
  if (contactPhone)         metadata.contact_phone = contactPhone;
  if (contactName)          metadata.contact_name = contactName;
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

  // Destination-charge routing via the shared helper (stripeAccountId is set —
  // businessChargeGate guaranteed it above). amount is the SERVER total.
  const piParams = buildConnectPiParams({
    amountCents: serverTotalCents, // server-calculated; client total_cents is ignored
    currency: "usd",
    metadata,
    stripeAccountId: stripeAccountId as string,
    customer: customerId,
    receiptEmail: contactEmail, // guest receipt when a contact email is given
  });

  const paymentIntent = await stripe.paymentIntents.create(piParams, { idempotencyKey });
  const publishableKey = Deno.env.get("EXPO_PUBLIC_STRIPE_PK") ?? "";

  // Persist the SERVER-RESOLVED cart keyed by the PaymentIntent. The webhook reads this
  // instead of the size-capped Stripe metadata (which truncates once modifiers exist).
  const { error: cartErr } = await db.from("pending_order_carts").upsert({
    payment_intent_id: paymentIntent.id,
    business_id,
    user_id: authUserId,
    items: items.map((it, idx) => ({
      menu_item_id: it.menu_item_id,
      qty: it.qty,
      price_cents: lineUnitCents[idx],          // server-priced
      options: resolvedOptions[idx],            // server-verified labels
      special_instructions: it.special_instructions ?? null,
    })),
  });
  if (cartErr) {
    console.error("[payments] failed to persist pending cart:", cartErr);
    // Don't fail the payment: the webhook falls back to metadata.
  }

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

/**
 * create_waiter_order — a waiter takes an order at a table. NO payment involved.
 *
 * This is the inverse of the customer flow: the order is created UNPAID (paid_at
 * NULL) and goes straight to the kitchen (status 'confirmed'). It does NOT count
 * as revenue until it's collected — that's the whole point of splitting paid_at
 * from status (078). No Stripe, no tip, no discount: those belong to checkout.
 *
 * Prices come from priceLinesFromDb — the SAME calculator the payment flow uses.
 * Any amount sent by the client is ignored.
 */
async function handleCreateWaiterOrder(
  body: Record<string, unknown>,
  authUserId: string,
  userClient: UserClient,
): Promise<Response> {
  const tabId = typeof body.tab_id === "string" ? body.tab_id : null;
  if (!tabId) return errorResponse("tab_id is required");

  const rawItems = Array.isArray(body.items) ? body.items : null;
  if (!rawItems || rawItems.length === 0) return errorResponse("Cart is empty");

  // ── Validate line structure BEFORE any DB call ────────────────────────────
  interface WaiterLine extends PriceableItem { special_instructions?: string | null; seat?: number | null }
  const items: WaiterLine[] = [];
  for (const raw of rawItems as Record<string, unknown>[]) {
    const menuItemId = typeof raw.menu_item_id === "string" ? raw.menu_item_id : "";
    if (!menuItemId) return errorResponse("Each item must have a menu_item_id");
    const qty = raw.qty;
    if (!Number.isInteger(qty) || (qty as number) < 1) {
      return errorResponse(`Invalid qty for item ${menuItemId}`);
    }
    // seat: null, or an integer 1..50 (matches the order_items_seat_range CHECK).
    let seat: number | null = null;
    if (raw.seat !== null && raw.seat !== undefined) {
      if (!Number.isInteger(raw.seat) || (raw.seat as number) < 1 || (raw.seat as number) > 50) {
        return errorResponse(`Invalid seat for item ${menuItemId} (must be 1–50)`);
      }
      seat = raw.seat as number;
    }
    items.push({
      menu_item_id: menuItemId,
      qty: qty as number,
      options: (raw.options ?? {}) as Record<string, unknown>,
      special_instructions: typeof raw.special_instructions === "string"
        ? raw.special_instructions.trim().slice(0, 500) || null
        : null,
      seat,
    });
  }

  const db = getAdminClient();

  // ── Guard 2: the tab must exist and still be open ─────────────────────────
  const { data: tab, error: tabErr } = await db
    .from("table_tabs")
    .select("id, business_id, table_id, status")
    .eq("id", tabId)
    .maybeSingle();
  if (tabErr) return errorResponse(`DB error: ${tabErr.message}`, 500);
  if (!tab) return errorResponse("Tab not found", 404);
  if (tab.status !== "open") return errorResponse("Esa cuenta ya está cerrada", 400);

  // ── Guard 3: the caller must be the waiter OF THAT TABLE ──────────────────
  // Asked through the CALLER's client, so is_waiter_of_table() sees the caller's
  // auth.uid(). Calling it with the admin client would evaluate it for the service
  // role and check nothing at all.
  const { data: isWaiter, error: waiterErr } = await userClient.rpc("is_waiter_of_table", {
    p_table_id: tab.table_id,
  });
  if (waiterErr) return errorResponse(`DB error: ${waiterErr.message}`, 500);
  if (isWaiter !== true) return errorResponse("Esta mesa no está asignada a ti", 403);

  // ── Guard 4 + pricing: items must belong to the TAB's business ────────────
  // priceLinesFromDb enforces the business match (and availability) per line.
  const priced = await priceLinesFromDb(db, tab.business_id as string, items);
  if ("error" in priced) return errorResponse(priced.error, priced.status ?? 400);
  const { lineUnitCents, resolvedOptions, subtotalCents } = priced;

  // Tax uses the business rate, same rule as the payment flow. No tip, no discount.
  const { data: business, error: bizErr } = await db
    .from("businesses")
    .select("id, tax_rate")
    .eq("id", tab.business_id)
    .maybeSingle();
  if (bizErr) return errorResponse(`DB error: ${bizErr.message}`, 500);
  if (!business) return errorResponse("Business not found", 404);
  const taxRate = business.tax_rate != null ? Number(business.tax_rate) : TAX_FALLBACK;
  const taxCents = computeTaxCents(subtotalCents, taxRate);
  const totalCents = subtotalCents + taxCents;

  // ── Write: order first, then its items ────────────────────────────────────
  // paid_at stays NULL — the kitchen sees this order, the sales calendar does not.
  const { data: order, error: orderErr } = await db
    .from("orders")
    .insert({
      business_id: tab.business_id,
      user_id: null,              // a waiter order has no customer
      taken_by: authUserId,       // the employee who took it (audit / "my sales")
      tab_id: tab.id,
      table_id: tab.table_id,
      status: "confirmed",        // kitchen can start
      status_updated_at: new Date().toISOString(),
      paid_at: null,              // NOT a sale until it's collected
      order_type: "table",
      subtotal_cents: subtotalCents,
      tax_cents: taxCents,
      tip_cents: 0,
      discount_cents: 0,
      total_cents: totalCents,
      stripe_pi_id: null,
    })
    .select("id")
    .single();
  if (orderErr) return errorResponse(`Could not create order: ${orderErr.message}`, 500);
  const orderId = (order as { id: string }).id;

  // item_status 'pending' — a dish is never born 'preparing' (D-63: that would leave no edit window). Same initial value the stripe-webhook writes.
  const itemRows = items.map((it, idx) => ({
    order_id: orderId,
    menu_item_id: it.menu_item_id,
    qty: it.qty,
    price_cents: lineUnitCents[idx],     // server-priced, never the client's
    options: resolvedOptions[idx],       // server-verified labels
    special_instructions: it.special_instructions ?? null,
    seat: it.seat ?? null,
    item_status: "pending",
  }));

  const { error: itemsErr } = await db.from("order_items").insert(itemRows);
  if (itemsErr) {
    // No transaction spans two PostgREST calls, so an items failure would leave an
    // order with no lines — a ghost ticket in the kitchen and a wrong tab total.
    // Compensate by deleting the order we just created, then report the failure.
    const { error: rollbackErr } = await db.from("orders").delete().eq("id", orderId);
    if (rollbackErr) {
      console.error(
        `[payments] create_waiter_order: items insert failed AND rollback failed for order ${orderId}:`,
        rollbackErr,
      );
    }
    return errorResponse(`Could not create order items: ${itemsErr.message}`, 500);
  }

  return jsonResponse({
    order_id: orderId,
    subtotal_cents: subtotalCents,
    tax_cents: taxCents,
    total_cents: totalCents,
    items: items.map((it, idx) => ({
      menu_item_id: it.menu_item_id,
      qty: it.qty,
      seat: it.seat ?? null,
      unit_price_cents: lineUnitCents[idx],
      line_total_cents: lineUnitCents[idx] * it.qty,
      options: resolvedOptions[idx],
    })),
  });
}

/**
 * update_waiter_order_item — edit ONE dish of a waiter order while the kitchen
 * hasn't started it (K1d, rule D-63).
 *
 * The lock is at ORDER level: if ANY dish of the order is 'preparing' or 'ready',
 * the whole ticket is frozen — including the dishes still pending. Changing a
 * ticket the kitchen is already working on is how wrong plates reach a table.
 *
 * Pricing: the edited line is re-priced by priceLinesFromDb — the SAME calculator
 * used to create the order. Untouched lines keep their stored price_cents, which
 * the server already set when they were created; re-pricing them would silently
 * rewrite history if the menu price changed since the order was taken. Tax goes
 * through computeTaxCents so the rounding can't drift.
 *
 * Removing the LAST dish CANCELS the order (status='cancelled', totals 0). It is
 * never deleted — the audit trail (who took it, what happened) has to survive.
 */
async function handleUpdateWaiterOrderItem(
  body: Record<string, unknown>,
  authUserId: string,
  userClient: UserClient,
): Promise<Response> {
  const orderItemId = typeof body.order_item_id === "string" ? body.order_item_id : null;
  if (!orderItemId) return errorResponse("order_item_id is required");

  const remove = body.remove === true;
  // qty/options are ignored entirely when removing.
  let qty: number | null = null;
  if (!remove && body.qty !== undefined && body.qty !== null) {
    if (!Number.isInteger(body.qty) || (body.qty as number) < 1) {
      return errorResponse("qty must be an integer >= 1");
    }
    qty = body.qty as number;
  }
  const newOptions = !remove && body.options && typeof body.options === "object"
    ? (body.options as Record<string, unknown>)
    : null;
  if (!remove && qty === null && newOptions === null) {
    return errorResponse("Nothing to update: send qty, options or remove");
  }

  const db = getAdminClient();

  // ── Guard 2: the line and its order must exist ────────────────────────────
  const { data: line, error: lineErr } = await db
    .from("order_items")
    .select("id, order_id, menu_item_id, qty, price_cents, item_status")
    .eq("id", orderItemId)
    .maybeSingle();
  if (lineErr) return errorResponse(`DB error: ${lineErr.message}`, 500);
  if (!line) return errorResponse("Order item not found", 404);

  const { data: order, error: orderErr } = await db
    .from("orders")
    .select("id, business_id, status, paid_at, tip_cents, discount_cents")
    .eq("id", line.order_id)
    .maybeSingle();
  if (orderErr) return errorResponse(`DB error: ${orderErr.message}`, 500);
  if (!order) return errorResponse("Order not found", 404);

  // ── Guard 3: permission, asked AS THE CALLER ──────────────────────────────
  // is_employee_of_business reads auth.uid(), so it must go through the caller's
  // client; with the admin client it would answer for the service role and check
  // nothing. Ownership is compared against the JWT-verified authUserId.
  const { data: isEmployee, error: empErr } = await userClient.rpc("is_employee_of_business", {
    p_business_id: order.business_id,
  });
  if (empErr) return errorResponse(`DB error: ${empErr.message}`, 500);
  let allowed = isEmployee === true;
  if (!allowed) {
    const { data: biz } = await db
      .from("businesses")
      .select("owner_id")
      .eq("id", order.business_id)
      .maybeSingle();
    allowed = (biz as { owner_id?: string } | null)?.owner_id === authUserId;
  }
  if (!allowed) return errorResponse("No puedes editar los pedidos de este negocio", 403);

  // ── Guard 5: administrative/terminal states are not editable ──────────────
  if (["cancelled", "delivered", "refunded"].includes(order.status as string)) {
    return errorResponse("Este pedido ya está cerrado y no se puede editar", 409);
  }
  // NOT in the brief, added deliberately: a PAID order's total is already charged
  // in Stripe. Editing it would desync the DB from the real charge.
  if (order.paid_at != null) {
    return errorResponse("Este pedido ya está pagado; no se puede editar", 409);
  }

  // ── Guard 4: the D-63 ORDER-level lock ────────────────────────────────────
  const { data: siblings, error: sibErr } = await db
    .from("order_items")
    .select("id, qty, price_cents, item_status")
    .eq("order_id", order.id);
  if (sibErr) return errorResponse(`DB error: ${sibErr.message}`, 500);
  const started = (siblings ?? []).filter(
    (s) => s.item_status === "preparing" || s.item_status === "ready",
  );
  if (started.length > 0) {
    return errorResponse("La cocina ya empezó este pedido y no se puede modificar", 409);
  }

  // ── Effect ────────────────────────────────────────────────────────────────
  if (remove) {
    const { error: delErr } = await db.from("order_items").delete().eq("id", orderItemId);
    if (delErr) return errorResponse(`Could not remove the dish: ${delErr.message}`, 500);
  } else {
    // Re-price the edited line with THE calculator. Client amounts are ignored:
    // priceLinesFromDb only reads ids/qty/option selections.
    const priced = await priceLinesFromDb(db, order.business_id as string, [
      {
        menu_item_id: line.menu_item_id as string,
        qty: qty ?? (line.qty as number),
        options: (newOptions ?? {}) as Record<string, unknown>,
      },
    ]);
    if ("error" in priced) return errorResponse(priced.error, priced.status ?? 400);

    const patch: Record<string, unknown> = { price_cents: priced.lineUnitCents[0] };
    if (qty !== null) patch.qty = qty;
    if (newOptions !== null) patch.options = priced.resolvedOptions[0];

    const { error: updErr } = await db.from("order_items").update(patch).eq("id", orderItemId);
    if (updErr) return errorResponse(`Could not update the dish: ${updErr.message}`, 500);
  }

  // ── Re-sum the order from its CURRENT lines ───────────────────────────────
  const { data: freshLines, error: freshErr } = await db
    .from("order_items")
    .select("id, menu_item_id, qty, price_cents, options, seat, item_status")
    .eq("order_id", order.id);
  if (freshErr) return errorResponse(`DB error: ${freshErr.message}`, 500);
  const lines = freshLines ?? [];

  const { data: business } = await db
    .from("businesses")
    .select("tax_rate")
    .eq("id", order.business_id)
    .maybeSingle();
  const taxRate = (business as { tax_rate?: number | null } | null)?.tax_rate != null
    ? Number((business as { tax_rate: number }).tax_rate)
    : TAX_FALLBACK;

  let subtotalCents = 0;
  for (const l of lines) subtotalCents += (l.price_cents as number) * (l.qty as number);
  let taxCents = computeTaxCents(subtotalCents, taxRate);
  const tip = (order.tip_cents as number) ?? 0;
  const discount = (order.discount_cents as number) ?? 0;
  let totalCents = subtotalCents + taxCents + tip - discount;

  // Last dish removed → CANCEL the order (never delete it: the audit trail of who
  // took it and what happened has to survive).
  const emptied = lines.length === 0;
  const patch: Record<string, unknown> = emptied
    ? {
        status: "cancelled",
        status_updated_at: new Date().toISOString(),
        subtotal_cents: 0,
        tax_cents: 0,
        total_cents: 0,
      }
    : { subtotal_cents: subtotalCents, tax_cents: taxCents, total_cents: totalCents };
  if (emptied) {
    subtotalCents = 0;
    taxCents = 0;
    totalCents = 0;
  }

  const { error: ordUpdErr } = await db.from("orders").update(patch).eq("id", order.id);
  if (ordUpdErr) return errorResponse(`Could not update the order: ${ordUpdErr.message}`, 500);

  return jsonResponse({
    order_id: order.id,
    removed: remove,
    cancelled: emptied,
    subtotal_cents: subtotalCents,
    tax_cents: taxCents,
    total_cents: totalCents,
    items: lines.map((l) => ({
      order_item_id: l.id,
      menu_item_id: l.menu_item_id,
      qty: l.qty,
      seat: l.seat ?? null,
      unit_price_cents: l.price_cents,
      line_total_cents: (l.price_cents as number) * (l.qty as number),
      options: l.options,
      item_status: l.item_status,
    })),
  });
}

/**
 * create_tab_payment — a WAITER starts settling a tab from the terminal.
 *
 * The amount is taken from tab_amount_due (SERVER), never the client. For 'card'
 * it just opens a pending tab_payments row and hands back the pay_token/URL — the
 * PaymentIntent is created later by the public /pay page (tab-pay EF), when the
 * customer actually pays. For 'cash' it records the payment and settles the tab
 * immediately (simple cash for this batch; the till/cash-drawer is a later one).
 */
async function handleCreateTabPayment(
  body: Record<string, unknown>,
  authUserId: string,
  userClient: UserClient,
): Promise<Response> {
  const tabId = typeof body.tab_id === "string" ? body.tab_id : null;
  if (!tabId) return errorResponse("tab_id is required");
  const method = body.method === "card" || body.method === "cash" ? body.method : null;
  if (!method) return errorResponse("method must be 'card' or 'cash'");

  // Optional waiter-entered tip; default 0. Only trusted from the waiter here.
  let tipCents = 0;
  if (body.tip_cents !== undefined && body.tip_cents !== null) {
    if (!Number.isInteger(body.tip_cents) || (body.tip_cents as number) < 0) {
      return errorResponse("tip_cents must be a non-negative integer");
    }
    tipCents = body.tip_cents as number;
  }

  const db = getAdminClient();

  // Tab must exist and be open.
  const { data: tab, error: tabErr } = await db
    .from("table_tabs")
    .select("id, business_id, status")
    .eq("id", tabId)
    .maybeSingle();
  if (tabErr) return errorResponse(`DB error: ${tabErr.message}`, 500);
  if (!tab) return errorResponse("Tab not found", 404);
  if (tab.status !== "open") return errorResponse("Esa cuenta ya está cerrada", 400);

  // Amount from the SERVER, AS THE CALLER: tab_amount_due enforces the permission
  // (employee/owner/admin) and returns the sum of unpaid orders. Client amounts
  // are never read.
  const { data: due, error: dueErr } = await userClient.rpc("tab_amount_due", { p_tab_id: tabId });
  if (dueErr) {
    if (dueErr.message.includes("NOT_ALLOWED")) {
      return errorResponse("No puedes cobrar en esta mesa", 403);
    }
    return errorResponse(`DB error: ${dueErr.message}`, 500);
  }
  const amountCents = (due as { amount_cents?: number } | null)?.amount_cents ?? 0;
  if (amountCents <= 0) return errorResponse("No hay nada que cobrar en esta cuenta", 400);

  if (method === "cash") {
    // Record the cash payment and settle atomically (084).
    const { data: row, error: insErr } = await db
      .from("tab_payments")
      .insert({
        tab_id: tabId,
        amount_cents: amountCents,
        tip_cents: tipCents,
        method: "cash",
        status: "pending",       // settle_tab_payment flips it to 'succeeded'
        taken_by: authUserId,
      })
      .select("id, pay_token")
      .single();
    if (insErr) return errorResponse(`Could not create the payment: ${insErr.message}`, 500);

    const { error: settleErr } = await db.rpc("settle_tab_payment", {
      p_tab_payment_id: (row as { id: string }).id,
    });
    if (settleErr) {
      // The payment row exists but didn't settle — leave it 'pending' (not a lie),
      // report the failure. Nothing was marked paid.
      return errorResponse(`Could not settle the tab: ${settleErr.message}`, 500);
    }

    return jsonResponse({
      tab_payment_id: (row as { id: string }).id,
      method: "cash",
      status: "succeeded",
      amount_cents: amountCents,
      tip_cents: tipCents,
    });
  }

  // method === 'card': open a pending payment; the PI is created by the public page.
  const { data: row, error: insErr } = await db
    .from("tab_payments")
    .insert({
      tab_id: tabId,
      amount_cents: amountCents,
      tip_cents: tipCents,
      method: "card",
      status: "pending",
      taken_by: authUserId,
    })
    .select("id, pay_token")
    .single();
  if (insErr) return errorResponse(`Could not create the payment: ${insErr.message}`, 500);

  const payToken = (row as { pay_token: string }).pay_token;
  // PUBLIC_WEB_URL is the site origin (e.g. https://jchat.app). The path is stable.
  const base = (Deno.env.get("PUBLIC_WEB_URL") ?? "").replace(/\/+$/, "");
  const payUrl = base ? `${base}/pay/${payToken}` : `/pay/${payToken}`;

  return jsonResponse({
    tab_payment_id: (row as { id: string }).id,
    method: "card",
    status: "pending",
    pay_token: payToken,
    pay_url: payUrl,
    amount_cents: amountCents,
    tip_cents: tipCents,
  });
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
      // Waiter takes an order at a table — no payment. Needs the caller-scoped
      // client so is_waiter_of_table() is evaluated as the caller.
      case "create_waiter_order":   return await handleCreateWaiterOrder(body, authUserId, auth.userClient);
      // Edit a dish while the kitchen hasn't started the ticket (D-63). Caller-scoped
      // client so the employee check is evaluated as the caller.
      case "update_waiter_order_item":
        return await handleUpdateWaiterOrderItem(body, authUserId, auth.userClient);
      // Waiter starts settling a tab. Caller-scoped client so tab_amount_due checks
      // the permission as the caller. The public card page (tab-pay EF) creates the PI.
      case "create_tab_payment":
        return await handleCreateTabPayment(body, authUserId, auth.userClient);
      default: return errorResponse(`Unknown action: ${action ?? "(none)"}`);
    }
  } catch (err) {
    console.error(`[payments] error in action "${action}":`, err);
    return errorResponse("Internal server error", 500);
  }
});
