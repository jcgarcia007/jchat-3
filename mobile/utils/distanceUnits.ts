import { getLocales } from 'expo-localization';
import { formatDistanceMeters, isHere, isMetricRegion, METERS_PER_MILE } from './distance';

/** Feed radius options, always stored and sent in miles. */
export const FEED_RADIUS_OPTIONS = [5, 10, 25, 50, 100] as const;
export type FeedRadiusMiles = (typeof FEED_RADIUS_OPTIONS)[number];
export const DEFAULT_FEED_RADIUS_MILES: FeedRadiusMiles = 50;

const KM_BY_RADIUS: Record<FeedRadiusMiles, number> = { 5: 8, 10: 16, 25: 40, 50: 80, 100: 160 };

export function isFeedRadiusMiles(value: unknown): value is FeedRadiusMiles {
  return typeof value === 'number' && (FEED_RADIUS_OPTIONS as readonly number[]).includes(value);
}

/** The device region decides (H-048): the US and its territories see miles and feet, everyone else km and metres. Stored values stay in miles. */
export function usesKilometers(): boolean {
  try {
    return isMetricRegion(getLocales()[0]?.regionCode);
  } catch {
    return false;
  }
}

/** "50 mi" or "80 km" for one of the selectable radii. */
export function formatRadius(miles: FeedRadiusMiles, kilometers: boolean = usesKilometers()): string {
  return kilometers ? `${KM_BY_RADIUS[miles]} km` : `${miles} mi`;
}

/** Distance from a value in miles (the offers feed), with the app's one distance rule (utils/distance.ts): never a whole-mile rounding. */
export function formatDistance(miles: number, kilometers: boolean = usesKilometers(), here?: string): string {
  return formatDistanceMeters(miles * METERS_PER_MILE, kilometers, here);
}

/** The feed value in miles is "here" (standing at the venue): the card says "Here" instead of "a 0 ft". */
export function isHereMiles(miles: number, kilometers: boolean = usesKilometers()): boolean {
  return isHere(miles * METERS_PER_MILE, kilometers);
}
