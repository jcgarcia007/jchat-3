/**
 * JChat 3.0 — safety-alert Edge Function
 * Runtime: Deno (Supabase Edge Functions)
 *
 * Emails safety@jchat.cloud when an URGENT report is created (child_safety / Match 'minor').
 * Called only by the database through pg_net (trigger trg_reports_urgent_alert, migration 212).
 * JWT verification is disabled (config.toml), so every POST must carry x-push-secret matching PUSH_WEBHOOK_SECRET
 * (same secret and pattern as moderate-match-photo).
 *
 * The email is a NOTICE ONLY: report id, reason code, priority, content type, date and the link to the admin queue.
 * It NEVER includes the snapshot, the reported text, the reporter's details or any media URL — sensitive material is not
 * distributed by email; the team looks at it inside /super-admin/alerts.
 *
 * Required secrets:
 *   PUSH_WEBHOOK_SECRET   — shared with the database trigger (already exists)
 *   RESEND_API_KEY        — Resend API key (NEW: create it in the Edge Function secrets). The sending domain
 *                           jchat.cloud must be verified in Resend.
 *   SB_SECRET_KEY         — read through ../_shared/supabaseAdmin.ts
 * Optional:
 *   SAFETY_ALERT_TO       — recipient (default safety@jchat.cloud)
 *   SAFETY_ALERT_FROM     — sender (default "JChat Safety <safety@jchat.cloud>")
 *
 * Deploy (Juan, manually):
 *   supabase functions deploy safety-alert --project-ref klfsgcfoahdtkojyqspd --no-verify-jwt
 */

import { createAdminClient } from "../_shared/supabaseAdmin.ts";

const RESEND_URL = "https://api.resend.com/emails";
const RESEND_TIMEOUT_MS = 15_000;
const ADMIN_URL = "https://jchat.cloud/super-admin/alerts";
const DEFAULT_TO = "safety@jchat.cloud";
const DEFAULT_FROM = "JChat Safety <safety@jchat.cloud>";

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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Constant-time string comparison (the secret is a shared header value). */
function safeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i];
  return diff === 0;
}

/** Only short enum-like tokens ever reach the email (reason / type / priority), never free text. */
function token(value: unknown): string {
  const text = typeof value === "string" ? value.split(":")[0] : "";
  return /^[a-z_]{1,40}$/.test(text) ? text : "unknown";
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const expectedSecret = Deno.env.get("PUSH_WEBHOOK_SECRET");
  if (!expectedSecret) {
    console.error("[safety-alert] PUSH_WEBHOOK_SECRET is not configured");
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
  const reportId = isObject(body) && typeof body.report_id === "string" ? body.report_id : "";
  if (!UUID_RE.test(reportId)) return jsonResponse({ error: "report_id is required" }, 400);

  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) {
    console.error("[safety-alert] RESEND_API_KEY is not configured");
    return jsonResponse({ error: "Email provider not configured" }, 500);
  }

  // Only the non-sensitive columns are read: details / snapshot are deliberately NOT selected.
  const db = createAdminClient();
  const { data: report, error } = await db
    .from("reports")
    .select("id, reason, priority, content_type, created_at")
    .eq("id", reportId)
    .maybeSingle();
  if (error) {
    console.error("[safety-alert] report lookup failed:", error.message);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
  if (!report) return jsonResponse({ error: "Report not found" }, 404);

  const priority = token(report.priority);
  const lines = [
    `Urgent report ${report.id}`,
    "",
    `Reason: ${token(report.reason)}`,
    `Priority: ${priority}`,
    `Content type: ${token(report.content_type)}`,
    `Created: ${new Date(report.created_at as string).toISOString()}`,
    "",
    `Review it in the admin queue: ${ADMIN_URL}`,
    "",
    "This email never contains the reported content. Open the queue to see it.",
  ];

  let response: Response;
  try {
    response = await fetch(RESEND_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: Deno.env.get("SAFETY_ALERT_FROM") ?? DEFAULT_FROM,
        to: [Deno.env.get("SAFETY_ALERT_TO") ?? DEFAULT_TO],
        subject: `[JChat] ${priority.toUpperCase()} report — ${token(report.reason)}`,
        text: lines.join("\n"),
      }),
      signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
    });
  } catch {
    console.error("[safety-alert] Resend unreachable");
    return jsonResponse({ error: "Email provider unreachable" }, 502);
  }
  if (!response.ok) {
    // Never log the key or the provider body (it may echo addresses); the status is enough to debug.
    console.error(`[safety-alert] Resend responded ${response.status}`);
    return jsonResponse({ error: "Email provider error" }, 502);
  }
  return jsonResponse({ ok: true });
});
