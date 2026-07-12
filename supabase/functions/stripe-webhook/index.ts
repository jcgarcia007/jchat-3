/**
 * JChat 3.0 — Stripe Webhook Edge Function (Task 3.6)
 * Runtime: Deno (Supabase Edge Functions)
 *
 * Handles Stripe payment lifecycle events for ORDER payments (not subscriptions —
 * those go to supabase/functions/subscriptions/index.ts).
 *
 * Handled events:
 *   payment_intent.succeeded      → create orders + order_items rows; KDS picks
 *                                   them up via Supabase Realtime on the orders table.
 *   payment_intent.payment_failed → log failure (client polling / error state).
 *   account.updated               → sync a business's Connect onboarding flags
 *                                   (charges/payouts/details) so payments can gate on them.
 *
 * Deploy:
 *   supabase functions deploy stripe-webhook
 *
 * Required env vars (Supabase dashboard → Edge Functions → Secrets):
 *   STRIPE_SECRET_KEY            — sk_live_… or sk_test_…
 *   STRIPE_WEBHOOK_SECRET        — whsec_… for the "Your account" endpoint (payment_intent.*)
 *   STRIPE_CONNECT_WEBHOOK_SECRET — whsec_… for the "Connected accounts" endpoint (account.updated)
 *   SUPABASE_URL                — auto-injected
 *   SUPABASE_SERVICE_ROLE_KEY   — set manually
 *
 * Stripe webhook endpoint to register:
 *   https://<project-ref>.supabase.co/functions/v1/stripe-webhook
 *   Events to send: payment_intent.succeeded, payment_intent.payment_failed, account.updated
 */

import Stripe from "npm:stripe@16.2.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.44.4";

// ── Supabase admin client ─────────────────────────────────────────────────────

function getAdminClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
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
  "Access-Control-Allow-Headers": "Content-Type, stripe-signature",
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

// ── Cart item shape packed into PaymentIntent metadata ────────────────────────

interface PackedItem {
  m: string; // menu_item_id
  q: number; // qty
  p: number; // price_cents
  o?: Record<string, unknown>; // options
  s?: string; // special_instructions
}

// ── Handler: payment_intent.succeeded ────────────────────────────────────────

async function handlePaymentSucceeded(
  paymentIntent: Stripe.PaymentIntent,
): Promise<void> {
  const meta = paymentIntent.metadata ?? {};

  const businessId = meta.business_id;
  const userId = meta.user_id;
  const orderType = (meta.order_type ?? "counter") as "table" | "counter" | "gift";
  const giftRecipientId = meta.gift_recipient_id ?? null;
  const roomId = meta.room_id ?? null;
  const subtotalCents = parseInt(meta.subtotal_cents ?? "0", 10);
  const taxCents = parseInt(meta.tax_cents ?? "0", 10);
  const tipCents = parseInt(meta.tip_cents ?? "0", 10);
  const discountCents = parseInt(meta.discount_cents ?? "0", 10);
  const totalCents = parseInt(meta.total_cents ?? "0", 10);
  const promoCode = meta.promo_code ?? null;
  const specialInstructions = meta.special_instructions ?? null;
  const tableLabel = meta.table_label ?? null;
  const contactEmail = meta.contact_email ?? null;
  const contactPhone = meta.contact_phone ?? null;
  const itemsRaw = meta.items ?? "[]";

  if (!businessId || !userId) {
    console.error(
      `[stripe-webhook] payment_intent.succeeded: missing metadata on PI ${paymentIntent.id}`,
    );
    return;
  }

  // Parse items (may be truncated if cart was very large — items_overflow flag)
  let items: PackedItem[] = [];
  try {
    items = JSON.parse(itemsRaw) as PackedItem[];
  } catch (err) {
    console.warn(`[stripe-webhook] could not parse items metadata on PI ${paymentIntent.id}:`, err);
  }

  const db = getAdminClient();

  // 1. Guard: check if we already processed this PaymentIntent (idempotency)
  const { data: existing } = await db
    .from("orders")
    .select("id")
    .eq("stripe_pi_id", paymentIntent.id)
    .maybeSingle();

  if (existing) {
    console.log(
      `[stripe-webhook] payment_intent.succeeded: order already exists for PI ${paymentIntent.id} — skipping`,
    );
    return;
  }

  // 2. Insert order row
  const { data: order, error: orderErr } = await db
    .from("orders")
    .insert({
      business_id: businessId,
      user_id: userId,
      room_id: roomId,
      status: "confirmed",
      order_type: orderType,
      gift_recipient_id: giftRecipientId,
      subtotal_cents: subtotalCents,
      tax_cents: taxCents,
      tip_cents: tipCents,
      discount_cents: discountCents,
      total_cents: totalCents,
      promo_code: promoCode,
      special_instructions: specialInstructions,
      table_label: tableLabel,
      contact_email: contactEmail,
      contact_phone: contactPhone,
      stripe_pi_id: paymentIntent.id,
      status_updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (orderErr) {
    // FIX #8: unique partial index on orders.stripe_pi_id. A concurrent delivery
    // already inserted this order (won the race past the SELECT-guard above).
    // Treat as already-processed → return cleanly instead of throwing a 500.
    if ((orderErr as { code?: string }).code === "23505") {
      console.log(
        `[stripe-webhook] order already exists (unique PI ${paymentIntent.id}) — skipping`,
      );
      return;
    }
    console.error(`[stripe-webhook] failed to insert order for PI ${paymentIntent.id}:`, orderErr);
    throw orderErr;
  }

  const orderId = (order as { id: string }).id;

  // 3. Insert order_items rows.
  // Prefer the server-resolved cart (no size limit). Fall back to the packed metadata
  // for PaymentIntents created before pending_order_carts existed.
  const { data: pendingCart } = await db
    .from("pending_order_carts")
    .select("items")
    .eq("payment_intent_id", paymentIntent.id)
    .maybeSingle();

  type ResolvedItem = {
    menu_item_id: string; qty: number; price_cents: number;
    options?: Record<string, unknown>; special_instructions?: string | null;
  };

  const rowsToInsert = pendingCart?.items
    ? (pendingCart.items as ResolvedItem[]).map((it) => ({
        order_id: orderId,
        menu_item_id: it.menu_item_id,
        qty: it.qty,
        price_cents: it.price_cents,
        options: it.options ?? {},
        special_instructions: it.special_instructions ?? null,
        item_status: "cooking",
      }))
    : items.map((it) => ({            // legacy metadata path (unchanged)
        order_id: orderId,
        menu_item_id: it.m,
        qty: it.q,
        price_cents: it.p,
        options: it.o ?? {},
        special_instructions: it.s ?? null,
        item_status: "cooking",
      }));

  if (rowsToInsert.length > 0) {
    const { error: itemsErr } = await db.from("order_items").insert(rowsToInsert);
    if (itemsErr) {
      console.error(`[stripe-webhook] failed to insert order_items for order ${orderId}:`, itemsErr);
      // Order row was inserted — partial state. Log but don't throw so webhook returns 200.
      // KDS will show an order with no items; staff can manually add them.
    }
  }

  // Clean up the pending cart (idempotent; log-only on failure).
  if (pendingCart) {
    const { error: delErr } = await db
      .from("pending_order_carts")
      .delete()
      .eq("payment_intent_id", paymentIntent.id);
    if (delErr) console.warn("[stripe-webhook] failed to delete pending cart:", delErr);
  }

  console.log(
    `[stripe-webhook] order created: id=${orderId} business=${businessId} total=${totalCents} pi=${paymentIntent.id}`,
  );

  // KDS picks up the new order automatically via Supabase Realtime
  // (postgres_changes on orders table — INSERT event).

  // TODO(push): notify business owner of new order
  //   await sendPushToBusinessOwner(businessId, { type: 'new_order', orderId, totalCents });
}

// ── Handler: account.updated (Connect onboarding state) ───────────────────────
// Keeps businesses.stripe_charges_enabled/payouts_enabled/details_submitted in sync
// with Stripe so payments/index.ts can gate on them. Idempotent by nature (writes the
// same booleans) and also covered by the processed_stripe_events dedup guard below.

async function handleAccountUpdated(account: Stripe.Account): Promise<void> {
  const db = getAdminClient();
  const { error } = await db
    .from("businesses")
    .update({
      stripe_charges_enabled: !!account.charges_enabled,
      stripe_payouts_enabled: !!account.payouts_enabled,
      stripe_details_submitted: !!account.details_submitted,
    })
    .eq("stripe_account_id", account.id);

  if (error) {
    console.error(
      `[stripe-webhook] account.updated: failed to sync business for account ${account.id}:`,
      error,
    );
    // Throw so the outer catch rolls back the dedup marker → Stripe retries.
    throw error;
  }

  console.log(
    `[stripe-webhook] account.updated: account=${account.id} charges=${account.charges_enabled} ` +
      `payouts=${account.payouts_enabled} details=${account.details_submitted}`,
  );
}

// ── Handler: payment_intent.payment_failed ────────────────────────────────────

async function handlePaymentFailed(
  paymentIntent: Stripe.PaymentIntent,
): Promise<void> {
  const meta = paymentIntent.metadata ?? {};
  const businessId = meta.business_id ?? "(unknown)";
  const userId = meta.user_id ?? "(unknown)";

  console.warn(
    `[stripe-webhook] payment_intent.payment_failed: pi=${paymentIntent.id} ` +
      `user=${userId} business=${businessId} ` +
      `reason=${paymentIntent.last_payment_error?.message ?? "none"}`,
  );

  // The mobile client is polling / observing presentPaymentSheet result,
  // so it already knows the charge failed. No additional DB write needed here
  // unless you want to track failed attempts — add a payment_attempts table if so.

  // TODO(push): optionally notify user "Payment failed — please try again"
  //   await sendPushToUser(userId, { type: 'payment_failed', piId: paymentIntent.id });
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  const stripe = getStripe();
  const rawBody = await req.text();
  const sig = req.headers.get("stripe-signature") ?? "";

  // This function backs TWO Stripe webhook endpoints, each with its own signing secret:
  //   · STRIPE_WEBHOOK_SECRET         — "Your account" endpoint (payment_intent.*)
  //   · STRIPE_CONNECT_WEBHOOK_SECRET — "Connected accounts" endpoint (account.updated)
  // A Connect event only verifies against the Connect endpoint's secret, so we try each
  // configured secret and keep the first that verifies. At least one must be set.
  const webhookSecrets = [
    Deno.env.get("STRIPE_WEBHOOK_SECRET"),
    Deno.env.get("STRIPE_CONNECT_WEBHOOK_SECRET"),
  ].filter((s): s is string => !!s);

  if (webhookSecrets.length === 0) {
    console.error(
      "[stripe-webhook] no signing secret set (STRIPE_WEBHOOK_SECRET / STRIPE_CONNECT_WEBHOOK_SECRET) — aborting",
    );
    return errorResponse("Webhook secret not configured", 500);
  }

  let event: Stripe.Event | null = null;
  let lastErr: unknown = null;
  for (const secret of webhookSecrets) {
    try {
      event = await stripe.webhooks.constructEventAsync(rawBody, sig, secret);
      break; // verified against this secret
    } catch (err) {
      lastErr = err;
    }
  }
  if (!event) {
    console.error("[stripe-webhook] signature verification failed:", lastErr);
    return errorResponse("Invalid webhook signature", 400);
  }

  console.log(`[stripe-webhook] event: ${event.type} id=${event.id}`);

  // ── Idempotency guard (FIX #5): INSERT-FIRST + DELETE-ON-ERROR ─────────────
  // Insert the event.id first (atomic dedup, no race). If it already exists
  // (23505 = re-delivery of the SAME event), return 200 without reprocessing.
  // Any other DB error → 500 so Stripe retries. If the handler below throws,
  // we DELETE the marker before returning 500 so Stripe's retry reprocesses it.
  const db = getAdminClient();
  const { error: dedupErr } = await db
    .from("processed_stripe_events")
    .insert({ event_id: event.id, type: event.type });
  if (dedupErr) {
    if ((dedupErr as { code?: string }).code === "23505") {
      console.log(`[stripe-webhook] duplicate event ${event.id} — skipping`);
      return jsonResponse({ received: true, duplicate: true });
    }
    console.error(`[stripe-webhook] dedup insert failed for ${event.id}:`, dedupErr);
    return errorResponse("Internal server error", 500);
  }

  try {
    switch (event.type) {
      case "payment_intent.succeeded":
        await handlePaymentSucceeded(event.data.object as Stripe.PaymentIntent);
        break;

      case "payment_intent.payment_failed":
        await handlePaymentFailed(event.data.object as Stripe.PaymentIntent);
        break;

      case "account.updated":
        await handleAccountUpdated(event.data.object as Stripe.Account);
        break;

      default:
        // Non-order events (subscription events go to /subscriptions webhook)
        console.log(`[stripe-webhook] unhandled event type: ${event.type}`);
    }
  } catch (err) {
    console.error(`[stripe-webhook] handler error for ${event.type}:`, err);
    // Roll back the dedup marker so Stripe's retry reprocesses this event.
    await db.from("processed_stripe_events").delete().eq("event_id", event.id);
    // Return 500 so Stripe retries the event
    return errorResponse("Internal server error", 500);
  }

  return jsonResponse({ received: true });
});
