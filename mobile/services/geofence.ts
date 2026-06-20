/**
 * JChat 3.0 — Geofence service (Task 4.3)
 *
 * Canonical geolocation + geofencing logic for the mobile app.
 *
 * Responsibilities:
 *   - Haversine distance formula (haversineMeters, isWithinRadius)
 *   - Device location permissions (foreground + always/background)
 *   - One-shot position fetch (getCurrentPosition)
 *   - Continuous position watcher (watchPosition) → returns remover
 *   - Venue inside-check (checkInsideVenue) — used by check-in + moderator gating
 *   - Proximity dwell + rate-limit data layer (used by Task 4.4 / useGeofence):
 *       · 30-second dwell: timer resets if the user leaves before 30s
 *       · Max 3 proximity notifications per calendar day (AsyncStorage)
 *       · Max 1 notification per venue per 2 hours (AsyncStorage)
 *       · ProximityMode gate: All / Favorites / Visited / Off
 *
 * PRIVACY — GPS data is NEVER written to the DB or logged.
 * This module is the only place that calls expo-location; all callers receive
 * coordinates in-memory only.
 *
 * TODO(background): Background location tracking (always-on geofence while the
 * app is suspended) requires registering a TaskManager background task with
 * expo-task-manager. This is intentionally deferred:
 *   1. Call `requestAlwaysPermission()` first (already exported here).
 *   2. Register a named task via `Location.startLocationUpdatesAsync(TASK_NAME, opts)`.
 *   3. Define the task body with `TaskManager.defineTask(TASK_NAME, callback)`.
 *   4. Ship the updated app.config.ts with `"UIBackgroundModes": ["location"]` (iOS)
 *      and the ACCESS_BACKGROUND_LOCATION permission (Android).
 *   Stage 4 wires this up after the foreground path (Task 4.3) is complete.
 */

import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─────────────────────────────────────────────────────────────────────────────
// Co-located Types
// ─────────────────────────────────────────────────────────────────────────────

/** Decimal-degree coordinate pair. */
export interface Coords {
  lat: number;
  lng: number;
}

/**
 * Minimal venue shape needed for geofence checks.
 * Callers may pass a richer business row — only these fields are consumed here.
 */
export interface Venue {
  /** Supabase business UUID */
  id: string;
  lat: number;
  lng: number;
  /** Geofence radius in metres (from businesses.geofence_radius or owner config). */
  radius_m: number;
}

/**
 * Proximity notification mode controlled by the user in Settings → Privacy.
 *
 * - "all"       → notify for any venue the user is near
 * - "favorites" → notify only when the venue is in the user's favourites
 * - "visited"   → notify only for venues the user has previously checked in to
 * - "off"       → disable proximity notifications entirely
 */
export type ProximityMode = 'all' | 'favorites' | 'visited' | 'off';

/** Context injected by the caller so `proximityModeAllows` can evaluate modes. */
export interface ProximityContext {
  /** IDs of the user's favourite venues. */
  favoriteVenueIds: ReadonlySet<string>;
  /** IDs of venues the user has previously visited (checked in). */
  visitedVenueIds: ReadonlySet<string>;
}

// ─────────────────────────────────────────────────────────────────────────────
// AsyncStorage Key Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Returns today's date as YYYY-MM-DD (device local time) for daily key scoping. */
function todayKey(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** AsyncStorage key for the day's proximity notification count. */
const DAILY_COUNT_KEY = () => `jchat:prox:daily:${todayKey()}`;

/** AsyncStorage key storing the ISO timestamp of the last notification for a venue. */
const VENUE_LAST_KEY = (venueId: string) => `jchat:prox:venue:${venueId}`;

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Maximum proximity notifications allowed per calendar day. */
const MAX_DAILY_NOTIFICATIONS = 3;

/** Minimum milliseconds between notifications for the same venue (2 hours). */
const MIN_VENUE_INTERVAL_MS = 2 * 60 * 60 * 1_000;

// ─────────────────────────────────────────────────────────────────────────────
// Haversine Math
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the great-circle distance in metres between two WGS-84 coordinates.
 * Uses the haversine formula — accurate to within ~0.5% for terrestrial distances.
 */
export function haversineMeters(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const R = 6_371_000; // Earth mean radius in metres
  const toRad = (deg: number): number => (deg * Math.PI) / 180;

  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);

  const a =
    sinDLat * sinDLat +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * sinDLng * sinDLng;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Returns true when the user's position is within `radiusM` metres of the
 * venue's position.  This is the canonical geofence predicate used across
 * the app (check-in gate, moderator gating, proximity dwell).
 */
export function isWithinRadius(
  userLat: number,
  userLng: number,
  venueLat: number,
  venueLng: number,
  radiusM: number,
): boolean {
  return haversineMeters(userLat, userLng, venueLat, venueLng) <= radiusM;
}

// ─────────────────────────────────────────────────────────────────────────────
// Permission Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Request foreground ("when-in-use") location permission.
 * Returns true when permission was granted, false otherwise.
 */
export async function requestForegroundPermission(): Promise<boolean> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === Location.PermissionStatus.GRANTED;
}

/**
 * Request always-on ("background") location permission.
 *
 * On iOS this shows the "Always Allow" prompt only after the user has already
 * granted foreground permission, so call `requestForegroundPermission()` first.
 *
 * Returns true when the always permission is granted.
 *
 * TODO(background): After this returns true, register the background location
 * task with `Location.startLocationUpdatesAsync(TASK_NAME, options)` and define
 * the task body with `TaskManager.defineTask(TASK_NAME, callback)`.
 * See the module-level TODO for the full checklist.
 */
export async function requestAlwaysPermission(): Promise<boolean> {
  const { status } = await Location.requestBackgroundPermissionsAsync();
  return status === Location.PermissionStatus.GRANTED;
}

// ─────────────────────────────────────────────────────────────────────────────
// Position Fetch & Watch
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One-shot: fetch the device's current position.
 *
 * Requires foreground permission to already be granted.
 * Throws if location services are unavailable or permission is denied.
 */
export async function getCurrentPosition(): Promise<Coords> {
  const location = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });
  return {
    lat: location.coords.latitude,
    lng: location.coords.longitude,
  };
}

/**
 * Continuous position watcher — invokes `cb` on every location update.
 *
 * Returns a remover function; call it (e.g. in useEffect cleanup) to stop watching.
 *
 * ```ts
 * const remove = watchPosition((coords) => { ... });
 * // later:
 * remove();
 * ```
 *
 * Requires foreground permission to be granted before calling.
 */
export function watchPosition(cb: (coords: Coords) => void): () => void {
  let subscriptionPromise: Promise<Location.LocationSubscription> | null = null;
  let removed = false;

  subscriptionPromise = Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 5_000,   // ms — update at most every 5 s
      distanceInterval: 10,  // metres — update only when moved ≥10 m
    },
    (location) => {
      cb({
        lat: location.coords.latitude,
        lng: location.coords.longitude,
      });
    },
  );

  // If remove() was called synchronously before the subscription resolved,
  // immediately remove it when the promise settles.
  return () => {
    removed = true;
    if (subscriptionPromise !== null) {
      subscriptionPromise.then((sub) => sub.remove()).catch(() => undefined);
      subscriptionPromise = null;
    }
    void removed; // suppress unused-var lint
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Venue Inside-Check
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true when the device's current position is inside the venue's
 * geofence radius.
 *
 * Used by:
 *   - Check-in button (CheckInButton.tsx) to gate the check-in action.
 *   - Moderator gating (moderator cannot moderate from outside the venue).
 *
 * Throws if location permission is not granted or location fetch fails.
 *
 * PRIVACY: the returned boolean is used in-memory only — the raw coords are
 * never stored or transmitted.
 */
export async function checkInsideVenue(venue: Venue): Promise<boolean> {
  const coords = await getCurrentPosition();
  return isWithinRadius(coords.lat, coords.lng, venue.lat, venue.lng, venue.radius_m);
}

// ─────────────────────────────────────────────────────────────────────────────
// Proximity Rate-Limit Helpers (AsyncStorage)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the number of proximity notifications sent today.
 * Reads from AsyncStorage; returns 0 on read error.
 */
export async function getTodayCount(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(DAILY_COUNT_KEY());
    return raw !== null ? parseInt(raw, 10) || 0 : 0;
  } catch {
    return 0;
  }
}

/**
 * Increments today's proximity notification count by 1.
 * Safe to call after `canNotify` returns true.
 */
async function incrementTodayCount(): Promise<void> {
  const current = await getTodayCount();
  await AsyncStorage.setItem(DAILY_COUNT_KEY(), String(current + 1));
}

/**
 * Records that a proximity notification was sent for `venueId` right now.
 * Writes two keys:
 *   - `VENUE_LAST_KEY(venueId)` → ISO timestamp of now
 *   - `DAILY_COUNT_KEY()` → incremented count
 *
 * Call this only after `canNotify` returns true AND the notification is
 * actually dispatched so the count stays accurate.
 */
export async function recordNotification(venueId: string): Promise<void> {
  await Promise.all([
    AsyncStorage.setItem(VENUE_LAST_KEY(venueId), new Date().toISOString()),
    incrementTodayCount(),
  ]);
}

/**
 * Returns the ISO string of when the last notification was sent for this
 * venue, or null if no record exists.
 */
async function getVenueLastNotifiedAt(venueId: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(VENUE_LAST_KEY(venueId));
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ProximityMode Gate
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true if the `mode` setting allows a notification for `venue`,
 * given the user's favourites and visited sets in `context`.
 *
 * - "off"       → always false
 * - "all"       → always true
 * - "favorites" → true only if venue.id is in context.favoriteVenueIds
 * - "visited"   → true only if venue.id is in context.visitedVenueIds
 */
export function proximityModeAllows(
  mode: ProximityMode,
  venue: Venue,
  context: ProximityContext,
): boolean {
  switch (mode) {
    case 'off':
      return false;
    case 'all':
      return true;
    case 'favorites':
      return context.favoriteVenueIds.has(venue.id);
    case 'visited':
      return context.visitedVenueIds.has(venue.id);
    default: {
      // Exhaustive check — TypeScript will error if a new mode is added without
      // handling it here.
      const _exhaustive: never = mode;
      void _exhaustive;
      return false;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// canNotify
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true when ALL of the following pass:
 *   1. `mode` is not "off"
 *   2. `proximityModeAllows(mode, venue, context)` is true
 *   3. Today's notification count < MAX_DAILY_NOTIFICATIONS (3)
 *   4. The last notification for this venue was > 2 hours ago (or never)
 *
 * Does NOT record the notification — call `recordNotification(venueId)` after
 * the notification is actually dispatched.
 */
export async function canNotify(
  venueId: string,
  mode: ProximityMode,
  venue: Venue,
  context: ProximityContext,
): Promise<boolean> {
  // Gate 1+2: mode check
  if (!proximityModeAllows(mode, venue, context)) {
    return false;
  }

  // Gate 3: daily cap
  const todayCount = await getTodayCount();
  if (todayCount >= MAX_DAILY_NOTIFICATIONS) {
    return false;
  }

  // Gate 4: per-venue 2h cooldown
  const lastAt = await getVenueLastNotifiedAt(venueId);
  if (lastAt !== null) {
    const lastMs = new Date(lastAt).getTime();
    if (Date.now() - lastMs < MIN_VENUE_INTERVAL_MS) {
      return false;
    }
  }

  return true;
}
