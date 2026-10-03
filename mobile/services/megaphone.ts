import { getCurrentPosition, hasForegroundPermission } from './geofence';
import { isSupabaseConfigured, supabase } from './supabase';

export type MegaphoneKind = 'offer' | 'post';

export interface MegaphoneItem {
  kind: MegaphoneKind;
  id: string;
  business_id: string;
  business_name: string;
  business_slug: string | null;
  icon_emoji: string | null;
  logo_url: string | null;
  room_id: string | null;
  title: string | null;
  body: string | null;
  discount: string | null;
  code: string | null;
  expires_at: string | null;
  media_urls: string[];
  created_at: string;
  distance_miles: number | null;
  like_count: number | null;
  comment_count: number | null;
  liked_by_me: boolean | null;
}

export interface FetchMegaphoneParams {
  lat: number | null;
  lng: number | null;
  radiusMiles: number;
  /** created_at of the last item already loaded (keyset pagination). */
  before?: string | null;
}

export const MEGAPHONE_PAGE_SIZE = 20;
const LOCATION_TIMEOUT_MS = 8_000;

interface MegaphoneRow extends Omit<MegaphoneItem, 'media_urls' | 'distance_miles' | 'like_count' | 'comment_count'> {
  media_urls: string[] | null;
  distance_miles: number | null;
  like_count: number | string | null;
  comment_count: number | string | null;
}

function toCount(value: number | string | null): number | null {
  return value === null ? null : Number(value);
}

/** Offers + business posts from verified businesses, newest first, within the radius. */
export async function fetchMegaphoneFeed(params: FetchMegaphoneParams): Promise<MegaphoneItem[]> {
  if (!isSupabaseConfigured) return [];

  const { data, error } = await supabase.rpc('megaphone_feed', {
    p_lat: params.lat,
    p_lng: params.lng,
    p_radius_miles: params.radiusMiles,
    p_before: params.before ?? null,
    p_limit: MEGAPHONE_PAGE_SIZE,
  });
  if (error) throw error;

  return ((data ?? []) as MegaphoneRow[]).map((row) => ({
    ...row,
    media_urls: row.media_urls ?? [],
    like_count: toCount(row.like_count),
    comment_count: toCount(row.comment_count),
  }));
}

/**
 * Current position for the feed, or null. NEVER prompts for permission: when
 * foreground location is not already granted (or the fix is slow/fails) the feed
 * simply loads without a position.
 */
export async function getFeedCoords(): Promise<{ lat: number; lng: number } | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    if (!(await hasForegroundPermission())) return null;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('location_timeout')), LOCATION_TIMEOUT_MS);
    });
    return await Promise.race([getCurrentPosition(), timeout]);
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
