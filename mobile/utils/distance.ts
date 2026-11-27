/**
 * JChat 3.0 — the ONE distance text of the app (H-048): offers feed, business card, Cerca de ti and the map all use this.
 * Pure (no React, no native modules): it runs in Node tests (scripts/distance.test.mjs).
 *
 *   Imperial (US and its territories):  < 0.1 mi → feet in steps of 50 ("350 ft"), then miles with ONE decimal ("0.3 mi", "12.4 mi").
 *   Metric (everywhere else):           < 1 km  → metres in steps of 10 ("450 m"), then km with ONE decimal ("1.4 km", "15.0 km").
 *   Standing at the venue (the rounded value would be 0): the caller's "Here" / "Aquí" instead of "0 ft" — or "0 ft" / "0 m" when none is given.
 * Never a whole-mile rounding, and a bad value (negative, NaN) counts as 0.
 */

export const METERS_PER_MILE = 1609.344;
const FEET_PER_METER = 3.28084;

/** Regions that measure in miles and feet; everyone else sees km and metres. */
const IMPERIAL_REGIONS: ReadonlySet<string> = new Set(['US', 'PR', 'GU', 'VI', 'AS', 'MP']);

/** True when the device region (ISO 3166-1 alpha-2, e.g. "DO") uses the metric system. */
export function isMetricRegion(regionCode: string | null | undefined): boolean {
  return !(typeof regionCode === 'string' && IMPERIAL_REGIONS.has(regionCode.toUpperCase()));
}

function sane(meters: number): number {
  return Number.isFinite(meters) && meters > 0 ? meters : 0;
}

/** Would the text be "0 ft" / "0 m"? Then the screens say "Here" instead. */
export function isHere(meters: number, metric: boolean): boolean {
  const m = sane(meters);
  if (metric) return Math.round(m / 10) * 10 === 0;
  return m / METERS_PER_MILE < 0.1 && Math.round((m * FEET_PER_METER) / 50) * 50 === 0;
}

/** The distance text. `here` is shown instead of "0 ft" / "0 m" when given. */
export function formatDistanceMeters(meters: number, metric: boolean, here?: string): string {
  const m = sane(meters);
  if (here !== undefined && isHere(m, metric)) return here;
  if (metric) {
    const rounded = Math.round(m / 10) * 10;
    if (m < 1000 && rounded < 1000) return `${rounded} m`;
    return `${(m / 1000).toFixed(1)} km`;
  }
  const miles = m / METERS_PER_MILE;
  if (miles < 0.1) return `${Math.round((m * FEET_PER_METER) / 50) * 50} ft`;
  return `${miles.toFixed(1)} mi`;
}
