/**
 * JChat 3.0 — review mode, app side: the two calls the app makes (migration 262). Everything else is decided on the server.
 *   review_bypass_businesses()  the venues for which the caller has the bypass right now (empty for every real user)
 *   review_join_room(room)      enters a group venue's room without coordinates (false for everyone else; writes nothing then)
 */

import { isSupabaseConfigured, supabase } from './supabase';

const CACHE_MS = 5 * 60 * 1000;
let cache: { ids: Set<string>; at: number } | null = null;

export function clearReviewModeCache(): void {
  cache = null;
}

/** Never rejects; a failure is "no venue" (the normal rules apply). */
export async function fetchReviewBypassIds(now: number = Date.now()): Promise<Set<string>> {
  if (!isSupabaseConfigured) return new Set();
  if (cache && now - cache.at < CACHE_MS) return cache.ids;
  try {
    const { data, error } = await supabase.rpc('review_bypass_businesses' as never);
    if (error || !Array.isArray(data)) return new Set();
    const ids = new Set<string>((data as unknown[]).filter((v): v is string => typeof v === 'string'));
    cache = { ids, at: now };
    return ids;
  } catch {
    return new Set();
  }
}

/** True when the server let the person into the room without coordinates. Never rejects. */
export async function joinRoomForReview(roomId: string): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  try {
    const { data, error } = await supabase.rpc('review_join_room' as never, { _room_id: roomId } as never);
    return !error && data === true;
  } catch {
    return false;
  }
}
