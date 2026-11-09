/**
 * JChat 3.0 — pure helpers of the `subscriptions` function for billing intervals (month / 6 months / year).
 * Import-free (no Stripe client, no Deno.env at load time) so a Deno test can drive it. index.ts wires them in.
 *
 * The plan a subscription belongs to is read from its PRICE (price.metadata.plan, written by supabase/scripts/stripe_create_interval_prices.ts),
 * with the subscription metadata (`plan`, set by create_checkout) as the fallback and the configured price ids as the last one: changing plan
 * in the Stripe portal swaps the price but never rewrites the subscription metadata, so the metadata alone goes stale.
 */

export type Interval = "month" | "6month" | "year";
export const INTERVALS: readonly Interval[] = ["month", "6month", "year"];

export type PaidPlan = "business" | "pro";
export type KnownPlan = "verified" | PaidPlan;
const KNOWN_PLANS: readonly KnownPlan[] = ["verified", "business", "pro"];

/** The bits of a Stripe.Price these helpers read. */
export interface PriceLike {
  id?: string | null;
  metadata?: Record<string, string> | null;
  recurring?: { interval?: string | null; interval_count?: number | null } | null;
}

export type PriceIds = Record<PaidPlan, Record<Interval, string | undefined>>;

/** (plan, interval) → Stripe price id, from the six secrets. The monthly ones keep their historical names. */
export function buildPriceIds(get: (name: string) => string | undefined): PriceIds {
  const v = (name: string) => get(name) || undefined;
  return {
    business: { month: v("STRIPE_PRICE_BUSINESS"), "6month": v("STRIPE_PRICE_BUSINESS_6M"), year: v("STRIPE_PRICE_BUSINESS_1Y") },
    pro: { month: v("STRIPE_PRICE_PRO"), "6month": v("STRIPE_PRICE_PRO_6M"), year: v("STRIPE_PRICE_PRO_1Y") },
  };
}

/** Every configured price id of a plan (all intervals). Used to recognise membership lines in an invoice. */
export function priceIdsOfPlan(ids: PriceIds, plan: string): string[] {
  const row = ids[plan as PaidPlan];
  return row ? INTERVALS.map((i) => row[i]).filter((id): id is string => !!id) : [];
}

export type IntervalCheck = { ok: true; interval: Interval } | { ok: false; error: "INVALID_INTERVAL" };

/**
 * Validates the `interval` of create_checkout. Absent → "month" (existing callers never send it). Anything that is not one of the three values
 * → INVALID_INTERVAL; a plan other than business/pro only has the monthly price.
 */
export function checkoutInterval(planId: string, raw: unknown): IntervalCheck {
  if (raw === undefined || raw === null) return { ok: true, interval: "month" };
  if (typeof raw !== "string" || !INTERVALS.includes(raw as Interval)) return { ok: false, error: "INVALID_INTERVAL" };
  const interval = raw as Interval;
  if (interval !== "month" && planId !== "business" && planId !== "pro") return { ok: false, error: "INVALID_INTERVAL" };
  return { ok: true, interval };
}

/** month/1 → 'month', month/6 → '6month', year/1 → 'year'; anything else → null (with a warning: the price is not one of ours). */
export function intervalFromPrice(price: PriceLike | null | undefined, warn: (msg: string) => void = console.warn): Interval | null {
  const r = price?.recurring;
  const count = r?.interval_count ?? 1;
  if (r?.interval === "month" && count === 1) return "month";
  if (r?.interval === "month" && count === 6) return "6month";
  if (r?.interval === "year" && count === 1) return "year";
  warn(`[subscriptions] unknown billing interval on price ${price?.id ?? "(none)"}: ${r?.interval ?? "?"}/${count}`);
  return null;
}

function asKnownPlan(value: unknown): KnownPlan | null {
  return typeof value === "string" && (KNOWN_PLANS as readonly string[]).includes(value) ? (value as KnownPlan) : null;
}

/**
 * The plan of a subscription: price.metadata.plan → subscription metadata `plan` → the plan whose configured price ids include this price.
 * null when none is valid: the caller must NOT downgrade to `regular` (it logs and keeps the plan the user has).
 */
export function planFromPrice(
  price: PriceLike | null | undefined,
  subMetadataPlan: unknown,
  ids?: PriceIds,
): KnownPlan | null {
  const fromPrice = asKnownPlan(price?.metadata?.plan);
  if (fromPrice) return fromPrice;
  const fromSub = asKnownPlan(subMetadataPlan);
  if (fromSub) return fromSub;
  if (ids && price?.id) {
    for (const plan of ["business", "pro"] as const) if (priceIdsOfPlan(ids, plan).includes(price.id)) return plan;
  }
  return null;
}

/** The bits of a Stripe.Subscription `periodEndOf` reads. */
export interface SubscriptionLike {
  id?: string | null;
  current_period_end?: number | null;
  /** Items are opaque here (a Stripe.SubscriptionItem has no `current_period_end` in the 2024 typings); read defensively below. */
  items?: { data?: ReadonlyArray<unknown> | null } | null;
}

/**
 * ISO end of the current billing period. API 2024-06-20 keeps `current_period_end` on the subscription root; from API 2025+ (the webhook
 * endpoint is on 2026-05-27.dahlia) it only exists on `items.data[0]`. Reads the root, then the first item. Never builds a Date from a
 * missing/invalid value (that threw `RangeError: Invalid time value` and 500'd the webhook): no date → null + a warning.
 */
export function periodEndOf(
  sub: SubscriptionLike | null | undefined,
  warn: (msg: string) => void = console.warn,
): string | null {
  const candidates = [sub?.current_period_end, (sub?.items?.data?.[0] as { current_period_end?: number | null } | undefined)?.current_period_end];
  for (const seconds of candidates) {
    if (typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0) return new Date(seconds * 1000).toISOString();
  }
  warn(`[subscriptions] no current_period_end on subscription ${sub?.id ?? "(unknown)"}`);
  return null;
}

// ── E3 (spec 4): subscription e-mails queued in public.outbound_emails ─────────────────────────────────────────────────────────────────────

export type SubscriptionEmailKind = "subscription_started" | "trial_will_end";

/** The bits of a Stripe.Subscription the e-mail payload reads (the same object the webhook already re-read with the pinned client). */
export interface SubscriptionEmailSource extends SubscriptionLike {
  id?: string | null;
  /** Unix seconds; null/absent = no free trial. */
  trial_end?: number | null;
  /** A string id (the usual case) or, only when the caller expanded it, the PaymentMethod with `card.last4`. */
  default_payment_method?: unknown;
}

/** The bits of a Stripe.Price it reads. */
export interface PriceEmailSource {
  unit_amount?: number | null;
  currency?: string | null;
}

/** What outbound_emails.payload holds for 'subscription_started' and 'trial_will_end'. Must satisfy readSubscriptionPayload (_shared/emails/common.ts). */
export interface SubscriptionEmailPayload {
  plan: PaidPlan;
  interval: Interval;
  amount_cents: number;
  currency: string;
  /** ISO end of the free trial, or null when the subscription has none. */
  trial_end: string | null;
  /** ISO end of the current billing period. */
  period_end: string;
  /** Only an id for the support trail: the e-mail text never prints it. */
  subscription_id: string;
  /** Card's last four digits, only when the payment method came expanded (no extra Stripe call is made for it). */
  last4?: string;
}

/**
 * Payload of a subscription e-mail, or null when it cannot be built honestly (the caller logs and queues nothing): a plan other than business/pro,
 * an unknown interval, a price without a fixed amount or currency, a subscription without id or period end.
 * `amount_cents` is the price's unit amount: what the next charge will be (it ignores discounts, which this checkout never applies).
 */
export function buildSubscriptionEmailPayload(
  sub: SubscriptionEmailSource | null | undefined,
  price: PriceEmailSource | null | undefined,
  plan: KnownPlan | null,
  interval: Interval | null,
  warn: (msg: string) => void = console.warn,
): SubscriptionEmailPayload | null {
  if (!sub || typeof sub.id !== "string" || sub.id === "") return null;
  if (plan !== "business" && plan !== "pro") return null;
  if (!interval) return null;
  if (!price || typeof price.unit_amount !== "number" || !Number.isInteger(price.unit_amount) || price.unit_amount < 0) return null;
  if (typeof price.currency !== "string" || !/^[a-z]{3}$/i.test(price.currency)) return null;
  const periodEnd = periodEndOf(sub, warn);
  if (!periodEnd) return null;
  const trialEnd = typeof sub.trial_end === "number" && Number.isFinite(sub.trial_end) && sub.trial_end > 0 ? new Date(sub.trial_end * 1000).toISOString() : null;
  const pm = sub.default_payment_method;
  const last4 = pm && typeof pm === "object" ? (pm as { card?: { last4?: unknown } }).card?.last4 : undefined;
  return {
    plan,
    interval,
    amount_cents: price.unit_amount,
    currency: price.currency.toLowerCase(),
    trial_end: trialEnd,
    period_end: periodEnd,
    subscription_id: sub.id,
    ...(typeof last4 === "string" && /^\d{4}$/.test(last4) ? { last4 } : {}),
  };
}

/** One e-mail per event: `subscription_started:sub_…` / `trial_will_end:sub_…` (unique index outbound_emails_dedupe_key_uq, migration 272). */
export const emailDedupeKey = (kind: SubscriptionEmailKind, subscriptionId: string): string => `${kind}:${subscriptionId}`;

/** The bit of the Supabase client `enqueueOutboundEmail` uses (kept structural so a Deno test can fake it). */
export interface OutboxClient {
  from(table: string): {
    upsert(row: Record<string, unknown>, options: { onConflict: string; ignoreDuplicates: boolean }): PromiseLike<{ error: unknown }>;
  };
}

export interface QueuedEmail {
  kind: SubscriptionEmailKind;
  user_id: string;
  payload: SubscriptionEmailPayload;
  dedupe_key: string;
}

/**
 * Queues the e-mail: `insert … on conflict (dedupe_key) do nothing`, so a resent Stripe event (or a second event for the same subscription) never queues a
 * second e-mail. NEVER throws and never reports to the caller as a failure of the webhook: the subscription state is already saved; on any error it
 * logs a generic line (no addresses, no payload) and returns false.
 */
export async function enqueueOutboundEmail(db: OutboxClient, email: QueuedEmail, error: (msg: string, detail?: unknown) => void = console.error): Promise<boolean> {
  try {
    const { error: err } = await db.from("outbound_emails").upsert({ ...email }, { onConflict: "dedupe_key", ignoreDuplicates: true });
    if (err) {
      error("[subscriptions] could not queue e-mail", { kind: email.kind, dedupe_key: email.dedupe_key, error: err });
      return false;
    }
    return true;
  } catch (e) {
    error("[subscriptions] could not queue e-mail (exception)", { kind: email.kind, dedupe_key: email.dedupe_key, error: String(e) });
    return false;
  }
}
