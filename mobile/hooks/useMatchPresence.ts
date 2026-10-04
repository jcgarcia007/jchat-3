/**
 * JChat 3.0 — useMatchPresence (Fase D1)
 *
 * Runs match_check_in for the venue every time the geofence gate produces a GPS reading
 * (entry + 5-min heartbeat): ONE GPS read per heartbeat, shared with the geofence check.
 * Results go to the shared presence store (services/matchPresence) so every Match screen
 * can show/require presence. A scanned venue QR activates instantly via checkInWithQr().
 *
 * Mounted by the chat screen only: while it stays mounted (Match screens sit on top of it in
 * the stack) the heartbeat keeps running; unmounting resets the store. The server expires
 * presence after 15 minutes without a heartbeat.
 */

import { useCallback, useEffect, useRef } from 'react';
import type { GeoReading } from '../screens/chat/useGeofenceGate';
import { matchCheckIn } from '../services/match';
import { getMatchPresence, resetMatchPresence, setMatchPresence } from '../services/matchPresence';

interface UseMatchPresenceArgs {
  businessId: string | null;
  roomId: string;
  /** Match available at the venue, user opted in, and already inside the chat. */
  enabled: boolean;
  /** Latest reading from useGeofenceGate (lastCoords). A new `readAt` triggers a check-in. */
  reading: GeoReading | null;
}

interface UseMatchPresenceResult {
  /** Activates presence instantly with a venue QR token (reuses the latest reading, if any). */
  checkInWithQr: (qrToken: string) => Promise<boolean>;
}

export function useMatchPresence({
  businessId,
  roomId,
  enabled,
  reading,
}: UseMatchPresenceArgs): UseMatchPresenceResult {
  const readingRef = useRef(reading);
  readingRef.current = reading;
  const inFlightRef = useRef(false);

  const run = useCallback(
    async (qrToken?: string): Promise<boolean> => {
      if (!businessId || inFlightRef.current) return false;
      inFlightRef.current = true;
      const previous = getMatchPresence();
      const sameVenue = previous.businessId === businessId;
      setMatchPresence({
        businessId,
        roomId,
        // Keep showing 'active' while a heartbeat renews; show 'checking' otherwise.
        status: sameVenue && previous.status === 'active' ? 'active' : 'checking',
        error: false,
      });
      try {
        const r = readingRef.current;
        const result = await matchCheckIn({
          businessId,
          lat: r?.lat,
          lng: r?.lng,
          qrToken,
          mocked: r?.mocked === true,
        });
        setMatchPresence({
          businessId,
          roomId,
          status: result.status,
          reason: result.status === 'denied' ? (result.reason ?? 'unavailable') : null,
          expiresAt: result.expires_at ?? null,
          method: result.method ?? null,
          error: false,
        });
        return result.status === 'active';
      } catch {
        // Network/server hiccup: keep the previous status, flag the error, retry next heartbeat.
        setMatchPresence({
          businessId,
          roomId,
          status: sameVenue ? previous.status : 'pending',
          error: true,
        });
        return false;
      } finally {
        inFlightRef.current = false;
      }
    },
    [businessId, roomId],
  );

  // Heartbeat: one check-in per new GPS reading (enter + every geofence heartbeat).
  useEffect(() => {
    if (!enabled || !businessId || !reading) return;
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a new reading (readAt) should fire it
  }, [enabled, businessId, reading?.readAt]);

  // Not enabled (opted out / Match off / left): clear the shared state.
  useEffect(() => {
    if (!enabled) resetMatchPresence();
  }, [enabled]);

  // Unmount of the chat → no heartbeat anymore.
  useEffect(() => () => resetMatchPresence(), []);

  const checkInWithQr = useCallback((qrToken: string) => run(qrToken), [run]);

  return { checkInWithQr };
}
