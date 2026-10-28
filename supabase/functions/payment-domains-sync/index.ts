/**
 * JChat 3.0 — payment-domains-sync Edge Function
 * Runtime: Deno (Supabase Edge Functions)
 *
 * Registers every verified venue's domain (<subdomain||slug>.jchat.cloud) as a Stripe PAYMENT METHOD DOMAIN, so Apple Pay / Google Pay can
 * show in Elements on that venue's page. The decisions live in _shared/paymentDomains.ts (pure, tested in Node); this file only wires
 * auth, the venue query and the Stripe client.
 *
 * ACCESS: no public access. JWT verification is off (config.toml), and every POST must carry EITHER
 *   x-push-secret = PUSH_WEBHOOK_SECRET   (the database, through pg_net: migration 247's hourly cron), OR
 *   Authorization: Bearer <SB_SECRET_KEY> (the project's secret key = service role, for running it by hand).
 *
 * BODY (all optional):  { "business_id": "<uuid>", "scope": "platform" | "connected" | "both", "after": "<business uuid>" }
 *   scope defaults to 'platform' (what Stripe documents for destination charges: register on the platform, no Stripe-Account header).
 *   'connected' / 'both' register on the venue's connected account too (Stripe-Account header) and are only used on explicit request.
 *   At most 50 venues per call; `next` in the answer is the `after` for the following call (null = done).
 *
 * ANSWER: per venue and per account → registered | already_registered | validated | disabled | error, plus Stripe's own
 *   apple_pay / google_pay status ('active' | 'inactive'). `enabled: true` is NOT the same as an active wallet: read the statuses.
 * It is idempotent (lists before creating) and never logs or returns a key: errors are redacted.
 *
 * Deploy (NOT yet — waiting for the iPhone diagnostic):
 *   supabase functions deploy payment-domains-sync --project-ref klfsgcfoahdtkojyqspd --no-verify-jwt
 * Required secrets: PUSH_WEBHOOK_SECRET, STRIPE_SECRET_KEY (SUPABASE_URL / SB_SECRET_KEY are injected).
 */

import Stripe from "npm:stripe@16.2.0";
import { createAdminClient, getSecretKey } from "../_shared/supabaseAdmin.ts";
import {
  MAX_VENUES_PER_CALL,
  type PmdApi,
  type VenueRow,
  isAuthorized,
  isUuid,
  pageOf,
  parseScope,
  redact,
  syncVenues,
} from "../_shared/paymentDomains.ts";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function stripePmdApi(): PmdApi {
  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!key) throw new Error("Missing STRIPE_SECRET_KEY");
  const stripe = new Stripe(key, { apiVersion: "2024-06-20" });
  return {
    list: (params, opts) => stripe.paymentMethodDomains.list(params, opts) as unknown as ReturnType<PmdApi["list"]>,
    create: (params, opts) => stripe.paymentMethodDomains.create(params, opts) as unknown as ReturnType<PmdApi["create"]>,
    validate: (id, opts) => stripe.paymentMethodDomains.validate(id, {}, opts) as unknown as ReturnType<PmdApi["validate"]>,
  };
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  if (!isAuthorized(req.headers, { pushSecret: Deno.env.get("PUSH_WEBHOOK_SECRET") ?? "", secretKey: getSecretKey() ?? "" })) {
    return json({ error: "Unauthorized" }, 401);
  }

  let body: { business_id?: unknown; scope?: unknown; after?: unknown } = {};
  try {
    const text = await req.text();
    if (text.trim()) body = JSON.parse(text);
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const scope = parseScope(body.scope);
  if (!scope) return json({ error: "scope must be platform, connected or both" }, 400);
  if (body.business_id !== undefined && !isUuid(body.business_id)) return json({ error: "business_id must be a uuid" }, 400);
  if (body.after !== undefined && !isUuid(body.after)) return json({ error: "after must be a uuid" }, 400);

  try {
    const db = createAdminClient();
    let query = db
      .from("businesses")
      .select("id, slug, subdomain, stripe_account_id")
      .eq("status", "verified")
      .not("stripe_account_id", "is", null)
      .order("id", { ascending: true })
      .limit(MAX_VENUES_PER_CALL + 1);
    if (body.business_id) query = query.eq("id", body.business_id);
    if (body.after) query = query.gt("id", body.after);
    const { data, error } = await query;
    if (error) throw error;

    const { venues, next } = pageOf((data ?? []) as VenueRow[]);
    const results = await syncVenues(stripePmdApi(), venues, scope);
    const failed = results.filter((r) => r.platform?.result === "error" || r.connected?.result === "error").length;
    // ids and counts only: no keys, no account ids, nothing of the customers
    console.log(`[payment-domains-sync] scope=${scope} venues=${results.length} errors=${failed} next=${next ?? "none"}`);
    return json({ ok: failed === 0, scope, count: results.length, next, results });
  } catch (err) {
    console.error("[payment-domains-sync] failed:", redact((err as { message?: unknown })?.message));
    return json({ error: "sync_failed" }, 500);
  }
});
