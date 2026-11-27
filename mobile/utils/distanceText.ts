/**
 * JChat 3.0 — the screens' entry to the app's one distance rule (H-048): device-region units + the "Here" / "Aquí" text of the current language.
 * The rule itself is pure and lives in utils/distance.ts (tested in Node); this file only joins it to the device and to i18n.
 */

import i18n from '../i18n';
import { formatDistanceMeters } from './distance';
import { formatDistance, isHereMiles, usesKilometers } from './distanceUnits';

/** "Aquí" / "Here": what the distance says when the person is standing at the venue. */
export function hereLabel(): string {
  return i18n.t('distanceHere', { ns: 'common' });
}

/** The offers feed ("a 0.3 mi" / "0.3 mi away"): the same rule from a value in miles; at the venue it says just "Here". */
export function distanceAwayText(miles: number, away: (distance: string) => string): string {
  return isHereMiles(miles) ? hereLabel() : away(formatDistance(miles));
}

/** The distance text for a value in metres: region units, "Here" at the venue. */
export function distanceText(meters: number): string {
  return formatDistanceMeters(meters, usesKilometers(), hereLabel());
}
