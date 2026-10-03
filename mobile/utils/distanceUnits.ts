import { getLocales } from 'expo-localization';

/** Feed radius options, always stored and sent in miles. */
export const FEED_RADIUS_OPTIONS = [5, 10, 25, 50, 100] as const;
export type FeedRadiusMiles = (typeof FEED_RADIUS_OPTIONS)[number];
export const DEFAULT_FEED_RADIUS_MILES: FeedRadiusMiles = 50;

const KM_BY_RADIUS: Record<FeedRadiusMiles, number> = { 5: 8, 10: 16, 25: 40, 50: 80, 100: 160 };
const KM_PER_MILE = 1.609344;

export function isFeedRadiusMiles(value: unknown): value is FeedRadiusMiles {
  return typeof value === 'number' && (FEED_RADIUS_OPTIONS as readonly number[]).includes(value);
}

/** Dominican Republic users see kilometers; everyone else miles. Stored values stay in miles. */
export function usesKilometers(): boolean {
  try {
    return getLocales()[0]?.regionCode === 'DO';
  } catch {
    return false;
  }
}

/** "50 mi" or "80 km" for one of the selectable radii. */
export function formatRadius(miles: FeedRadiusMiles, kilometers: boolean = usesKilometers()): string {
  return kilometers ? `${KM_BY_RADIUS[miles]} km` : `${miles} mi`;
}

/** Rounded distance ("2 mi" / "3 km"), never below 1. */
export function formatDistance(miles: number, kilometers: boolean = usesKilometers()): string {
  const value = kilometers ? miles * KM_PER_MILE : miles;
  return `${Math.max(1, Math.round(value))} ${kilometers ? 'km' : 'mi'}`;
}
