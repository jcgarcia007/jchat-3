/**
 * JChat 3.0 — pieces shared by every e-mail template (plain text, ES/EN): constants, date/money formatting, and the validated payload of the two
 * subscription e-mails. Import-free so Deno tests can drive it. Nothing here ever prints a Stripe customer id or a full subscription id.
 */

export const RESEND_URL = "https://api.resend.com/emails";
export const DEFAULT_FROM = "JChat <noreply@jchat.cloud>";
export const SUPPORT_CONTACT = "soporte@jchat.cloud";
/** Where the customer cancels or changes plan (opens the Stripe portal from there). */
export const BILLING_URL = "https://jchat.cloud/dashboard/billing";
/** Subscription dates are shown in US Eastern time (the company's reference zone), like the reservation e-mail's default zone. */
export const SUBSCRIPTION_TIME_ZONE = "America/New_York";

export type Language = "es" | "en";

export const localeOf = (language: Language): string => (language === "en" ? "en-US" : "es-US");

/** Date and time of an instant in a time zone (invalid zone → UTC). Used by the reservation e-mail and the sales e-mail. */
export function formatWhen(reservedAtIso: string, timezone: string | null | undefined, language: Language): { date: string; time: string } {
  const locale = localeOf(language);
  const d = new Date(reservedAtIso);
  const tz = timezone || "America/New_York";
  let date: string;
  let time: string;
  try {
    date = new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: tz }).format(d);
    time = new Intl.DateTimeFormat(locale, { timeStyle: "short", timeZone: tz }).format(d);
  } catch {
    date = new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(d);
    time = new Intl.DateTimeFormat(locale, { timeStyle: "short", timeZone: "UTC" }).format(d);
  }
  return { date, time };
}

/** "8 de diciembre de 2026" / "December 8, 2026", in US Eastern time. */
export function formatDateLong(iso: string, language: Language): string {
  return new Intl.DateTimeFormat(localeOf(language), { dateStyle: "long", timeZone: SUBSCRIPTION_TIME_ZONE }).format(new Date(iso));
}

/** "$534.00" from cents and an ISO currency code. */
export function formatMoney(cents: number, currency: string, language: Language): string {
  return new Intl.NumberFormat(localeOf(language), { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
}

export type PlanId = "business" | "pro";
export type BillingInterval = "month" | "6month" | "year";

export const PLAN_LABEL: Record<PlanId, string> = { business: "Business", pro: "Pro" };

const CADENCE: Record<Language, Record<BillingInterval, string>> = {
  es: { month: "cada mes", "6month": "cada 6 meses", year: "cada año" },
  en: { month: "every month", "6month": "every 6 months", year: "every year" },
};
export const cadenceOf = (interval: BillingInterval, language: Language): string => CADENCE[language][interval];

/** What the `subscriptions` function puts in outbound_emails.payload for 'subscription_started' and 'trial_will_end'. */
export interface SubscriptionEmailPayload {
  plan: PlanId;
  interval: BillingInterval;
  amount_cents: number;
  currency: string;
  /** ISO end of the free trial, or null when there is none. */
  trial_end: string | null;
  /** ISO end of the current billing period. */
  period_end: string;
  /** Only when the payment method came expanded: the card's last four digits. */
  last4?: string;
}

const isIso = (v: unknown): v is string => typeof v === "string" && !Number.isNaN(Date.parse(v));

/** Validates the raw payload; null when anything the text needs is missing or malformed (the caller then skips the row). */
export function readSubscriptionPayload(raw: unknown): SubscriptionEmailPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  if (p.plan !== "business" && p.plan !== "pro") return null;
  if (p.interval !== "month" && p.interval !== "6month" && p.interval !== "year") return null;
  if (typeof p.amount_cents !== "number" || !Number.isInteger(p.amount_cents) || p.amount_cents < 0) return null;
  if (typeof p.currency !== "string" || !/^[a-z]{3}$/i.test(p.currency)) return null;
  if (!isIso(p.period_end)) return null;
  const trialEnd = p.trial_end === null || p.trial_end === undefined ? null : p.trial_end;
  if (trialEnd !== null && !isIso(trialEnd)) return null;
  const last4 = typeof p.last4 === "string" && /^\d{4}$/.test(p.last4) ? p.last4 : undefined;
  return { plan: p.plan, interval: p.interval, amount_cents: p.amount_cents, currency: p.currency, trial_end: trialEnd, period_end: p.period_end, ...(last4 ? { last4 } : {}) };
}

export const supportLine = (language: Language): string =>
  language === "en" ? `Questions? Write to ${SUPPORT_CONTACT}.` : `¿Dudas? Escríbenos a ${SUPPORT_CONTACT}.`;
