/**
 * JChat 3.0 — Match photo moderation Edge Function
 * Runtime: Deno (Supabase Edge Functions)
 *
 * Called only by the database through pg_net (trigger + retry cron of migration 193).
 * JWT verification is disabled, so every POST must provide x-push-secret matching
 * PUSH_WEBHOOK_SECRET (same secret as send-push).
 *
 * Deploy:
 *   supabase functions deploy moderate-match-photo --project-ref klfsgcfoahdtkojyqspd --no-verify-jwt
 *
 * Required secrets:
 *   PUSH_WEBHOOK_SECRET       — shared with the database trigger
 *   GOOGLE_VISION_API_KEY     — Google Cloud Vision (never logged)
 *   SUPABASE_URL              — auto-injected by Supabase Edge Functions
 *   SB_SECRET_KEY — auto-injected by Supabase Edge Functions
 *
 * Idempotent: a row that is no longer 'pending' or already has moderated_at is left untouched.
 * If Vision fails (or no key), the row is NOT changed and 500 is returned; the cron of 193 retries.
 */

import { createAdminClient } from "../_shared/supabaseAdmin.ts";

const BUCKET = "match-photos";
const VISION_URL = "https://vision.googleapis.com/v1/images:annotate";
const VISION_TIMEOUT_MS = 15_000;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, x-push-secret",
};

const LIKELIHOOD = ["UNKNOWN", "VERY_UNLIKELY", "UNLIKELY", "POSSIBLE", "LIKELY", "VERY_LIKELY"] as const;
type Likelihood = typeof LIKELIHOOD[number];

interface SafeSearch {
  adult: Likelihood;
  racy: Likelihood;
  violence: Likelihood;
  medical: Likelihood;
  spoof: Likelihood;
}

type Decision =
  | { status: "rejected"; reason: "auto_explicit" | "auto_violence" }
  | { status: "pending"; needsReview: true }
  | { status: "approved" };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getAdminClient() {
  return createAdminClient();
}

function rank(value: unknown): number {
  const idx = LIKELIHOOD.indexOf(value as Likelihood);
  return idx < 0 ? 0 : idx;
}

function normalize(value: unknown): Likelihood {
  return LIKELIHOOD[rank(value)];
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** Moderation rules (spec): returns the automatic decision for a SafeSearch result. */
function decide(s: SafeSearch): Decision {
  if (rank(s.adult) >= rank("LIKELY")) return { status: "rejected", reason: "auto_explicit" };
  if (s.violence === "VERY_LIKELY") return { status: "rejected", reason: "auto_violence" };
  if (s.adult === "POSSIBLE" || rank(s.racy) >= rank("LIKELY") || s.violence === "LIKELY") {
    return { status: "pending", needsReview: true };
  }
  return { status: "approved" };
}

/** Calls Vision SAFE_SEARCH_DETECTION. Throws a sanitized Error on any failure (never includes the key). */
async function safeSearch(apiKey: string, imageBase64: string): Promise<SafeSearch> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), VISION_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${VISION_URL}?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [{
          image: { content: imageBase64 },
          features: [{ type: "SAFE_SEARCH_DETECTION" }],
        }],
      }),
      signal: controller.signal,
    });
  } catch {
    throw new Error("vision_unreachable");
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) throw new Error(`vision_http_${response.status}`);

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new Error("vision_bad_json");
  }
  const first = isObject(json) && Array.isArray(json.responses) ? json.responses[0] : null;
  if (!isObject(first) || isObject(first.error)) throw new Error("vision_response_error");
  const annotation = first.safeSearchAnnotation;
  if (!isObject(annotation)) throw new Error("vision_no_annotation");

  return {
    adult: normalize(annotation.adult),
    racy: normalize(annotation.racy),
    violence: normalize(annotation.violence),
    medical: normalize(annotation.medical),
    spoof: normalize(annotation.spoof),
  };
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const expectedSecret = Deno.env.get("PUSH_WEBHOOK_SECRET");
  if (!expectedSecret) {
    console.error("[moderate-match-photo] PUSH_WEBHOOK_SECRET is not configured");
    return jsonResponse({ error: "Internal server error" }, 500);
  }
  if (req.headers.get("x-push-secret") !== expectedSecret) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }
  const photoId = isObject(body) ? nonEmptyString(body.photo_id) : null;
  if (!photoId) return jsonResponse({ error: "Invalid request" }, 400);

  try {
    const admin = getAdminClient();

    // The row is the source of truth: path comes from the DB, not the request body.
    const { data: photo, error: photoError } = await admin
      .from("match_photos")
      .select("id, path, status, moderated_at")
      .eq("id", photoId)
      .maybeSingle();
    if (photoError) throw photoError;

    // Idempotent: unknown photo (deleted), already moderated or already decided → nothing to do.
    if (!photo || photo.moderated_at || photo.status !== "pending") {
      return jsonResponse({ skipped: true });
    }

    const apiKey = Deno.env.get("GOOGLE_VISION_API_KEY");
    if (!apiKey) {
      console.error("[moderate-match-photo] GOOGLE_VISION_API_KEY is not configured");
      return jsonResponse({ error: "Moderation unavailable" }, 500);
    }

    const { data: blob, error: downloadError } = await admin.storage.from(BUCKET).download(photo.path);
    if (downloadError || !blob) {
      console.error(`[moderate-match-photo] download failed for photo ${photoId}`);
      return jsonResponse({ error: "Download failed" }, 500);
    }

    let result: SafeSearch;
    try {
      result = await safeSearch(apiKey, toBase64(new Uint8Array(await blob.arrayBuffer())));
    } catch (err) {
      // Row stays untouched; the cron of migration 193 retries.
      console.error(`[moderate-match-photo] vision failed for photo ${photoId}: ${(err as Error).message}`);
      return jsonResponse({ error: "Moderation failed" }, 500);
    }

    const decision = decide(result);
    const now = new Date().toISOString();
    const update: Record<string, unknown> = {
      moderation: result,
      moderated_at: now,
      status: decision.status,
    };
    if (decision.status === "rejected") {
      update.rejection_reason = decision.reason;
      update.needs_review = false;
      update.reviewed_at = now;
    } else if (decision.status === "approved") {
      update.needs_review = false;
      update.reviewed_at = now;
    } else {
      update.needs_review = true;
    }

    // Guard against races: only update if still pending and not yet moderated.
    const { data: updated, error: updateError } = await admin
      .from("match_photos")
      .update(update)
      .eq("id", photoId)
      .eq("status", "pending")
      .is("moderated_at", null)
      .select("id");
    if (updateError) throw updateError;
    if (!updated || updated.length === 0) return jsonResponse({ skipped: true });

    // Explicit content: remove the object (after the row is rejected, so a retry never hits a missing file).
    if (decision.status === "rejected") {
      const { error: removeError } = await admin.storage.from(BUCKET).remove([photo.path]);
      if (removeError) {
        console.error(`[moderate-match-photo] object removal failed for photo ${photoId}`);
      }
    }

    return jsonResponse({ status: decision.status });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    console.error(`[moderate-match-photo] error for photo ${photoId}: ${message}`);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
