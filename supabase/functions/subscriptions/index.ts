/**
 * JChat 3.0 — Subscriptions Edge Function (Task 3.15)
 * Runtime: Deno (Supabase Edge Functions)
 *
 * Handles:
 *   POST /subscriptions  { action: "create_checkout", business_id, plan }
 *     → creates a Stripe Checkout Session and returns { url }.
 *
 *   POST /subscriptions  { action: "webhook" }  (raw Stripe webhook body)
 *     → handles Stripe lifecycle events; upserts subscriptions + businesses.
 *
 * Deploy:
 *   supabase functions deploy subscriptions
 *
 * Required env vars (set in Supabase dashboard → Edge Functions → Secrets):
 *   STRIPE_SECRET_KEY         — sk_live_… or sk_test_…
 *   STRIPE_WEBHOOK_SECRET     — whsec_… (from Stripe dashboard webhook config)
 *   SUPABASE_URL              — project URL (auto-injected by Supabase)
 *   SUPABASE_SERVICE_ROLE_KEY — service role key (set manually in secrets)
 *
 * Rule 4 compliance: ALL Stripe API calls happen here (server-side only).
 * The client web page invokes this via supabase.functions.invoke('subscriptions', …).
 */

// ── Deno imports ──────────────────────────────────────────────────────────────
// Using esm.sh CDN for Stripe SDK (Deno-compatible)
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
    // TODO: replace with real Stripe Price ID from your dashboard
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

/** Assert the caller owns the business (or is a platform admin). null = OK; Response = 403/404. */
async function assertOwnerOrAdmin(
  db: ReturnType<typeof getAdminClient>,
  authUserId: string,
  businessId: string,
): Promise<Response | null> {
  const { data: biz, error } = await db
    .from("businesses")
    .select("owner_id")
    .eq("id", businessId)
    .maybeSingle();
  if (error) return errorResponse(`DB error: ${error.message}`, 500);
  if (!biz) return errorResponse("Business not found", 404);
  if (biz.owner_id === authUserId) return null;
  const { data: admin } = await db
    .from("admin_roles")
    .select("user_id")
    .eq("user_id", authUserId)
    .maybeSingle();
  if (admin) return null;
  return errorResponse("Forbidden: not the owner of this business", 403);
}

/** Extract business_id from subscriptions row via stripe_subscription_id. */
async function getBusinessIdByStripeSubId(
  db: ReturnType<typeof getAdminClient>,
  stripeSubId: string,
): Promise<string | null> {
  const { data } = await db
    .from("subscriptions")
    .select("business_id")
    .eq("stripe_subscription_id", stripeSubId)
    .maybeSingle();
  return data?.business_id ?? null;
}

/** Map Stripe subscription status → JChat status */
function mapStripeStatus(
  stripeStatus: string,
): "active" | "past_due" | "suspended" | "trialing" | "canceled" {
  const map: Record<string, "active" | "past_due" | "suspended" | "trialing" | "canceled"> = {
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

// ── Action: create_checkout ───────────────────────────────────────────────────

async function handleCreateCheckout(
  body: Record<string, unknown>,
): Promise<Response> {
  const businessId = typeof body.business_id === "string" ? body.business_id : null;
  const planId = typeof body.plan === "string" ? body.plan : null;
  const successUrl = typeof body.success_url === "string"
    ? body.success_url
    : "https://jchat.app/dashboard/billing?checkout=success";
  const cancelUrl = typeof body.cancel_url === "string"
    ? body.cancel_url
    : "https://jchat.app/dashboard/billing?checkout=cancel";

  if (!businessId) return errorResponse("business_id is required");
  if (!planId) return errorResponse("plan is required");

  const plan = PLANS[planId as PlanId];
  if (!plan) return errorResponse(`Unknown plan: ${planId}`);
  if (plan.price_usd === 0) {
    // Downgrading to free — no Stripe session needed; update directly.
    const db = getAdminClient();
    await db
      .from("subscriptions")
      .upsert(
        {
          business_id: businessId,
          plan: "regular",
          status: "active",
          stripe_subscription_id: null,
          current_period_end: null,
          trial_end: null,
          grace_day: 0,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "business_id" },
      );
    await db
      .from("businesses")
      .update({ plan: "regular" })
      .eq("id", businessId);
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

  // Look up existing Stripe customer for this business (if any)
  const db = getAdminClient();
  const { data: existingSub } = await db
    .from("subscriptions")
    .select("stripe_subscription_id")
    .eq("business_id", businessId)
    .maybeSingle();

  let customerId: string | undefined;
  if (existingSub?.stripe_subscription_id) {
    try {
      const sub = await stripe.subscriptions.retrieve(
        existingSub.stripe_subscription_id,
      );
      customerId = typeof sub.customer === "string"
        ? sub.customer
        : sub.customer.id;
    } catch {
      // Subscription may no longer exist in Stripe — proceed without customer
    }
  }

  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    mode: "subscription",
    line_items: [{ price: plan.stripe_price_id, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    // Pass business_id through metadata so the webhook can identify the record
    metadata: { business_id: businessId, plan: planId },
    subscription_data: {
      metadata: { business_id: businessId, plan: planId },
      // 7-day free trial on first subscription
      trial_period_days: existingSub ? undefined : 7,
    },
    ...(customerId ? { customer: customerId } : {}),
  };

  const session = await stripe.checkout.sessions.create(sessionParams);
  return jsonResponse({ url: session.url });
}

// ── Action: webhook ───────────────────────────────────────────────────────────

async function handleWebhook(req: Request): Promise<Response> {
  const stripe = getStripe();
  const db = getAdminClient();

  const rawBody = await req.text();
  const sig = req.headers.get("stripe-signature") ?? "";
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

  if (!webhookSecret) {
    console.error("[subscriptions webhook] STRIPE_WEBHOOK_SECRET is not set — aborting");
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
  // Insert event.id first (atomic dedup). If it already exists (23505 = re-delivery
  // of the SAME event), return 200 without reprocessing — this is what prevents the
  // grace_day +1 from double-counting on webhook re-delivery. Genuine cobro retries
  // arrive as DISTINCT event.ids and are still counted. Any other DB error → 500 so
  // Stripe retries. If a handler throws, we DELETE the marker before 500 so the retry
  // reprocesses.
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
    // ── Checkout completed → subscription activated ──────────────────────────
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const businessId = session.metadata?.business_id;
      const plan = (session.metadata?.plan as PlanId) ?? "regular";

      if (!businessId) {
        console.warn("checkout.session.completed: missing business_id in metadata");
        break;
      }

      // Retrieve the subscription to get period_end and trial_end
      const stripeSubId =
        typeof session.subscription === "string"
          ? session.subscription
          : session.subscription?.id ?? null;

      let periodEnd: string | null = null;
      let trialEnd: string | null = null;

      if (stripeSubId) {
        try {
          const sub = await stripe.subscriptions.retrieve(stripeSubId);
          periodEnd = new Date(sub.current_period_end * 1000).toISOString();
          trialEnd = sub.trial_end
            ? new Date(sub.trial_end * 1000).toISOString()
            : null;
        } catch (err) {
          console.warn("Could not retrieve subscription:", err);
        }
      }

      await db.from("subscriptions").upsert(
        {
          business_id: businessId,
          stripe_subscription_id: stripeSubId,
          plan,
          status: trialEnd ? "trialing" : "active",
          current_period_end: periodEnd,
          trial_end: trialEnd,
          grace_day: 0,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "business_id" },
      );

      await db
        .from("businesses")
        .update({ plan, status: "active" })
        .eq("id", businessId);

      console.log(`[subscriptions] checkout completed: business=${businessId} plan=${plan}`);
      break;
    }

    // ── Subscription updated (upgrade/downgrade/renew) ───────────────────────
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const businessId = sub.metadata?.business_id ??
        (await getBusinessIdByStripeSubId(db, sub.id));

      if (!businessId) {
        console.warn(`customer.subscription.updated: cannot resolve business for sub ${sub.id}`);
        break;
      }

      const plan = (sub.metadata?.plan as PlanId) ?? "regular";
      const status = mapStripeStatus(sub.status);
      const periodEnd = new Date(sub.current_period_end * 1000).toISOString();
      const trialEnd = sub.trial_end
        ? new Date(sub.trial_end * 1000).toISOString()
        : null;

      await db.from("subscriptions").upsert(
        {
          business_id: businessId,
          stripe_subscription_id: sub.id,
          plan,
          status,
          current_period_end: periodEnd,
          trial_end: trialEnd,
          grace_day: 0, // reset on successful update
          updated_at: new Date().toISOString(),
        },
        { onConflict: "business_id" },
      );

      await db
        .from("businesses")
        .update({ plan, status: status === "suspended" ? "suspended" : "active" })
        .eq("id", businessId);

      console.log(`[subscriptions] sub updated: business=${businessId} plan=${plan} status=${status}`);
      break;
    }

    // ── Subscription deleted / canceled ──────────────────────────────────────
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const businessId = sub.metadata?.business_id ??
        (await getBusinessIdByStripeSubId(db, sub.id));

      if (!businessId) break;

      await db.from("subscriptions").upsert(
        {
          business_id: businessId,
          stripe_subscription_id: sub.id,
          plan: "regular",
          status: "canceled",
          current_period_end: null,
          trial_end: null,
          grace_day: 0,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "business_id" },
      );

      await db
        .from("businesses")
        .update({ plan: "regular", status: "active" })
        .eq("id", businessId);

      console.log(`[subscriptions] sub deleted/canceled: business=${businessId}`);
      break;
    }

    // ── Payment failed → 3-day grace period ──────────────────────────────────
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const stripeSubId =
        typeof invoice.subscription === "string"
          ? invoice.subscription
          : invoice.subscription?.id ?? null;

      if (!stripeSubId) break;

      const businessId = await getBusinessIdByStripeSubId(db, stripeSubId);
      if (!businessId) break;

      // Fetch current grace_day
      const { data: currentSub } = await db
        .from("subscriptions")
        .select("grace_day")
        .eq("business_id", businessId)
        .maybeSingle();

      const prevGraceDay = currentSub?.grace_day ?? 0;
      const newGraceDay = prevGraceDay + 1;

      // Day 3 → suspend the business
      const isSuspended = newGraceDay >= 3;
      const newStatus = isSuspended ? "suspended" : "past_due";

      await db.from("subscriptions").upsert(
        {
          business_id: businessId,
          stripe_subscription_id: stripeSubId,
          status: newStatus,
          grace_day: newGraceDay,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "business_id" },
      );

      if (isSuspended) {
        await db
          .from("businesses")
          .update({ status: "suspended" })
          .eq("id", businessId);
        console.log(`[subscriptions] business suspended (Day 3): business=${businessId}`);
      } else {
        console.log(`[subscriptions] payment failed grace Day ${newGraceDay}: business=${businessId}`);
      }

      // TODO(notifications): send push/email reminder for each grace day.
      // Day 1: "Payment failed — please update your payment method (2 days left)."
      // Day 2: "Last warning — account suspends tomorrow if payment is not resolved."
      // Day 3: "Your JChat listing has been suspended. Update payment to restore."
      // Example stub:
      // await sendBusinessNotification(businessId, `grace_day_${newGraceDay}`);

      break;
    }

    // ── Payment recovered → restore business ─────────────────────────────────
    case "invoice.payment_succeeded": {
      const invoice = event.data.object as Stripe.Invoice;
      const stripeSubId =
        typeof invoice.subscription === "string"
          ? invoice.subscription
          : invoice.subscription?.id ?? null;

      if (!stripeSubId) break;

      const businessId = await getBusinessIdByStripeSubId(db, stripeSubId);
      if (!businessId) break;

      // Only act if the business was previously suspended / past_due
      const { data: currentSub } = await db
        .from("subscriptions")
        .select("status, grace_day, plan")
        .eq("business_id", businessId)
        .maybeSingle();

      if (
        currentSub?.status === "suspended" ||
        currentSub?.status === "past_due" ||
        (currentSub?.grace_day ?? 0) > 0
      ) {
        await db.from("subscriptions").upsert(
          {
            business_id: businessId,
            stripe_subscription_id: stripeSubId,
            status: "active",
            grace_day: 0,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "business_id" },
        );

        await db
          .from("businesses")
          .update({ status: "active" })
          .eq("id", businessId);

        console.log(`[subscriptions] payment recovered, business restored: business=${businessId}`);

        // TODO(notifications): send "Your account has been restored" notification.
      }
      break;
    }

    // ── Trial ending reminders ────────────────────────────────────────────────
    case "customer.subscription.trial_will_end": {
      const sub = event.data.object as Stripe.Subscription;
      const businessId = sub.metadata?.business_id ??
        (await getBusinessIdByStripeSubId(db, sub.id));

      if (!businessId) break;

      // Stripe fires this 3 days before trial ends.
      // TODO(notifications): send "Your trial ends in 3 days" + 1-day-before reminder.
      // The 1-day reminder requires a scheduled pg_cron or separate webhook event.
      console.log(`[subscriptions] trial ending soon: business=${businessId}`);
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

  // Stripe webhooks arrive as application/json with a stripe-signature header
  const isWebhook = req.headers.has("stripe-signature");

  if (isWebhook) {
    try {
      return await handleWebhook(req);
    } catch (err) {
      console.error("[subscriptions webhook] error:", err);
      return errorResponse("Internal server error", 500);
    }
  }

  // Everything else is a JSON action call from the dashboard
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
        // ── P0-3: APP path (no stripe-signature) — verify JWT + ownership
        // BEFORE creating a checkout OR running the free-plan downgrade. ──
        const businessId = typeof body.business_id === "string" ? body.business_id : null;
        if (!businessId) return errorResponse("business_id is required");
        const auth = await verifyCaller(req);
        if (auth instanceof Response) return auth;
        const ownerCheck = await assertOwnerOrAdmin(getAdminClient(), auth.authUserId, businessId);
        if (ownerCheck) return ownerCheck;
        return await handleCreateCheckout(body);
      }

      default:
        return errorResponse(`Unknown action: ${action ?? "(none)"}`);
    }
  } catch (err) {
    console.error(`[subscriptions] error in action "${action}":`, err);
    return errorResponse("Internal server error", 500);
  }
});
