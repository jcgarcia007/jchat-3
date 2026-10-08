/**
 * JChat 3.0 — gift-worker Edge Function (migration 202)
 * Runtime: Deno (Supabase Edge Functions)
 *
 * Called ONLY by the database (trigger trg_gift_offer_dispatch → pg_net) when a gift offer changes to
 * accepted | declined | expired | cancelled. JWT verification is off, so every POST must carry
 * x-push-secret matching PUSH_WEBHOOK_SECRET (same pattern as send-push).
 *
 *   accepted                          → capture the held PaymentIntent (only if it is 'requires_capture')
 *   declined | expired | cancelled    → cancel the PaymentIntent (nothing is ever charged)
 *
 * Decisions use the offer's CURRENT status read from the database, never the request body (the body is
 * only a hint and must match the offer's PaymentIntent). Idempotent: a PaymentIntent that is no longer
 * in the state the action needs is left alone and the call still answers 200. Card data never passes
 * through here and nothing about the customer is logged — only offer id, PaymentIntent id and the action.
 *
 * Deploy:
 *   supabase functions deploy gift-worker --project-ref klfsgcfoahdtkojyqspd --no-verify-jwt
 *
 * Required secrets: PUSH_WEBHOOK_SECRET, STRIPE_SECRET_KEY (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected).
 */

import Stripe from "npm:stripe@16.2.0";
import { createAdminClient } from "../_shared/supabaseAdmin.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CANCEL_STATUSES = ["declined", "expired", "cancelled"];
/** PaymentIntent states in which cancel is meaningful (anything else is already final/processing). */
const CANCELABLE_PI = ["requires_capture", "requires_payment_method", "requires_confirmation", "requires_action"];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** Constant-time comparison so the secret can't be probed by timing. */
function secretsMatch(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

function getAdminClient() {
  return createAdminClient();
}

function getStripe(): Stripe {
  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!key) throw new Error("Missing STRIPE_SECRET_KEY");
  return new Stripe(key, { apiVersion: "2024-06-20" });
}

/** One retry for transient Stripe/network failures (the trigger fires only once). */
async function withOneRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const type = (err as { type?: string })?.type;
    const transient = type === "StripeConnectionError" || type === "StripeAPIError" || type === "StripeRateLimitError";
    if (!transient) throw err;
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return await fn();
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const expected = Deno.env.get("PUSH_WEBHOOK_SECRET") ?? "";
  const provided = req.headers.get("x-push-secret") ?? "";
  if (!expected || !secretsMatch(provided, expected)) return json({ error: "Unauthorized" }, 401);

  let body: { gift_offer_id?: unknown; status?: unknown; stripe_pi_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const offerId = typeof body.gift_offer_id === "string" ? body.gift_offer_id : "";
  const piId = typeof body.stripe_pi_id === "string" ? body.stripe_pi_id : "";
  if (!UUID_RE.test(offerId) || !piId.startsWith("pi_")) return json({ error: "Invalid payload" }, 400);

  try {
    const db = getAdminClient();
    const { data: offer, error } = await db
      .from("gift_offers")
      .select("id, status, stripe_pi_id")
      .eq("id", offerId)
      .maybeSingle();
    if (error) throw error;
    if (!offer) return json({ error: "gift_not_found" }, 404);
    // The PaymentIntent we act on is the one stored on the offer, and it must be the one we were told about.
    if (offer.stripe_pi_id !== piId) return json({ error: "pi_mismatch" }, 409);

    const stripe = getStripe();
    const pi = await withOneRetry(() => stripe.paymentIntents.retrieve(piId));

    if (offer.status === "accepted") {
      // Capture ONLY a held PaymentIntent of an accepted offer.
      if (pi.status !== "requires_capture") {
        console.log(`[gift-worker] capture skipped: offer=${offerId} pi=${piId} pi_status=${pi.status}`);
        return json({ ok: true, action: "none", reason: `pi_${pi.status}` });
      }
      await withOneRetry(() => stripe.paymentIntents.capture(piId, {}, { idempotencyKey: `gift-capture:${offerId}` }));
      console.log(`[gift-worker] captured: offer=${offerId} pi=${piId}`);
      return json({ ok: true, action: "captured" });
    }

    if (CANCEL_STATUSES.includes(offer.status as string)) {
      if (!CANCELABLE_PI.includes(pi.status)) {
        console.log(`[gift-worker] cancel skipped: offer=${offerId} pi=${piId} pi_status=${pi.status}`);
        return json({ ok: true, action: "none", reason: `pi_${pi.status}` });
      }
      await withOneRetry(() =>
        stripe.paymentIntents.cancel(piId, { cancellation_reason: "requested_by_customer" }, { idempotencyKey: `gift-cancel:${offerId}` })
      );
      console.log(`[gift-worker] cancelled: offer=${offerId} pi=${piId} offer_status=${offer.status}`);
      return json({ ok: true, action: "cancelled" });
    }

    // held / paid / failed / draft…: nothing to do (the status moved on).
    return json({ ok: true, action: "none", reason: `offer_${offer.status}` });
  } catch (err) {
    // Only the error type/code is logged — never the object (it can carry request details).
    const e = err as { type?: string; code?: string };
    console.error(`[gift-worker] failed: offer=${offerId} pi=${piId} type=${e?.type ?? "error"} code=${e?.code ?? ""}`);
    return json({ error: "Internal server error" }, 502);
  }
});
