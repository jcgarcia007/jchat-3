/**
 * JChat 3.0 — retry delays for a Realtime channel that failed to subscribe (pure).
 * 1 s, 2 s, 5 s, then 10 s for every further attempt (never more than 10 s): once the network is back the
 * chat is subscribed again within about one step, so the catch-up starts within ~10–15 s.
 */

const STEPS_MS = [1_000, 2_000, 5_000, 10_000] as const;
export const MAX_CHANNEL_BACKOFF_MS = 10_000;

/** Delay before retry number `attempt` (0 = the first retry). */
export function channelBackoffMs(attempt: number): number {
  const index = Math.max(0, Math.floor(attempt));
  return Math.min(STEPS_MS[Math.min(index, STEPS_MS.length - 1)], MAX_CHANNEL_BACKOFF_MS);
}
