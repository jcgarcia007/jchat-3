/**
 * JChat 3.0 — Presentation amounts of the business plans per billing interval (month / 6 months / year).
 *
 * Pure data, no imports: the page, the checkout hook and a unit test read it. The amounts MUST match the Stripe prices created by
 * supabase/scripts/stripe_create_interval_prices.ts (cents); web/lib/businessPricing.test.mjs compares them against that script.
 * Stripe is the source of truth for what is charged — this is only what the page shows.
 */

export type BillingInterval = "month" | "6month" | "year";
export type PricedPlanId = "business" | "pro";

export const BILLING_INTERVALS: readonly BillingInterval[] = ["month", "6month", "year"];

export interface IntervalPrice {
  /** Months covered by one charge. */
  months: number;
  /** Discount against paying month by month (0, 10, 20). */
  discountPct: number;
  /** Per-month figure shown big, in cents (4900 / 4400 / 3900 for Business). */
  monthlyCents: number;
  /** What is charged each period, in cents (4900 / 26400 / 46800 for Business). */
  totalCents: number;
}

export const BUSINESS_INTERVALS: Record<PricedPlanId, Record<BillingInterval, IntervalPrice>> = {
  business: {
    month: { months: 1, discountPct: 0, monthlyCents: 4900, totalCents: 4900 },
    "6month": { months: 6, discountPct: 10, monthlyCents: 4400, totalCents: 26400 },
    year: { months: 12, discountPct: 20, monthlyCents: 3900, totalCents: 46800 },
  },
  pro: {
    month: { months: 1, discountPct: 0, monthlyCents: 9900, totalCents: 9900 },
    "6month": { months: 6, discountPct: 10, monthlyCents: 8900, totalCents: 53400 },
    year: { months: 12, discountPct: 20, monthlyCents: 7900, totalCents: 94800 },
  },
};

/** Free-trial length when no valid promo code says otherwise. */
export const DEFAULT_TRIAL_DAYS = 30;

/** Whole-dollar amounts print without decimals ("$49"), anything else with two ("$49.50"). */
export function formatUsd(cents: number): string {
  const dollars = cents / 100;
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}

/** The date of the first charge: now + trial days, in ms (the page formats it with Intl.DateTimeFormat in the user's locale). */
export function firstChargeAt(nowMs: number, trialDays: number): number {
  return nowMs + trialDays * 86_400_000;
}
