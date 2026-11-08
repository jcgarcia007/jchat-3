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
