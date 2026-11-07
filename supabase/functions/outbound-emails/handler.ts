/**
 * JChat 3.0 — D5: delivery of queued e-mails (public.outbound_emails). Import-free apart from the shared renderer, so a Deno test can drive it with fakes.
 *
 * Called only by the database (outbound_emails_retry(), migration 266) through pg_net with { ids: [...] } and the x-push-secret header.
 * The retry function already counted the attempt (attempts + 1, last_attempt_at = now()) before calling, so nothing here touches `attempts`.
 * Rows that are not 'pending'/'failed' any more (sent, skipped) are ignored: a late or repeated call never sends twice.
 * Without RESEND_API_KEY the answer is 503 and NO row is touched (it will be retried; once it reaches 6 attempts the database gives up).
 */

import { deliverClosedReservationEmails, type EmailDeps } from "../_shared/ownerCloseEmails.ts";
import { safeEqual } from "../_shared/safeEqual.ts";

export const MAX_IDS = 50;

export interface HandlerDeps {
  /** PUSH_WEBHOOK_SECRET; undefined = the function is not configured. */
  secret: string | undefined;
  resendKey: string | undefined;
  /** Rows by id that are still deliverable (status pending/failed). Unknown ids simply do not come back. */
  loadRows(ids: string[]): Promise<Awaited<ReturnType<EmailDeps["loadRows"]>>>;
  recipient: EmailDeps["recipient"];
  /** status + sent_at + last_error on one row. */
  markRow(id: string, status: "sent" | "failed" | "skipped", error?: string): Promise<void>;
  from?: string;
  fetchFn?: EmailDeps["fetchFn"];
}

const JSON_HEADERS = { "Content-Type": "application/json" };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function handleOutboundEmails(req: Request, deps: HandlerDeps): Promise<Response> {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!deps.secret) {
    console.error("[outbound-emails] PUSH_WEBHOOK_SECRET is not configured");
    return json({ error: "Internal server error" }, 500);
  }
  if (!safeEqual(req.headers.get("x-push-secret") ?? "", deps.secret)) return json({ error: "Unauthorized" }, 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const raw = body && typeof body === "object" ? (body as { ids?: unknown }).ids : null;
  if (!Array.isArray(raw)) return json({ error: "Invalid request" }, 400);
  const ids = [...new Set(raw.filter((v): v is string => typeof v === "string" && UUID_RE.test(v)))].slice(0, MAX_IDS);
  if (ids.length === 0) return json({ sent: 0, failed: 0, skipped: 0, pending: 0 });

  if (!deps.resendKey) {
    console.error("[outbound-emails] RESEND_API_KEY is not configured");
    return json({ error: "Email provider not configured" }, 503);
  }

  try {
    const report = await deliverClosedReservationEmails({
      loadRows: async (wanted) => (await deps.loadRows(wanted)).filter((r) => wanted.includes(r.id)),
      recipient: deps.recipient,
      markRow: (id, status, _attempts, error) => deps.markRow(id, status, error),
      resendKey: deps.resendKey,
      from: deps.from,
      fetchFn: deps.fetchFn,
    }, ids);
    console.log(`[outbound-emails] sent ${report.sent} failed ${report.failed} skipped ${report.skipped}`);
    return json(report);
  } catch {
    console.error("[outbound-emails] delivery threw");
    return json({ error: "Internal server error" }, 500);
  }
}
