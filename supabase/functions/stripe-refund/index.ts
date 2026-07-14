/**
 * JChat 3.0 — Stripe Refund Edge Function
 * Runtime: Deno (Supabase Edge Functions)
 *
 * Issues a REAL Stripe refund for a dispute. Before this function, the dashboard
 * "Approve Refund" button only wrote status='approved' to the DB and moved no
 * money — the owner believed they had refunded the customer when nothing happened.
 *
 * Decisions (Juan):
 *   - The BUSINESS OWNER approves (no super_admin needed). Ownership is enforced
 *     here in the function (service_role bypasses RLS, so the gate is explicit).
 *   - The money comes out of the CONNECTED ACCOUNT's balance, not the platform's:
 *     reverse_transfer:true + refund_application_fee:true. The integration uses
 *     destination charges + on_behalf_of (see payments/index.ts) — without these
 *     two flags the refund would come out of the PLATFORM balance.
 *
 * Input (POST, JWT required):
 *   { dispute_id: string, amount_cents: number, resolution?: string }
 *
 * Idempotency: idempotencyKey `refund:<dispute_id>` — one dispute = one refund,
 * ever. The dispute.refund_id guard is the second line of double-refund defense.
 *
 * Required secrets: STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *   SUPABASE_ANON_KEY.
 *
 * Deploy: supabase functions deploy stripe-refund
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
 * Verify the caller's JWT (same pattern as payments/subscriptions). Returns
 * { authUserId } or a 401/500 Response. authUserId is the ONLY trusted identity —
 * body.user_id must never be used for auth.
 */
async function verifyCaller(req: Request): Promise<{ authUserId: string } | Response> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return errorResponse("Missing or invalid Authorization header", 401);
  }
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!anonKey || !supabaseUrl) {
    console.error("[stripe-refund] SUPABASE_ANON_KEY or SUPABASE_URL not set");
    return errorResponse("Internal server error", 500);
  }
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return errorResponse("Unauthorized", 401);
  return { authUserId: user.id };
}

interface RefundBody {
  dispute_id?: unknown;
  amount_cents?: unknown;
  resolution?: unknown;
}

async function handleRefund(body: RefundBody, authUserId: string): Promise<Response> {
  const disputeId = typeof body.dispute_id === "string" ? body.dispute_id.trim() : "";
  if (!disputeId) return errorResponse("dispute_id is required", 400);

  const amountCents = body.amount_cents;
  // Validated fully in the state guards below (after we know order.total_cents).

  const db = getAdminClient();

  // 2. Load dispute → order → business (service_role; the ownership gate is explicit below).
  const { data: dispute, error: dErr } = await db
    .from("disputes")
    .select("id, status, refund_id, amount_cents, order_id")
    .eq("id", disputeId)
    .maybeSingle();
  if (dErr) return errorResponse(`DB error: ${dErr.message}`, 500);
  if (!dispute) return errorResponse("Dispute not found", 404);

  const { data: order, error: oErr } = await db
    .from("orders")
    .select("id, stripe_pi_id, total_cents, business_id")
    .eq("id", dispute.order_id)
    .maybeSingle();
  if (oErr) return errorResponse(`DB error: ${oErr.message}`, 500);
  if (!order) return errorResponse("Order not found for this dispute", 404);

  const { data: business, error: bErr } = await db
    .from("businesses")
    .select("id, owner_id, stripe_account_id")
    .eq("id", order.business_id)
    .maybeSingle();
  if (bErr) return errorResponse(`DB error: ${bErr.message}`, 500);
  if (!business) return errorResponse("Business not found for this dispute", 404);

  // 3. AUTHORIZATION — the business owner, verified via JWT. RLS is bypassed here.
  if (business.owner_id !== authUserId) {
    return errorResponse("You are not the owner of this business", 403);
  }

  // 4. STATE GUARDS (each before touching Stripe).
  if (dispute.refund_id !== null && dispute.refund_id !== undefined) {
    // Double-refund protection. Critical.
    return errorResponse("This dispute has already been refunded", 409);
  }
  if (dispute.status !== "open" && dispute.status !== "escalated") {
    return errorResponse("This dispute is not open", 409);
  }
  if (!order.stripe_pi_id) {
    return errorResponse("This order has no payment to refund", 409);
  }
  if (typeof amountCents !== "number" || !Number.isInteger(amountCents) || amountCents <= 0) {
    return errorResponse("Invalid refund amount", 400);
  }
  if (amountCents > order.total_cents) {
    return errorResponse("Refund cannot exceed the order total", 400);
  }

  // 5. STRIPE — reverse_transfer + refund_application_fee are MANDATORY: with
  //    destination charges, the money must come back from the connected account,
  //    not the platform balance.
  const stripe = getStripe();
  let refund: Stripe.Refund;
  try {
    refund = await stripe.refunds.create(
      {
        payment_intent: order.stripe_pi_id,
        amount: amountCents,
        reverse_transfer: true,       // money returns FROM the connected business
        refund_application_fee: true, // also returns the platform fee
        metadata: { dispute_id: disputeId, order_id: order.id, business_id: business.id },
      },
      { idempotencyKey: `refund:${disputeId}` }, // one dispute = one refund, never two
    );
  } catch (err) {
    // e.g. insufficient balance on the connected account. Do NOT touch the DB —
    // leave the dispute open so the owner can retry. Return Stripe's message.
    const message = err instanceof Error ? err.message : "Refund failed at Stripe";
    console.error(`[stripe-refund] Stripe refund failed for dispute ${disputeId}:`, message);
    return errorResponse(message, 402);
  }

  // 6. Only after Stripe returned OK, update the dispute (service_role).
  //    'refunded' is set later by the charge.refunded webhook when Stripe confirms.
  const resolutionText =
    typeof body.resolution === "string" && body.resolution.trim().length > 0
      ? body.resolution.trim()
      : `Refund of ${amountCents} cents approved by owner.`;

  const { error: updErr } = await db
    .from("disputes")
    .update({
      status: "approved",
      refund_id: refund.id,
      amount_cents: amountCents,
      resolution: resolutionText,
      updated_at: new Date().toISOString(),
    })
    .eq("id", disputeId);

  if (updErr) {
    // The refund DID go through at Stripe. Log loudly; the charge.refunded webhook
    // will still flip status to 'refunded'. A retry is safe: the refund_id guard
    // (or Stripe's idempotency key) prevents a second refund.
    console.error(
      `[stripe-refund] refund ${refund.id} succeeded but DB update failed for dispute ${disputeId}:`,
      updErr,
    );
    return errorResponse("Refund issued but failed to record it; please refresh", 500);
  }

  console.log(
    `[stripe-refund] refunded dispute=${disputeId} order=${order.id} amount=${amountCents} refund=${refund.id}`,
  );

  return jsonResponse({ refund_id: refund.id, amount_cents: amountCents, status: "approved" });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  let body: RefundBody;
  try { body = await req.json(); } catch { return errorResponse("Invalid JSON body"); }

  const auth = await verifyCaller(req);
  if (auth instanceof Response) return auth;

  try {
    return await handleRefund(body, auth.authUserId);
  } catch (err) {
    console.error("[stripe-refund] error:", err);
    return errorResponse("Internal server error", 500);
  }
});
