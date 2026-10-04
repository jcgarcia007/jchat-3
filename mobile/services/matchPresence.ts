/**
 * JChat 3.0 — Match presence store (Fase D1)
 *
 * Tiny in-memory store (useSyncExternalStore) holding the result of the last match_check_in.
 * The chat screen's heartbeat writes it (hooks/useMatchPresence); every Match screen reads it,
 * so they all share one presence state without prop drilling. The server stays the authority:
 * this only mirrors what match_check_in answered.
 */

import { useSyncExternalStore } from 'react';
import { matchCheckIn } from './match';

export type MatchPresenceStatus = 'idle' | 'checking' | 'active' | 'pending' | 'denied';

export interface MatchPresenceState {
  businessId: string | null;
  /** Chat room the heartbeat belongs to (used to return to the chat). */
  roomId: string | null;
  status: MatchPresenceStatus;
  /** Deny reason from match_check_in (e.g. 'unavailable', 'outside_radius'). */
  reason: string | null;
  expiresAt: string | null;
  method: 'qr' | 'geo' | null;
  /** True when the last check-in call failed (network); status keeps its previous value. */
  error: boolean;
}

const IDLE: MatchPresenceState = {
  businessId: null,
  roomId: null,
  status: 'idle',
  reason: null,
  expiresAt: null,
  method: null,
  error: false,
};

let state: MatchPresenceState = IDLE;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((l) => l());
}

export function getMatchPresence(): MatchPresenceState {
  return state;
}

export function setMatchPresence(patch: Partial<MatchPresenceState>): void {
  state = { ...state, ...patch };
  emit();
}

export function resetMatchPresence(): void {
  if (state === IDLE) return;
  state = IDLE;
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useMatchPresenceState(): MatchPresenceState {
  return useSyncExternalStore(subscribe, getMatchPresence, getMatchPresence);
}

// ── Check-in runner (shared by the chat heartbeat and any Match screen) ──────────────────

/** GPS reading used by the next check-in (the chat's geofence gate publishes it). */
export interface MatchReading {
  lat: number;
  lng: number;
  mocked: boolean;
}

/**
 * The chat started feeding the heartbeat for this venue: from now on the presence is "being
 * verified" (not idle), so Match screens opened right away don't mistake it for "no heartbeat".
 */
export function markMatchHeartbeat(businessId: string, roomId: string): void {
  if (state.businessId === businessId && state.status !== 'idle') return;
  setMatchPresence({ businessId, roomId, status: 'checking', reason: null, error: false });
}

let latestReading: MatchReading | null = null;
let inFlight = false;

export function setMatchReading(reading: MatchReading | null): void {
  latestReading = reading;
}

/**
 * Calls match_check_in for the venue and mirrors the answer into the store. With `qrToken` the
 * server activates presence instantly. Returns true when presence is 'active'. Never throws.
 */
export async function runMatchCheckIn(
  businessId: string,
  roomId: string,
  qrToken?: string,
): Promise<boolean> {
  if (inFlight) return false;
  inFlight = true;
  const previous = state;
  const sameVenue = previous.businessId === businessId;
  setMatchPresence({
    businessId,
    roomId,
    // Keep showing 'active' while a heartbeat renews; show 'checking' otherwise.
    status: sameVenue && previous.status === 'active' ? 'active' : 'checking',
    error: false,
  });
  try {
    const result = await matchCheckIn({
      businessId,
      lat: latestReading?.lat,
      lng: latestReading?.lng,
      qrToken,
      mocked: latestReading?.mocked === true,
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
    inFlight = false;
  }
}

/** Activates presence at the current venue with a scanned venue QR token. */
export function matchCheckInWithQr(qrToken: string): Promise<boolean> {
  const { businessId, roomId } = state;
  if (!businessId || !roomId) return Promise.resolve(false);
  return runMatchCheckIn(businessId, roomId, qrToken);
}
