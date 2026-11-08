/**
 * JChat 3.0 — delivery of queued e-mails (public.outbound_emails) with Resend. Started in D4 for the "venue closed → reservation cancelled" e-mail and
 * generalized in E2 (spec 4): one row = one e-mail, rendered by kind in ./emails/render.ts (reservation, subscription_started, trial_will_end,
 * business_plan_request). The recipient is the account's e-mail when the row has a user_id, otherwise the row's to_email; reply_to goes to Resend when present.
 * Best effort: a failure leaves the row 'failed' (or 'pending' if Resend is not configured) and never blocks the caller (e.g. an account deletion).
 *
 * This module keeps every export it had before E2 (the constants, formatWhen, buildClosedReservationEmail, deliverClosedReservationEmails), so
 * delete-account and send-push are untouched.
 */

import { DEFAULT_FROM, type Language, RESEND_URL } from "./emails/common.ts";
import { isEmailKind, renderEmail } from "./emails/render.ts";

export { buildClosedReservationEmail } from "./emails/templates/closedReservation.ts";
export { DEFAULT_FROM, formatWhen, type Language, RESEND_URL, SUPPORT_CONTACT } from "./emails/common.ts";

const RESERVATION_KIND = "reservation_cancelled_business_closed";

export interface EmailRow {
  id: string;
  /** Missing = the caller's default kind (the reservation e-mail for delete-account, which does not select it). */
  kind?: string;
  user_id: string | null;
  /** External recipient, used when user_id is null (e.g. ventas@jchat.cloud). */
  to_email?: string | null;
  reply_to?: string | null;
  payload: Record<string, unknown>;
  attempts: number;
}

export interface EmailDeps {
  loadRows(ids: string[]): Promise<EmailRow[]>;
  /** The person's e-mail and language, or null when the account has no e-mail. */
  recipient(userId: string): Promise<{ email: string; language: Language } | null>;
  /** `error` is a short generic code (never provider text or addresses); only the retry function stores it. */
  markRow(id: string, status: "sent" | "failed" | "skipped", attempts: number, error?: string): Promise<void>;
  resendKey: string | undefined;
  from?: string;
  fetchFn?: (input: string, init?: RequestInit) => Promise<Response>;
}

export interface DeliveryReport {
  sent: number;
  failed: number;
  skipped: number;
  pending: number;
}

const REPLY_TO_RE = /^[^\s@,;<>]+@[^\s@,;<>]+$/;

/**
 * Delivers the given rows. Never throws. Without RESEND_API_KEY the rows stay 'pending' (nothing is lost; they can be delivered later).
 * An unknown kind is skipped as 'unknown_kind' (never sent); a known kind whose payload lacks what its text needs is skipped as 'invalid_payload'
 * ('no_recipient_or_payload' for the reservation e-mail, as before E2).
 */
export async function deliverQueuedEmails(deps: EmailDeps, ids: string[], options: { defaultKind?: string } = {}): Promise<DeliveryReport> {
  const report: DeliveryReport = { sent: 0, failed: 0, skipped: 0, pending: 0 };
  if (ids.length === 0) return report;
  if (!deps.resendKey) {
    report.pending = ids.length;
    return report;
  }
  let rows: EmailRow[];
  try {
    rows = await deps.loadRows(ids);
  } catch {
    report.pending = ids.length;
    return report;
  }
  const doFetch = deps.fetchFn ?? fetch;
  for (const row of rows) {
    try {
      const kind = row.kind ?? options.defaultKind;
      if (!kind || !isEmailKind(kind)) {
        await deps.markRow(row.id, "skipped", row.attempts + 1, "unknown_kind");
        report.skipped += 1;
        continue;
      }
      const who = row.user_id
        ? await deps.recipient(row.user_id)
        : row.to_email
          ? { email: row.to_email, language: (row.payload?.locale === "en" ? "en" : "es") as Language }
          : null;
      if (!who) {
        await deps.markRow(row.id, "skipped", row.attempts + 1, "no_recipient_or_payload");
        report.skipped += 1;
        continue;
      }
      const mail = renderEmail(kind, who.language, row.payload);
      if (!mail) {
        await deps.markRow(row.id, "skipped", row.attempts + 1, kind === RESERVATION_KIND ? "no_recipient_or_payload" : "invalid_payload");
        report.skipped += 1;
        continue;
      }
      const replyTo = row.reply_to && REPLY_TO_RE.test(row.reply_to) ? row.reply_to : null;
      const res = await doFetch(RESEND_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${deps.resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: deps.from ?? DEFAULT_FROM, to: [who.email], subject: mail.subject, text: mail.text, ...(replyTo ? { reply_to: replyTo } : {}) }),
        signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) {
        await deps.markRow(row.id, "sent", row.attempts + 1);
        report.sent += 1;
      } else {
        // Only the status: the provider body may echo addresses.
        await deps.markRow(row.id, "failed", row.attempts + 1, `resend_http_${res.status}`);
        report.failed += 1;
      }
    } catch {
      try {
        await deps.markRow(row.id, "failed", row.attempts + 1, "send_exception");
      } catch { /* nothing else to do */ }
      report.failed += 1;
    }
  }
  return report;
}

/** The pre-E2 entry point (delete-account): rows that carry no `kind` are reservation e-mails. Same behavior as before. */
export function deliverClosedReservationEmails(deps: EmailDeps, ids: string[]): Promise<DeliveryReport> {
  return deliverQueuedEmails(deps, ids, { defaultKind: RESERVATION_KIND });
}
