/**
 * JChat 3.0 — DM photo moderation Edge Function
 * Runtime: Deno (Supabase Edge Functions)
 *
 * Called only by the database through pg_net (trigger + retry cron of migration 214). JWT verification is disabled
 * (config.toml), so every POST must carry x-push-secret matching PUSH_WEBHOOK_SECRET (same as moderate-match-photo).
 *
 * A photo sent in a DM is NEVER blocked at send time. This function looks at it with Google Vision SafeSearch and
 * records a verdict on the message through the dm_photo_set_verdict RPC (service_role only):
 *   clear    → shown normally · blurred → the receiver sees it blurred ("View anyway" + "Report")
 *   rejected → hidden from the receiver, an URGENT report is created (no public URL in its snapshot)
 *
 * Idempotent: only a message still 'pending' is moderated. If Vision fails the row stays 'pending' (shown blurred to the
 * receiver) and the cron retries.
 *
 * Required secrets: PUSH_WEBHOOK_SECRET · GOOGLE_VISION_API_KEY (never logged) · SB_SECRET_KEY (via _shared).
 * Deploy (Juan, manually, AFTER applying 214):
 *   supabase functions deploy moderate-dm-photo --project-ref klfsgcfoahdtkojyqspd --no-verify-jwt
 */

import { createAdminClient } from "../_shared/supabaseAdmin.ts";
import { decideDmPhoto, safeSearch, toBase64, type SafeSearch } from "../_shared/safesearch.ts";

const BUCKET = "dm-media";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, x-push-secret",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Constant-time comparison of the shared header secret. */
function safeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i];
  return diff === 0;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const expectedSecret = Deno.env.get("PUSH_WEBHOOK_SECRET");
  if (!expectedSecret) {
    console.error("[moderate-dm-photo] PUSH_WEBHOOK_SECRET is not configured");
    return jsonResponse({ error: "Internal server error" }, 500);
  }
  if (!safeEqual(req.headers.get("x-push-secret") ?? "", expectedSecret)) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }
  const messageId = isObject(body) && typeof body.message_id === "string" ? body.message_id : "";
  if (!UUID_RE.test(messageId)) return jsonResponse({ error: "Invalid request" }, 400);

  try {
    const admin = createAdminClient();

    // The row is the source of truth: the path comes from the DB, never from the request body.
    const { data: message, error: messageError } = await admin
      .from("dm_messages")
      .select("id, media_url, media_moderation")
      .eq("id", messageId)
      .maybeSingle();
    if (messageError) throw messageError;
    if (!message || message.media_moderation !== "pending" || !message.media_url) {
      return jsonResponse({ skipped: true });
    }

    // Legacy / demo values that already carry a URL scheme are not objects of dm-media: nothing to look at.
    if (/^(https?|file|content|data):/i.test(message.media_url as string)) {
      const { error } = await admin.rpc("dm_photo_set_verdict", { p_message_id: messageId, p_status: "clear" });
      if (error) throw error;
      return jsonResponse({ status: "clear", legacy: true });
    }

    const apiKey = Deno.env.get("GOOGLE_VISION_API_KEY");
    if (!apiKey) {
      console.error("[moderate-dm-photo] GOOGLE_VISION_API_KEY is not configured");
      return jsonResponse({ error: "Moderation unavailable" }, 500);
    }

    const { data: blob, error: downloadError } = await admin.storage.from(BUCKET).download(message.media_url as string);
    if (downloadError || !blob) {
      console.error(`[moderate-dm-photo] download failed for message ${messageId}`);
      return jsonResponse({ error: "Download failed" }, 500);
    }

    let scores: SafeSearch;
    try {
      scores = await safeSearch(apiKey, toBase64(new Uint8Array(await blob.arrayBuffer())));
    } catch (err) {
      // The row stays 'pending' (blurred for the receiver); the cron of migration 214 retries.
      console.error(`[moderate-dm-photo] vision failed for message ${messageId}: ${(err as Error).message}`);
      return jsonResponse({ error: "Moderation failed" }, 500);
    }

    const verdict = decideDmPhoto(scores);
    const { error: verdictError } = await admin.rpc("dm_photo_set_verdict", {
      p_message_id: messageId,
      p_status: verdict,
      p_scores: scores,
    });
    if (verdictError) throw verdictError;
    return jsonResponse({ status: verdict });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    console.error(`[moderate-dm-photo] error for message ${messageId}: ${message}`);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
