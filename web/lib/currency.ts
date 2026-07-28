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
 */
export function formatCents(cents: number, locale?: string): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "USD" }).format(
    (cents ?? 0) / 100,
  );
}
