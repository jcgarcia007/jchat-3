/**
 * JChat 3.0 — Stripe Connect Edge Function (Task 3.6 / referenced by Task 2.1)
 * Runtime: Deno (Supabase Edge Functions)
 *
 * RULE 4 COMPLIANCE: Stripe API keys live only here. No Stripe calls on the client.
 *
 * Actions (POST body: { action, ...params }):
 *   create_connect_account  — create a Stripe Express account for a business,
 *                             save businesses.stripe_account_id, return onboarding URL.
 *   get_account_status      — retrieve Stripe Connect account details/status.
 *   create_login_link       — generate a Stripe Express dashboard login link.
 *
 * Deploy:
 *   supabase functions deploy stripe-connect
 *
 * Required env vars (Supabase dashboard → Edge Functions → Secrets):
 *   STRIPE_SECRET_KEY         — sk_live_… or sk_test_…
 *   SUPABASE_URL              — auto-injected
 *   SUPABASE_SERVICE_ROLE_KEY — set manually
 *   CONNECT_RETURN_URL        — URL user lands on after onboarding (e.g. https://jchat.app/dashboard/billing)
 *   CONNECT_REFRESH_URL       — URL if onboarding link expires (re-trigger onboarding)
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

/** Email lives in auth.users, not public.users — fetch via the admin API. */
async function userEmail(db: ReturnType<typeof getAdminClient>, userId: string): Promise<string | undefined> {
  const { data } = await db.auth.admin.getUserById(userId);
  return data.user?.email ?? undefined;
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

// ── Auth (P0-3) ─────────────────────────────────────────────────────────────
// Same JWT-verification pattern as payments/index.ts. The client calls this
// function via supabase.functions.invoke(), which forwards the user's JWT in the
// Authorization header. We read it, verify it, and use ONLY the verified user id.

/** Verify the caller's JWT. Returns { authUserId } or a 401 Response. */
async function verifyCaller(req: Request): Promise<{ authUserId: string } | Response> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return errorResponse("Missing or invalid Authorization header", 401);
  }
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!anonKey || !supabaseUrl) {
    console.error("[stripe-connect] SUPABASE_ANON_KEY or SUPABASE_URL not set");
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

// ── Action: create_connect_account ────────────────────────────────────────────
// Idempotent: if business already has stripe_account_id, creates a new account
// link (re-starts onboarding if not fully completed) rather than a new account.

async function handleCreateConnectAccount(
  body: Record<string, unknown>,
): Promise<Response> {
  const businessId = typeof body.business_id === "string" ? body.business_id : null;
  const email = typeof body.email === "string" ? body.email : null;
  const businessName = typeof body.business_name === "string" ? body.business_name : null;
  const country = typeof body.country === "string" ? body.country : "US";

  if (!businessId) return errorResponse("business_id is required");

  const db = getAdminClient();
  const stripe = getStripe();

  // Look up existing business record
  const { data: business, error: bizErr } = await db
    .from("businesses")
    .select("id, stripe_account_id, name, owner_id")
    .eq("id", businessId)
    .maybeSingle();

  if (bizErr) return errorResponse(`DB error: ${bizErr.message}`, 500);
  if (!business) return errorResponse("Business not found", 404);

  let accountId = business.stripe_account_id as string | null;

  // Create a new Express account if one doesn't exist yet
  if (!accountId) {
    // Owner email comes from auth.users (public.users/businesses have no email).
    const ownerEmail =
      email ??
      (business.owner_id ? await userEmail(db, business.owner_id as string) : undefined);
    const account = await stripe.accounts.create({
      type: "express",
      country,
      email: ownerEmail,
      business_type: "company",
      business_profile: {
        name: businessName ?? business.name ?? undefined,
        // TODO: map JChat business category to Stripe MCC code
      },
      metadata: { supabase_business_id: businessId },
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
    }, { idempotencyKey: `connect:${businessId}` });

    accountId = account.id;

    // Persist to businesses table
    const { error: updateErr } = await db
      .from("businesses")
      .update({ stripe_account_id: accountId })
      .eq("id", businessId);

    if (updateErr) {
      console.error("[stripe-connect] failed to save stripe_account_id:", updateErr);
      // Still proceed — operator can manually set it in the dashboard
    }
  }

  // Generate an Account Link for onboarding (or re-onboarding if incomplete)
  const returnUrl =
    Deno.env.get("CONNECT_RETURN_URL") ??
    `https://jchat.app/dashboard/billing?connect=success&business_id=${businessId}`;
  const refreshUrl =
    Deno.env.get("CONNECT_REFRESH_URL") ??
    `https://jchat.app/dashboard/billing?connect=refresh&business_id=${businessId}`;

  const accountLink = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: "account_onboarding",
  });

  return jsonResponse({
    account_id: accountId,
    onboarding_url: accountLink.url,
    expires_at: accountLink.expires_at,
  });
}

// ── Action: get_account_status ────────────────────────────────────────────────

async function handleGetAccountStatus(
  body: Record<string, unknown>,
): Promise<Response> {
  const businessId = typeof body.business_id === "string" ? body.business_id : null;
  if (!businessId) return errorResponse("business_id is required");

  const db = getAdminClient();
  const stripe = getStripe();

  const { data: business, error: bizErr } = await db
    .from("businesses")
    .select("stripe_account_id")
    .eq("id", businessId)
    .maybeSingle();

  if (bizErr) return errorResponse(`DB error: ${bizErr.message}`, 500);
  if (!business?.stripe_account_id) {
    return jsonResponse({ onboarded: false, account_id: null });
  }

  const account = await stripe.accounts.retrieve(business.stripe_account_id);

  return jsonResponse({
    onboarded: account.details_submitted && account.charges_enabled,
    details_submitted: account.details_submitted,
    charges_enabled: account.charges_enabled,
    payouts_enabled: account.payouts_enabled,
    account_id: account.id,
  });
}

// ── Action: create_login_link ─────────────────────────────────────────────────
// Generates a Stripe Express dashboard link for the business owner.

async function handleCreateLoginLink(
  body: Record<string, unknown>,
): Promise<Response> {
  const businessId = typeof body.business_id === "string" ? body.business_id : null;
  if (!businessId) return errorResponse("business_id is required");

  const db = getAdminClient();
  const stripe = getStripe();

  const { data: business, error: bizErr } = await db
    .from("businesses")
    .select("stripe_account_id")
    .eq("id", businessId)
    .maybeSingle();

  if (bizErr) return errorResponse(`DB error: ${bizErr.message}`, 500);
  if (!business?.stripe_account_id) {
    return errorResponse("Business has no connected Stripe account", 404);
  }

  // TODO(payouts): To update payout schedule, call:
  //   stripe.accounts.update(accountId, { settings: { payouts: { schedule: { interval: 'daily' } } } })
  // Expose as a separate action when dashboard payout settings UI is built.

  const loginLink = await stripe.accounts.createLoginLink(business.stripe_account_id);

  return jsonResponse({ url: loginLink.url });
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request): Promise<Response> => {
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
  const businessId = typeof body.business_id === "string" ? body.business_id : null;
  if (!businessId) return errorResponse("business_id is required");

  // ── P0-3: verify the caller's JWT + business ownership BEFORE any action ──
  const auth = await verifyCaller(req);
  if (auth instanceof Response) return auth;
  const ownerCheck = await assertOwnerOrAdmin(getAdminClient(), auth.authUserId, businessId);
  if (ownerCheck) return ownerCheck;

  try {
    switch (action) {
      case "create_connect_account":
        return await handleCreateConnectAccount(body);
      case "get_account_status":
        return await handleGetAccountStatus(body);
      case "create_login_link":
        return await handleCreateLoginLink(body);
      default:
        return errorResponse(`Unknown action: ${action ?? "(none)"}`);
    }
  } catch (err) {
    console.error(`[stripe-connect] error in action "${action}":`, err);
    return errorResponse("Internal server error", 500);
  }
});
