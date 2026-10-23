/**
 * JChat 3.0 — pure helpers of the business card (components/map/BusinessPreviewCard.tsx).
 * No React, no theme: they run in Node tests (scripts/business-card.test.mjs).
 */

const METERS_PER_MILE = 1609.344;
const FEET_PER_METER = 3.28084;

/**
 * "1.2 km" / "850 m" (kilometers) or "0.3 mi" / "400 ft" (miles). One decimal under 10, none above; under 0.1 mi the
 * feet are rounded to 10. A bad value (negative, NaN) is 0.
 */
export function formatMeters(meters: number, kilometers: boolean): string {
  const m = Number.isFinite(meters) && meters > 0 ? meters : 0;
  if (kilometers) {
    if (m < 1000) return `${Math.round(m)} m`;
    const km = m / 1000;
    return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
  }
  const miles = m / METERS_PER_MILE;
  if (miles < 0.1) return `${Math.round((m * FEET_PER_METER) / 10) * 10} ft`;
  return `${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi`;
}

const COUNTRY_SEGMENT = /^(usa|us|u\.s\.a?\.?|united states( of america)?|estados unidos|ee\.? ?uu\.?|rep[uú]blica dominicana|dominican republic)$/i;
/** "FL 33314", "FL", "33314", "33314-1234": the state and zip tail of a US address. */
const STATE_ZIP_SEGMENT = /^([a-z]{2}(\s+\d{5}(-\d{4})?)?|\d{4,6}(-\d{4})?)$/i;

/**
 * The city of an address: its last useful segment ("…, Davie, FL 33314, USA" → "Davie"). The trailing country and
 * the state / zip segments are dropped; what is left must not look like a street (no digits) and must not be the
 * only segment (a bare street). Null when the city can't be told: the card then shows the distance alone.
 */
export function cityFromAddress(address: string | null | undefined): string | null {
  const segments = (address ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  while (segments.length > 0 && COUNTRY_SEGMENT.test(segments[segments.length - 1])) segments.pop();
  while (segments.length > 0 && STATE_ZIP_SEGMENT.test(segments[segments.length - 1])) segments.pop();
  if (segments.length < 2) return null;
  const candidate = segments[segments.length - 1];
  return /\d/.test(candidate) ? null : candidate;
}
