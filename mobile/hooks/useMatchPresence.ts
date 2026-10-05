/**
 * JChat 3.0 — useMatchPresence (Fase D1)
 *
 * Runs match_check_in for the venue every time the geofence gate produces a GPS reading
 * (entry + 5-min heartbeat): ONE GPS read per heartbeat, shared with the geofence check.
 * Results go to the shared presence store (services/matchPresence) so every Match screen
 * can show/require presence; a scanned venue QR activates instantly (matchCheckInWithQr).
 *
 * Mounted by the chat screen only: while it stays mounted (Match screens sit on top of it in
 * the stack) the heartbeat keeps running; unmounting resets the store. The server expires
 * presence after 15 minutes without a heartbeat.
 */

import { useEffect } from 'react';
import type { GeoReading } from '../screens/chat/useGeofenceGate';
import { markMatchHeartbeat, resetMatchPresence, runMatchCheckIn, setMatchReading } from '../services/matchPresence';

interface UseMatchPresenceArgs {
  businessId: string | null;
  roomId: string;
  /** Match available at the venue, user opted in, and already inside the chat. */
  enabled: boolean;
  /** Latest reading from useGeofenceGate (lastCoords). A new `readAt` triggers a check-in. */
  reading: GeoReading | null;
}

export function useMatchPresence({ businessId, roomId, enabled, reading }: UseMatchPresenceArgs): void {
  // Publish the reading for check-ins started elsewhere (e.g. QR scan from a Match screen).
  useEffect(() => {
    setMatchReading(reading ? { lat: reading.lat, lng: reading.lng, mocked: reading.mocked } : null);
  }, [reading]);

  // Heartbeat: one check-in per new GPS reading (enter + every geofence heartbeat).
  useEffect(() => {
    if (!enabled || !businessId || !reading) return;
    void runMatchCheckIn(businessId, roomId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a new reading (readAt) should fire it
  }, [enabled, businessId, reading?.readAt]);

  // Not enabled (opted out / Match off / left): clear the shared state.
  useEffect(() => {
    if (!enabled) resetMatchPresence();
    else if (businessId) markMatchHeartbeat(businessId, roomId);
  }, [enabled, businessId, roomId]);

  // No cleanup on unmount: the venue session (context/VenueSessionContext) keeps the presence alive
  // while the chat is minimized and resets the store when the session ends.
}
