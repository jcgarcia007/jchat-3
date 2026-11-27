/**
 * JChat 3.0 — email to a customer whose future reservation was cancelled because the venue closed (D4, mockup E).
 * Queued by owner_close_business() in public.outbound_emails (same transaction as the cancellation) and delivered here with Resend right after.
 * Best effort: a failure leaves the row 'failed' (or 'pending' if Resend is not configured) and never blocks the deletion.
 * No owner data anywhere: only the venue name, the date/time (in the venue's time zone) and the support contact.
 */

export const RESEND_URL = "https://api.resend.com/emails";
export const DEFAULT_FROM = "JChat <noreply@jchat.cloud>";
export const SUPPORT_CONTACT = "soporte@jchat.cloud";

export type Language = "es" | "en";

const MONTHS = {
  es: ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
} as const;

function zoneParts(d: Date, tz: string): { y: number; m: number; day: number; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric",
  }).formatToParts(d);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { y: get("year"), m: get("month"), day: get("day"), hour: get("hour") % 24, minute: get("minute") };
}

/**
 * The one date + time rule of the app (H-028 / H-032, same as mobile/utils/reservationFlow.ts): Spanish "23 de noviembre de 2026" + "20:00",
 * English "November 23, 2026" + "8:00 PM". Month names from our own tables; only the numeric parts come from Intl (zone conversion).
 * An unknown zone falls back to UTC.
 */
export function formatWhen(reservedAtIso: string, timezone: string | null | undefined, language: Language): { date: string; time: string } {
  const d = new Date(reservedAtIso);
  let p: { y: number; m: number; day: number; hour: number; minute: number };
  try {
    p = zoneParts(d, timezone || "America/New_York");
  } catch {
    p = zoneParts(d, "UTC");
  }
  const mm = String(p.minute).padStart(2, "0");
  if (language === "en") {
    return {
      date: `${MONTHS.en[p.m - 1]} ${p.day}, ${p.y}`,
      time: `${p.hour % 12 === 0 ? 12 : p.hour % 12}:${mm} ${p.hour < 12 ? "AM" : "PM"}`,
    };
  }
  return { date: `${p.day} de ${MONTHS.es[p.m - 1]} de ${p.y}`, time: `${String(p.hour).padStart(2, "0")}:${mm}` };
}

export function buildClosedReservationEmail(args: {
  language: Language;
  businessName: string;
  reservedAt: string;
  timezone?: string | null;
}): { subject: string; text: string } {
  const { date, time } = formatWhen(args.reservedAt, args.timezone, args.language);
  if (args.language === "en") {
    return {
      subject: "Reservation cancelled",
      text: [
        `${args.businessName} has closed and your reservation for ${date} at ${time} was cancelled. We're sorry for the inconvenience.`,
        "",
        `If you paid anything in advance, write to ${SUPPORT_CONTACT} with your reservation number.`,
        "",
        "— JChat",
      ].join("\n"),
    };
  }
  return {
    subject: "Reserva cancelada",
    text: [
      `${args.businessName} cerró y tu reserva del ${date} a las ${time} se canceló. Lamentamos las molestias.`,
      "",
      `Si pagaste algo por adelantado, escríbenos a ${SUPPORT_CONTACT} con el número de la reserva.`,
      "",
      "— JChat",
    ].join("\n"),
  };
}

export interface EmailRow {
  id: string;
  user_id: string | null;
  payload: { business_name?: string; reserved_at?: string; timezone?: string | null };
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

/** Never throws. Without RESEND_API_KEY the rows stay 'pending' (nothing is lost; they can be delivered later). */
export async function deliverClosedReservationEmails(deps: EmailDeps, ids: string[]): Promise<DeliveryReport> {
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
      const who = row.user_id ? await deps.recipient(row.user_id) : null;
      if (!who || !row.payload.business_name || !row.payload.reserved_at) {
        await deps.markRow(row.id, "skipped", row.attempts + 1, "no_recipient_or_payload");
        report.skipped += 1;
        continue;
      }
      const mail = buildClosedReservationEmail({ language: who.language, businessName: row.payload.business_name, reservedAt: row.payload.reserved_at, timezone: row.payload.timezone });
      const res = await doFetch(RESEND_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${deps.resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: deps.from ?? DEFAULT_FROM, to: [who.email], subject: mail.subject, text: mail.text }),
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
