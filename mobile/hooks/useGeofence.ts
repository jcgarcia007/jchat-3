/**
 * JChat 3.0 — useGeofence hook (Task 4.3)
 *
 * Tracks the device position and fires `onVenueDwelled` when the user has
 * been continuously inside a venue's geofence radius for ≥30 seconds AND
 * `canNotify` passes all rate-limit checks.
 *
 * Dwell timer behaviour:
 *   - A per-venue timer starts when the user enters the geofence.
 *   - If the user leaves before 30s elapse the timer is cleared (drive-by guard).
 *   - If the user re-enters, the timer restarts from zero.
 *   - On dwell completion (30s inside), `canNotify` is checked; if it passes,
 *     `onVenueDwelled` is called. The caller is responsible for dispatching the
 *     notification and calling `recordNotification(venueId)` afterwards.
 *
 * Cleanup:
 *   - The position watcher is removed on unmount.
 *   - All pending dwell timers are cleared on unmount.
 *
 * Usage:
 * ```tsx
 * useGeofence({
 *   venues: nearbyVenues,
 *   mode: userProximityMode,
 *   context: { favoriteVenueIds, visitedVenueIds },
 *   onVenueDwelled: async (venue) => {
 *     await scheduleLocalNotification(venue);
 *     await recordNotification(venue.id);
 *   },
 * });
 * ```
 *
 * PRIVACY: device coordinates are processed in-memory only; they are never
 * stored or transmitted to any server.
 *
 * TODO(background): when background location is enabled (post Task 4.3),
 * the dwell logic moves into a TaskManager background task. This hook
 * handles the foreground path only.
 */

import { useEffect, useRef } from 'react';
import {
  watchPosition,
  isWithinRadius,
  canNotify,
  type Venue,
  type Coords,
  type ProximityMode,
  type ProximityContext,
} from '../services/geofence';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Milliseconds the user must remain continuously inside a geofence to trigger. */
const DWELL_DURATION_MS = 30_000;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface UseGeofenceOptions {
  /** List of venues to check against. May change between renders. */
  venues: readonly Venue[];
  /** User's current proximity notification mode. */
  mode: ProximityMode;
  /** Favourites / visited sets for mode evaluation. */
  context: ProximityContext;
  /**
   * Called when a venue dwell completes (30s inside) AND canNotify passes.
   * The caller should dispatch the notification, then call
   * `recordNotification(venue.id)` to commit the rate-limit record.
   */
  onVenueDwelled: (venue: Venue) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Subscribes to continuous device location updates and evaluates venue
 * geofences with a 30-second dwell gate and proximity-rate-limit checks.
 *
 * Mount effect: starts the position watcher.
 * Unmount effect: stops the watcher and clears all pending dwell timers.
 */
export function useGeofence({
  venues,
  mode,
  context,
  onVenueDwelled,
}: UseGeofenceOptions): void {
  /**
   * Map of venueId → NodeJS.Timeout handle for pending dwell timers.
   * Using a ref so mutations don't trigger re-renders.
   */
  const dwellTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  /**
   * Stable ref to options that change between renders.
   * We capture them in a ref inside the watcher callback so the watcher
   * closure always reads the latest values without re-subscribing.
   */
  const optionsRef = useRef<UseGeofenceOptions>({ venues, mode, context, onVenueDwelled });
  useEffect(() => {
    optionsRef.current = { venues, mode, context, onVenueDwelled };
  });

  useEffect(() => {
    /** Handles a new position fix from expo-location. */
    const handlePosition = (coords: Coords): void => {
      const { venues: currentVenues, mode: currentMode, context: currentContext, onVenueDwelled: onDwelled } =
        optionsRef.current;
      const timers = dwellTimers.current;

      for (const venue of currentVenues) {
        const inside = isWithinRadius(
          coords.lat,
          coords.lng,
          venue.lat,
          venue.lng,
          venue.radius_m,
        );

        if (inside) {
          // User is inside — start a dwell timer if one isn't already running.
          if (!timers.has(venue.id)) {
            const handle = setTimeout(() => {
              // Dwell completed: run the async canNotify check.
              // We spawn the async work outside the synchronous timer callback.
              timers.delete(venue.id);
              void canNotify(venue.id, currentMode, venue, currentContext).then(
                (allowed) => {
                  if (allowed) {
                    onDwelled(venue);
                  }
                },
              );
            }, DWELL_DURATION_MS);

            timers.set(venue.id, handle);
          }
        } else {
          // User left the geofence — cancel any pending dwell timer (drive-by guard).
          const handle = timers.get(venue.id);
          if (handle !== undefined) {
            clearTimeout(handle);
            timers.delete(venue.id);
          }
        }
      }
    };

    // Start watching position; capture the remover for cleanup.
    const removeWatcher = watchPosition(handlePosition);

    return () => {
      // Stop the location watcher.
      removeWatcher();

      // Cancel all pending dwell timers.
      for (const handle of dwellTimers.current.values()) {
        clearTimeout(handle);
      }
      dwellTimers.current.clear();
    };
    // We deliberately exclude options from deps — they are read via optionsRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
