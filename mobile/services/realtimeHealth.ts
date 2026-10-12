/**
 * JChat 3.0 — Realtime socket health from the client's heartbeat (web only: services/supabase.ts passes
 * `heartbeatCallback` to the realtime client only there; on iOS / Android nothing reports, so it stays "ok").
 *
 * realtime-js reports 'sent' | 'ok' | 'error' | 'timeout' | 'disconnected'. A dead socket (sleeping laptop, lost
 * Wi-Fi) does not always tell its channels, so useResilientChannel also listens here: a bad heartbeat shows
 * "Reconectando…" and the first 'ok' afterwards makes the chat catch up on what it missed.
 */

const BAD_STATUSES = new Set(['error', 'timeout', 'disconnected']);

let healthy = true;
const listeners = new Set<(ok: boolean) => void>();

/** `heartbeatCallback` of the realtime client. */
export function reportRealtimeHeartbeat(status: string): void {
  if (status === 'sent') return; // only the answer tells anything
  const next = !BAD_STATUSES.has(status);
  if (next === healthy) return;
  healthy = next;
  listeners.forEach((listener) => listener(next));
}

export function isRealtimeHealthy(): boolean {
  return healthy;
}

export function subscribeRealtimeHealth(listener: (ok: boolean) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
