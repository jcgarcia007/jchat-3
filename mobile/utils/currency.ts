/**
 * Central USD currency formatter for the mobile app. Amounts are always cents
 * from the server (orders, cart lines, gifts) — this only formats them for
 * display, it never computes or rounds a real total.
 *
 * currency is fixed to "usd" (same confirmed assumption as web/lib/currency.ts
 * — no per-business currency column, no DOP signal anywhere in the project).
 *
 * Uses Intl.NumberFormat (not a manual `$${(cents/100).toFixed(2)}` string):
 * this Expo SDK 56 / React Native 0.85 project runs on Hermes with
 * hermesEnabled=true on both platforms (android/gradle.properties,
 * ios/Podfile) and no jsEngine override to JSC — modern Hermes ships full
 * ICU-backed Intl (NumberFormat with style:'currency' included) by default,
 * no polyfill needed. Intl.DateTimeFormat is already used successfully in
 * production on this exact build (getDayLabels, BusinessPreviewCard.tsx).
 */
export function formatCents(cents: number, locale?: string): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "USD" }).format(
    (cents ?? 0) / 100,
  );
}
