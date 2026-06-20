/**
 * JChat 3.0 — Proximity Notifications service (Task 4.4)
 *
 * Fires a local notification when the user dwells inside a venue's geofence
 * for ≥30 seconds (dwell timer is owned by `useGeofence` / `mobile/hooks/useGeofence`).
 *
 * Responsibilities:
 *   - Mode filtering: All / Favorites / Visited / Off
 *   - Rate-limit gate: delegate to geofence's `canNotify` (3/day, 2h/venue).
 *   - Notification content: "{Business name} is active now — {N} people inside"
 *   - Notification data payload: `{ type: 'proximity', businessId }` for tap routing.
 *   - Recording: delegate to geofence's `recordNotification` after dispatch.
 *   - Active user count: fetched from Supabase `check_ins` (graceful fallback to 0).
 *
 * Exports:
 *   - `fireProximityNotification(venue, mode, context)` — the main action.
 *   - `makeOnVenueDwelled(mode, context)`               — factory for useGeofence's
 *       `onVenueDwelled` callback (convenient one-liner for screen wiring).
 *   - `ProximityNotificationData`                       — the tap-descriptor type.
 *
 * PRIVACY: GPS coordinates are never stored, logged, or transmitted. This module
 * only reads in-memory `Venue` values; it never calls expo-location directly.
 *
 * TODO(i18n): all user-facing strings are English only.
 * TODO(map-wiring): wire `ProximityNotificationData` in the notification tap
 *   handler (e.g. `Notifications.addNotificationResponseReceivedListener`) to
 *   open `MapScreen` and surface the `BusinessPreviewCard` for `businessId`.
 *   The route descriptor shape is `{ type: 'proximity', businessId: string }`.
 */

import * as Notifications from 'expo-notifications';
import {
  canNotify,
  recordNotification,
  type Venue,
  type ProximityMode,
  type ProximityContext,
} from './geofence';
import { supabase, isSupabaseConfigured } from './supabase';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Notification data payload encoded in every proximity notification.
 *
 * When the user taps the notification, the registered response listener reads
 * this object and navigates to the Map tab, opening the BusinessPreviewCard
 * for `businessId`.
 *
 * TODO(map-wiring): In `AppNavigator.tsx` (or a top-level notification listener),
 * add a `Notifications.addNotificationResponseReceivedListener` that checks
 * `response.notification.request.content.data` and, when `type === 'proximity'`,
 * navigates to:
 *   navigation.navigate('Map', { openPreview: businessId })
 * or dispatches the equivalent deep-link action.
 * The BusinessPreviewCard (Task 4.2) accepts a `businessId` prop and renders
 * inline over the map.
 */
export interface ProximityNotificationData {
  type: 'proximity';
  businessId: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Queries the `check_ins` table for the number of active check-ins at `venueId`.
 *
 * "Active" is defined as check-ins with no `checked_out_at` timestamp, i.e.
 * the user is still present (the schema uses a nullable `checked_out_at` column).
 *
 * Returns 0 when Supabase is unconfigured or the query fails, so the notification
 * still fires with "0 people inside" rather than being suppressed.
 */
async function fetchActiveCount(venueId: string): Promise<number> {
  if (!isSupabaseConfigured) return 0;

  const { count, error } = await supabase
    .from('check_ins')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', venueId)
    .is('checked_out_at', null);

  if (error) {
    console.warn('[proximityNotifications] fetchActiveCount error:', error.message);
    return 0;
  }

  return count ?? 0;
}

/**
 * Queries the `businesses` table for the display name of `venueId`.
 *
 * Returns an empty string on failure; the notification body will degrade to
 * " is active now — …" which is still legible and doesn't block the send.
 */
async function fetchBusinessName(venueId: string): Promise<string> {
  if (!isSupabaseConfigured) return '';

  const { data, error } = await supabase
    .from('businesses')
    .select('name')
    .eq('id', venueId)
    .maybeSingle();

  if (error) {
    console.warn('[proximityNotifications] fetchBusinessName error:', error.message);
    return '';
  }

  return typeof data?.name === 'string' ? data.name : '';
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fires a local proximity notification for `venue` when all gates pass:
 *
 *   1. Mode filter — `canNotify` calls `proximityModeAllows`:
 *        - "off"       → blocked (returns immediately, no notification).
 *        - "all"       → allowed for any venue.
 *        - "favorites" → allowed only when venue.id ∈ context.favoriteVenueIds.
 *        - "visited"   → allowed only when venue.id ∈ context.visitedVenueIds
 *                        (checked against the `check_ins` table via context).
 *   2. Daily cap     — max 3 proximity notifications per calendar day (AsyncStorage).
 *   3. Venue cooldown — max 1 notification per venue per 2 hours (AsyncStorage).
 *
 * If all gates pass:
 *   - Fetches the business display name and active check-in count from Supabase.
 *   - Schedules a local notification with content:
 *       title: "{Business name} is active now — {N} people inside"
 *   - Encodes `{ type: 'proximity', businessId: venue.id }` in the notification
 *     data so the tap handler can open the BusinessPreviewCard on the map.
 *   - Calls `recordNotification(venue.id)` to commit the rate-limit record.
 *
 * @param venue   - The venue the user has dwelled in for ≥30s.
 * @param mode    - The user's current proximity notification mode.
 * @param context - Favourite and visited venue ID sets for mode evaluation.
 */
export async function fireProximityNotification(
  venue: Venue,
  mode: ProximityMode,
  context: ProximityContext,
): Promise<void> {
  // Gate: mode + daily cap + per-venue cooldown.
  const allowed = await canNotify(venue.id, mode, venue, context);
  if (!allowed) {
    return;
  }

  // Fetch display data in parallel to minimise latency before the notification fires.
  const [name, activeCount] = await Promise.all([
    fetchBusinessName(venue.id),
    fetchActiveCount(venue.id),
  ]);

  // Notification content — spec-exact wording.
  // TODO(i18n): wrap this string with the i18n translation function.
  const title = `${name} is active now — ${activeCount} people inside`;

  // Tap descriptor — see ProximityNotificationData JSDoc for the map-wiring TODO.
  const data: ProximityNotificationData = {
    type: 'proximity',
    businessId: venue.id,
  };

  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      // `body` is intentionally omitted — the full message fits in `title`.
      data: data as unknown as Record<string, unknown>,
    },
    trigger: null, // null = fire immediately (local, no delay).
  });

  // Record must happen AFTER the notification is dispatched so the count only
  // increments when the notification actually goes out.
  await recordNotification(venue.id);
}

/**
 * Factory that returns a callback compatible with `useGeofence`'s `onVenueDwelled`
 * option.  Wraps `fireProximityNotification` so callers don't have to close over
 * `mode` and `context` themselves.
 *
 * Usage in a screen or hook:
 * ```tsx
 * useGeofence({
 *   venues: nearbyVenues,
 *   mode: userProximityMode,
 *   context: { favoriteVenueIds, visitedVenueIds },
 *   onVenueDwelled: makeOnVenueDwelled(userProximityMode, proximityContext),
 * });
 * ```
 *
 * The returned callback is synchronous (matching `onVenueDwelled`'s `void` return
 * type) and spawns the async work with `void` to avoid floating-promise lint
 * errors at the call site.
 *
 * @param mode    - The user's current proximity notification mode.
 * @param context - Favourite and visited venue ID sets.
 * @returns A `(venue: Venue) => void` callback for `useGeofence`.
 */
export function makeOnVenueDwelled(
  mode: ProximityMode,
  context: ProximityContext,
): (venue: Venue) => void {
  return (venue: Venue): void => {
    void fireProximityNotification(venue, mode, context);
  };
}
