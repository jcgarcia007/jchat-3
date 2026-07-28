/**
 * Central USD currency formatter. Amounts are always cents from the server
 * (orders, disputes, subscriptions, Stripe) — this only formats them for
 * display, it never computes or rounds a real total.
 *
 * currency is fixed to "usd" (confirmed: the project has no per-business
 * currency column and every Edge Function that talks to Stripe hardcodes
 * currency: "usd" — there is no DOP/other-currency signal anywhere in the
 * codebase). locale is optional and only affects the thousands separator /
 * symbol placement — omit it to use the runtime's default locale, same as
 * every pre-existing `Intl.NumberFormat(undefined, ...)` call this replaces.
 *
 * `options` merges into the Intl.NumberFormat call (e.g. to force
 * `maximumFractionDigits: 0` for a whole-dollar display) — some existing
 * call sites show 0 decimals, not the currency-style default of 2, and must
 * keep doing so.
 */
export function formatCents(
  cents: number,
  locale?: string,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "USD", ...options }).format(
    (cents ?? 0) / 100,
  );
}

/**
 * Same USD formatting, but the input is already a plain dollar amount (not
 * cents) — for the handful of places that store/aggregate revenue as dollars
 * rather than cents. Do NOT feed a cents value here (it would read 100x too
 * small) or a dollar value into formatCents (100x too large) — check which
 * one the caller actually holds before using either.
 */
export function formatDollars(
  dollars: number,
  locale?: string,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "USD", ...options }).format(
    dollars ?? 0,
  );
}

/**
 * Abbreviated USD display for large KPI numbers (MRR/ARR-style cards):
 * "$1.2M" / "$3.4K" / "$820.00". Input is CENTS (confirmed against its only
 * caller, super-admin/page.tsx's RealKpis.mrr/arr, both typed `// cents`).
 *
 * This is a MOVE of super-admin/page.tsx's local `formatDollars(cents)` —
 * same thresholds (>=1_000_000 → M, >=1_000 → K), same decimals (2 for M,
 * 1 for K, 2 below 1_000), same hardcoded "$"/"M"/"K" — not a redesign, and
 * NOT locale-aware (unlike formatCents/formatDollars above): the abbreviated
 * suffixes are literal English letters, not an Intl.NumberFormat feature, so
 * there is no locale parameter here. i18n-izing the "M"/"K" suffixes
 * themselves is a separate future decision, out of scope for this move.
 */
export function formatCompact(cents: number): string {
  const dollars = (cents ?? 0) / 100;
  if (dollars >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(2)}M`;
  if (dollars >= 1_000) return `$${(dollars / 1_000).toFixed(1)}K`;
  return `$${dollars.toFixed(2)}`;
}
