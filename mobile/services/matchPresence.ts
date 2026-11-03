/**
 * JChat 3.0 — Match presence store (Fase D1)
 *
 * Tiny in-memory store (useSyncExternalStore) holding the result of the last match_check_in / match_join_venue.
 * The chat screen's heartbeat writes it (hooks/useMatchPresence); every Match screen reads it,
 * so they all share one presence state without prop drilling. The server stays the authority:
 * this only mirrors what the server answered.
 *
 * Two different calls (migration 256, audit B5-1):
 *  - joinMatchVenue  → match_join_venue: the explicit entry (Games → Match, or the venue QR). The ONLY call that enrols the person.
 *  - runMatchCheckIn → match_check_in: the heartbeat. It only renews the presence of someone who already joined; otherwise the server
 *                      answers 'not_joined' (status 'not_joined' here) and writes nothing, so leaving Match is not undone by a GPS reading.
 */

import { useSyncExternalStore } from 'react';
import { matchCheckIn, matchJoinVenue, type MatchCheckInResult } from './match';

/** 'not_joined': at the venue but not in Match (never entered, or left): the heartbeat does not enrol. */
export type MatchPresenceStatus = 'idle' | 'checking' | 'active' | 'pending' | 'denied' | 'not_joined';

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

/** Bumped by every explicit join and every reset: a heartbeat answer that started before is stale and is dropped. */
let epoch = 0;

export function resetMatchPresence(): void {
  epoch += 1;
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
 * The HEARTBEAT: calls match_check_in and mirrors the answer. It renews the presence of someone who already joined Match and never
 * enrols anyone (without an opt-in the server answers 'not_joined'). Returns true when presence is 'active'. Never throws.
 */
export async function runMatchCheckIn(businessId: string, roomId: string): Promise<boolean> {
  if (inFlight) return false;
  inFlight = true;
  const startedEpoch = epoch;
  const previous = state;
  const sameVenue = previous.businessId === businessId;
  setMatchPresence({
    businessId,
    roomId,
    // Keep showing 'active' (or 'not_joined') while a heartbeat renews; show 'checking' otherwise.
    status: sameVenue && (previous.status === 'active' || previous.status === 'not_joined') ? previous.status : 'checking',
    error: false,
  });
  try {
    const result = await matchCheckIn({
      businessId,
      lat: latestReading?.lat,
      lng: latestReading?.lng,
      mocked: latestReading?.mocked === true,
    });
    // A join or a leave happened while this call was in flight: its answer is stale (it could undo a leave).
    if (startedEpoch !== epoch) return false;
    mirrorResult(businessId, roomId, result);
    return result.status === 'active';
  } catch {
    if (startedEpoch !== epoch) return false;
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

/** Copies the server's answer into the store. 'denied' + 'not_joined' is its own status: not an error and not a denial to show. */
function mirrorResult(businessId: string, roomId: string, result: MatchCheckInResult): void {
  if (result.status === 'denied' && result.reason === 'not_joined') {
    setMatchPresence({ businessId, roomId, status: 'not_joined', reason: null, expiresAt: null, method: null, error: false });
    return;
  }
  setMatchPresence({
    businessId,
    roomId,
    status: result.status,
    // 'pending' only happens with reason 'mocked_location' (migration 196); keep it for the UI.
    reason: result.status === 'denied' ? (result.reason ?? 'unavailable') : (result.reason ?? null),
    expiresAt: result.expires_at ?? null,
    method: result.method ?? null,
    error: false,
  });
}

/**
 * The explicit entry to Match: Games → Match (ChatRoomScreen.handleGamePress) or a scanned venue QR. Calls match_join_venue, the ONLY
 * call that creates the opt-in, and mirrors the answer. Nothing else in the app calls it: not the heartbeat, not the venue session.
 * Sets 'checking' synchronously so a Match screen opened right after never sees 'idle'. Returns true when presence is 'active'. Never throws.
 */
export async function joinMatchVenue(businessId: string, roomId: string, qrToken?: string): Promise<boolean> {
  epoch += 1;
  const myEpoch = epoch;
  setMatchPresence({ businessId, roomId, status: 'checking', reason: null, error: false });
  try {
    const result = await matchJoinVenue({
      businessId,
      lat: latestReading?.lat,
      lng: latestReading?.lng,
      qrToken,
      mocked: latestReading?.mocked === true,
    });
    if (myEpoch !== epoch) return false;
    mirrorResult(businessId, roomId, result);
    return result.status === 'active';
  } catch {
    if (myEpoch !== epoch) return false;
    // The call failed (network): Match shows its generic "not available right now"; the person can try again from Games → Match.
    setMatchPresence({ businessId, roomId, status: 'denied', reason: null, error: true });
    return false;
  }
}

/** Joins Match at the current venue with a scanned venue QR token (the QR activates instantly). */
export function joinMatchWithQr(qrToken: string): Promise<boolean> {
  const { businessId, roomId } = state;
  if (!businessId || !roomId) return Promise.resolve(false);
  return joinMatchVenue(businessId, roomId, qrToken);
}
