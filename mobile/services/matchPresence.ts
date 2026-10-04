/**
 * JChat 3.0 — Match presence store (Fase D1)
 *
 * Tiny in-memory store (useSyncExternalStore) holding the result of the last match_check_in.
 * The chat screen's heartbeat writes it (hooks/useMatchPresence); every Match screen reads it,
 * so they all share one presence state without prop drilling. The server stays the authority:
 * this only mirrors what match_check_in answered.
 */

import { useSyncExternalStore } from 'react';

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
