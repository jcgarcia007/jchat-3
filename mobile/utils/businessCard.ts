/**
 * JChat 3.0 — pure helpers of the business card (components/map/BusinessPreviewCard.tsx).
 * No React, no theme: they run in Node tests (scripts/business-card.test.mjs).
 */

import { formatDistanceMeters } from './distance';

/**
 * The distance text of the card — the app's one rule lives in utils/distance.ts (H-048): feet in 50s under 0.1 mi / metres in 10s under 1 km,
 * then one decimal; `here` ("Aquí" / "Here") instead of "0 ft" when standing at the venue. A bad value (negative, NaN) is 0.
 */
export function formatMeters(meters: number, kilometers: boolean, here?: string): string {
  return formatDistanceMeters(meters, kilometers, here);
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
