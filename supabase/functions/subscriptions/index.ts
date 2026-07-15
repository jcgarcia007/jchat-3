/**
 * JChat 3.0 — Subscriptions Edge Function (Task 3.15; rewritten 2026-07-14 → plan-per-user)
 * Runtime: Deno (Supabase Edge Functions)
 *
 * PLAN-PER-USER (opción B, ver docs/PLAN_MONETIZACION.md): the subscription belongs to
 * the USER (one per person, covers all their businesses). The plan state lives ENTIRELY in
 * `users` (plan, plan_status, plan_trial_end, plan_renews_at, stripe_customer_id,
 * stripe_subscription_id). This function NEVER writes the old `subscriptions` table or
 * `businesses.plan` anymore. The dashboard gate reads users.plan + users.plan_status.
 *
 * Handles:
 *   POST /subscriptions  { action: "create_checkout", plan }  (JWT required)
 *     → creates a Stripe Checkout Session for the caller's own user and returns { url }
 *       (or { downgraded: true } / { scheduled_cancel } for the free plan).
 *
 *   POST /subscriptions  { action: "create_portal_session" }  (JWT required)
 *     → returns { url } for the Stripe Customer Portal (change plan / card / cancel).
 *
 *   POST /subscriptions  (raw Stripe webhook body, stripe-signature header)
 *     → handles Stripe subscription lifecycle events; writes users.*.
 *
 * Deploy:
 *   supabase functions deploy subscriptions
 *
 * Required env vars (Supabase dashboard → Edge Functions → Secrets):
 *   STRIPE_SECRET_KEY         — sk_live_… or sk_test_…
 *   STRIPE_WEBHOOK_SECRET_SUBS — whsec_… for THIS function's OWN Stripe webhook endpoint
 *                               (subscriptions). Separate from stripe-webhook's
 *                               STRIPE_WEBHOOK_SECRET (payments) — each Stripe endpoint has
 *                               its own signing secret, so they must NOT share a variable.
 *   STRIPE_PRICE_BUSINESS / STRIPE_PRICE_PRO / STRIPE_PRICE_VERIFIED — recurring Price IDs
 *   SUPABASE_URL              — project URL (auto-injected)
 *   SUPABASE_SERVICE_ROLE_KEY — service role key (set manually in secrets)
 *   SUPABASE_ANON_KEY         — for the JWT verification path
 *
 * Rule 4 compliance: ALL Stripe API calls happen here (server-side only).
 */

// ── Deno imports ──────────────────────────────────────────────────────────────
import Stripe from "npm:stripe@16.2.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.44.4";

// ── Plan catalogue ────────────────────────────────────────────────────────────

type PlanId = "regular" | "verified" | "business" | "pro";

interface PlanDef {
  label: string;
  /** Monthly price in USD. 0 = free. */
  price_usd: number;
  /** Stripe Price ID — set in your Stripe dashboard and copy here. */
  stripe_price_id: string | null;
}

const PLANS: Record<PlanId, PlanDef> = {
  regular: {
    label: "Regular",
    price_usd: 0,
    stripe_price_id: null, // free plan — no Stripe price
  },
  verified: {
    label: "Verified",
    price_usd: 1.99,
    stripe_price_id: Deno.env.get("STRIPE_PRICE_VERIFIED") ?? null,
  },
  business: {
    label: "Business",
    price_usd: 49,
    stripe_price_id: Deno.env.get("STRIPE_PRICE_BUSINESS") ?? null,
  },
  pro: {
    label: "Pro",
    price_usd: 99,
    stripe_price_id: Deno.env.get("STRIPE_PRICE_PRO") ?? null,
  },
};

// ── Supabase admin client (service role — bypasses RLS) ──────────────────────

function getAdminClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

// ── Stripe client ─────────────────────────────────────────────────────────────

function getStripe(): Stripe {
  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!key) throw new Error("Missing STRIPE_SECRET_KEY");
  return new Stripe(key, { apiVersion: "2024-06-20" });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status);
}

// ── Auth (P0-3) ─────────────────────────────────────────────────────────────
// verify_jwt is false (required for the Stripe webhook path). The APP path
// (create_checkout) has no signature, so we verify the caller's JWT MANUALLY
// here — same pattern as payments/index.ts. The client sends its JWT via
// supabase.functions.invoke().

/** Verify the caller's JWT. Returns { authUserId } or a 401 Response. */
async function verifyCaller(req: Request): Promise<{ authUserId: string } | Response> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return errorResponse("Missing or invalid Authorization header", 401);
  }
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!anonKey || !supabaseUrl) {
    console.error("[subscriptions] SUPABASE_ANON_KEY or SUPABASE_URL not set");
    return errorResponse("Internal server error", 500);
  }
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return errorResponse("Unauthorized", 401);
  return { authUserId: user.id };
}

/**
 * Resolve the JChat user for a webhook event:
 *   1º metadata.user_id (carried on the checkout session / subscription).
 *   2º users.stripe_customer_id == the event's customer.
 * Returns the user id or null (caller logs + breaks — never throws).
 */
async function resolveUserId(
  db: ReturnType<typeof getAdminClient>,
  metaUserId: string | null | undefined,
  customerId: string | null | undefined,
): Promise<string | null> {
  if (metaUserId) return metaUserId;
  if (customerId) {
    const { data } = await db
      .from("users")
      .select("id")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();
    return (data as { id: string } | null)?.id ?? null;
  }
  return null;
}

/** Map a Stripe subscription status → users.plan_status. */
function mapStripeStatus(
  stripeStatus: string,
): "active" | "trialing" | "past_due" | "canceled" {
  const map: Record<string, "active" | "trialing" | "past_due" | "canceled"> = {
    active: "active",
    trialing: "trialing",
    past_due: "past_due",
    canceled: "canceled",
    unpaid: "past_due",
    incomplete: "past_due",
    incomplete_expired: "canceled",
    paused: "past_due",
  };
  return map[stripeStatus] ?? "past_due";
}

/** customer field (string | object | null) → its id. */
function customerIdOf(
  customer: string | { id: string } | null | undefined,
): string | null {
  if (!customer) return null;
  return typeof customer === "string" ? customer : customer.id;
}

// ── Action: create_checkout (per-user) ─────────────────────────────────────────

async function handleCreateCheckout(
  body: Record<string, unknown>,
  authUserId: string,
): Promise<Response> {
  const planId = typeof body.plan === "string" ? body.plan : null;
  const successUrl = typeof body.success_url === "string"
    ? body.success_url
    : "https://jchat.cloud/dashboard/billing?checkout=success";
  const cancelUrl = typeof body.cancel_url === "string"
    ? body.cancel_url
    : "https://jchat.cloud/dashboard/billing?checkout=cancel";

  if (!planId) return errorResponse("plan is required");
  const plan = PLANS[planId as PlanId];
  if (!plan) return errorResponse(`Unknown plan: ${planId}`);

  const db = getAdminClient();

  // Downgrade to the free plan. If the user has a live Stripe subscription, we schedule
  // its cancellation at PERIOD END (not immediate) so they keep the access they already
  // paid for. When it actually expires, Stripe fires customer.subscription.deleted and
  // the webhook (unchanged) flips them to 'regular'. We do NOT write plan/plan_status
  // here in that case — the access continues until it expires.
  if (plan.price_usd === 0) {
    const { data: row, error: readErr } = await db
      .from("users")
      .select("stripe_subscription_id, plan_renews_at")
      .eq("id", authUserId)
      .maybeSingle();
    if (readErr) return errorResponse(`DB error: ${readErr.message}`, 500);

    const subId =
      (row as { stripe_subscription_id: string | null } | null)?.stripe_subscription_id ?? null;

    if (subId) {
      // Keep paid access until it expires; the webhook does the final regular flip.
      try {
        await getStripe().subscriptions.update(subId, { cancel_at_period_end: true });
      } catch (err) {
        const message = err instanceof Error
          ? err.message
          : "Failed to schedule cancellation at Stripe";
        console.error(`[subscriptions] cancel_at_period_end failed for ${subId}:`, message);
        // Do NOT touch the DB — don't leave the state half-changed.
        return errorResponse(message, 502);
      }
      const effective =
        (row as { plan_renews_at: string | null } | null)?.plan_renews_at ?? null;
      return jsonResponse({ scheduled_cancel: true, effective });
    }

    // No live Stripe subscription (already regular, or an odd state) → reflect free directly.
    const { error } = await db
      .from("users")
      .update({
        plan: "regular",
        plan_status: "active",
        plan_renews_at: null,
        plan_trial_end: null,
        stripe_subscription_id: null,
      })
      .eq("id", authUserId);
    if (error) return errorResponse(`DB error: ${error.message}`, 500);
    return jsonResponse({ downgraded: true });
  }

  if (!plan.stripe_price_id) {
    return errorResponse(
      `No Stripe Price ID configured for plan "${planId}". ` +
        "Set STRIPE_PRICE_VERIFIED / STRIPE_PRICE_BUSINESS / STRIPE_PRICE_PRO in Edge Function secrets.",
      500,
    );
  }

  const stripe = getStripe();

  // Resolve/create the user's Stripe Customer.
  const { data: userRow, error: userErr } = await db
    .from("users")
    .select("stripe_customer_id, plan_trial_end")
    .eq("id", authUserId)
    .maybeSingle();
  if (userErr) return errorResponse(`DB error: ${userErr.message}`, 500);

  let customerId = (userRow as { stripe_customer_id: string | null } | null)?.stripe_customer_id ?? null;
  if (!customerId) {
    const customer = await stripe.customers.create({ metadata: { user_id: authUserId } });
    customerId = customer.id;
    const { error: saveErr } = await db
      .from("users")
      .update({ stripe_customer_id: customerId })
      .eq("id", authUserId);
    if (saveErr) console.error("[subscriptions] failed to save stripe_customer_id:", saveErr);
  }

  // Trial ONLY if the user has never had one (plan_trial_end still null). 30 days.
  const alreadyUsedTrial =
    (userRow as { plan_trial_end: string | null } | null)?.plan_trial_end != null;

  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    mode: "subscription",
    line_items: [{ price: plan.stripe_price_id, quantity: 1 }],
    customer: customerId,
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: { user_id: authUserId, plan: planId },
    subscription_data: {
      metadata: { user_id: authUserId, plan: planId },
      ...(alreadyUsedTrial ? {} : { trial_period_days: 30 }),
    },
  };

  const session = await stripe.checkout.sessions.create(sessionParams);
  return jsonResponse({ url: session.url });
}

// ── Action: create_portal_session (Stripe Customer Portal) ──────────────────────
// Opens the hosted Customer Portal where the user changes plan (with proration),
// updates their card, downloads invoices, or cancels. This only READS
// users.stripe_customer_id and creates a portal session URL — it writes nothing.

async function handleCreatePortalSession(
  body: Record<string, unknown>,
  authUserId: string,
): Promise<Response> {
  const returnUrl = typeof body.return_url === "string"
    ? body.return_url
    : "https://jchat.cloud/dashboard/billing";

  const db = getAdminClient();
  const { data: userRow, error: userErr } = await db
    .from("users")
    .select("stripe_customer_id")
    .eq("id", authUserId)
    .maybeSingle();
  if (userErr) return errorResponse(`DB error: ${userErr.message}`, 500);

  const customerId =
    (userRow as { stripe_customer_id: string | null } | null)?.stripe_customer_id ?? null;
  if (!customerId) {
    // A regular user who never subscribed has no Stripe Customer yet.
    return errorResponse("No billing account yet. Subscribe to a plan first.", 400);
  }

  try {
    const session = await getStripe().billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
    return jsonResponse({ url: session.url });
  } catch (err) {
    // e.g. the Customer Portal is not configured in Stripe → surface the real message.
    const message = err instanceof Error ? err.message : "Failed to open the billing portal";
    console.error(`[subscriptions] create_portal_session failed for user ${authUserId}:`, message);
    return errorResponse(message, 502);
  }
}

// ── Action: webhook (writes users.*) ────────────────────────────────────────────

async function handleWebhook(req: Request): Promise<Response> {
  const stripe = getStripe();
  const db = getAdminClient();

  const rawBody = await req.text();
  const sig = req.headers.get("stripe-signature") ?? "";
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET_SUBS");

  if (!webhookSecret) {
    console.error("[subscriptions webhook] STRIPE_WEBHOOK_SECRET_SUBS is not set — aborting");
    return errorResponse("Webhook secret not configured", 500);
  }

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error("[subscriptions webhook] signature verification failed:", err);
    return errorResponse("Invalid webhook signature", 400);
  }

  console.log(`[subscriptions webhook] event: ${event.type} id=${event.id}`);

  // ── Idempotency guard (FIX #5): INSERT-FIRST + DELETE-ON-ERROR ─────────────
  // Insert event.id first (atomic dedup). A re-delivery of the SAME event (23505)
  // returns 200 without reprocessing. Any other DB error → 500 so Stripe retries.
  // If a handler throws, we DELETE the marker before 500 so the retry reprocesses.
  const { error: dedupErr } = await db
    .from("processed_stripe_events")
    .insert({ event_id: event.id, type: event.type });
  if (dedupErr) {
    if ((dedupErr as { code?: string }).code === "23505") {
      console.log(`[subscriptions webhook] duplicate event ${event.id} — skipping`);
      return jsonResponse({ received: true, duplicate: true });
    }
    console.error(`[subscriptions webhook] dedup insert failed for ${event.id}:`, dedupErr);
    return errorResponse("Internal server error", 500);
  }

  try {
    switch (event.type) {
    // ── Checkout completed → plan activated on the user ──────────────────────
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const customerId = customerIdOf(session.customer);
      const userId = await resolveUserId(db, session.metadata?.user_id, customerId);
      const plan = (session.metadata?.plan as PlanId) ?? "regular";

      if (!userId) {
        console.warn(`checkout.session.completed: cannot resolve user for session ${session.id}`);
        break;
      }

      const stripeSubId =
        typeof session.subscription === "string"
          ? session.subscription
          : session.subscription?.id ?? null;

      let periodEnd: string | null = null;
      let trialEnd: string | null = null;
      let planStatus: "active" | "trialing" = "active";

      if (stripeSubId) {
        try {
          const sub = await stripe.subscriptions.retrieve(stripeSubId);
          periodEnd = new Date(sub.current_period_end * 1000).toISOString();
          trialEnd = sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null;
          planStatus = trialEnd ? "trialing" : "active";
        } catch (err) {
          console.warn("Could not retrieve subscription:", err);
        }
      }

      const upd: Record<string, unknown> = {
        plan,
        plan_status: planStatus,
        plan_trial_end: trialEnd,
        plan_renews_at: periodEnd,
        stripe_subscription_id: stripeSubId,
      };
      if (customerId) upd.stripe_customer_id = customerId;

      await db.from("users").update(upd).eq("id", userId);
      console.log(`[subscriptions] checkout completed: user=${userId} plan=${plan} status=${planStatus}`);
      break;
    }

    // ── Subscription updated (upgrade/downgrade/renew/past_due) ───────────────
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = customerIdOf(sub.customer);
      const userId = await resolveUserId(db, sub.metadata?.user_id, customerId);

      if (!userId) {
        console.warn(`customer.subscription.updated: cannot resolve user for sub ${sub.id}`);
        break;
      }

      const plan = (sub.metadata?.plan as PlanId) ?? "regular";
      const planStatus = mapStripeStatus(sub.status);
      const periodEnd = new Date(sub.current_period_end * 1000).toISOString();
      const trialEnd = sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null;

      const upd: Record<string, unknown> = {
        plan_status: planStatus,
        plan_renews_at: periodEnd,
        plan_trial_end: trialEnd,
        stripe_subscription_id: sub.id,
      };
      // past_due already loses dashboard access via the gate (plan_status). Do NOT
      // downgrade the plan itself — keep what they had. Otherwise apply the plan change.
      if (planStatus !== "past_due") upd.plan = plan;

      await db.from("users").update(upd).eq("id", userId);
      console.log(`[subscriptions] sub updated: user=${userId} plan=${plan} status=${planStatus}`);
      break;
    }

    // ── Subscription deleted / canceled → back to free ───────────────────────
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = customerIdOf(sub.customer);
      const userId = await resolveUserId(db, sub.metadata?.user_id, customerId);

      if (!userId) {
        console.warn(`customer.subscription.deleted: cannot resolve user for sub ${sub.id}`);
        break;
      }

      await db
        .from("users")
        .update({
          plan: "regular",
          plan_status: "active",
          plan_renews_at: null,
          plan_trial_end: null,
          stripe_subscription_id: null,
        })
        .eq("id", userId);
      console.log(`[subscriptions] sub deleted/canceled → regular: user=${userId}`);
      break;
    }

    // ── Payment failed → past_due (Stripe retries on its own; no grace column) ─
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = customerIdOf(invoice.customer);
      const userId = await resolveUserId(db, undefined, customerId);

      if (!userId) {
        console.warn(`invoice.payment_failed: cannot resolve user for invoice ${invoice.id}`);
        break;
      }

      // past_due loses dashboard access (gate), but we do NOT touch which plan they had.
      await db.from("users").update({ plan_status: "past_due" }).eq("id", userId);
      console.log(`[subscriptions] payment failed → past_due: user=${userId}`);
      break;
    }

    // ── Payment recovered → clear past_due + refresh renewal date ─────────────
    case "invoice.payment_succeeded": {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = customerIdOf(invoice.customer);
      const userId = await resolveUserId(db, undefined, customerId);

      if (!userId) {
        console.warn(`invoice.payment_succeeded: cannot resolve user for invoice ${invoice.id}`);
        break;
      }

      const stripeSubId =
        typeof invoice.subscription === "string"
          ? invoice.subscription
          : invoice.subscription?.id ?? null;

      let periodEnd: string | null = null;
      if (stripeSubId) {
        try {
          const sub = await stripe.subscriptions.retrieve(stripeSubId);
          periodEnd = new Date(sub.current_period_end * 1000).toISOString();
        } catch (err) {
          console.warn("Could not retrieve subscription for period end:", err);
        }
      }

      const { data: cur } = await db
        .from("users")
        .select("plan_status")
        .eq("id", userId)
        .maybeSingle();

      const upd: Record<string, unknown> = {};
      if (periodEnd) upd.plan_renews_at = periodEnd;
      if ((cur as { plan_status: string } | null)?.plan_status === "past_due") {
        upd.plan_status = "active";
      }
      if (Object.keys(upd).length > 0) {
        await db.from("users").update(upd).eq("id", userId);
      }
      console.log(`[subscriptions] payment succeeded: user=${userId}`);
      break;
    }

    // ── Trial ending reminder (notification is a separate TODO — log only) ────
    case "customer.subscription.trial_will_end": {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = customerIdOf(sub.customer);
      const userId = await resolveUserId(db, sub.metadata?.user_id, customerId);
      console.log(`[subscriptions] trial ending soon: user=${userId ?? "(unresolved)"}`);
      // TODO(notifications): tell the user their trial ends soon. Not implemented.
      break;
    }

    default:
      console.log(`[subscriptions webhook] unhandled event type: ${event.type}`);
    }
  } catch (err) {
    console.error(`[subscriptions webhook] handler error for ${event.type}:`, err);
    // Roll back the dedup marker so Stripe's retry reprocesses this event.
    await db.from("processed_stripe_events").delete().eq("event_id", event.id);
    return errorResponse("Internal server error", 500);
  }

  return jsonResponse({ received: true });
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request): Promise<Response> => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
      },
    });
  }

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  const contentType = req.headers.get("content-type") ?? "";

  // Stripe webhooks arrive with a stripe-signature header.
  const isWebhook = req.headers.has("stripe-signature");

  if (isWebhook) {
    try {
      return await handleWebhook(req);
    } catch (err) {
      console.error("[subscriptions webhook] error:", err);
      return errorResponse("Internal server error", 500);
    }
  }

  // Everything else is a JSON action call from the client.
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

  try {
    switch (action) {
      case "create_checkout": {
        // APP path (no stripe-signature) — verify the caller's JWT and act on THEIR
        // own user id. No business ownership check: a user subscribes to their own plan.
        const auth = await verifyCaller(req);
        if (auth instanceof Response) return auth;
        return await handleCreateCheckout(body, auth.authUserId);
      }

      case "create_portal_session": {
        // APP path — Stripe Customer Portal (change plan / card / invoices / cancel).
        const auth = await verifyCaller(req);
        if (auth instanceof Response) return auth;
        return await handleCreatePortalSession(body, auth.authUserId);
      }

      default:
        return errorResponse(`Unknown action: ${action ?? "(none)"}`);
    }
  } catch (err) {
    console.error(`[subscriptions] error in action "${action}":`, err);
    return errorResponse("Internal server error", 500);
  }
});
