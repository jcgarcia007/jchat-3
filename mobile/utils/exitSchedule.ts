/**
 * JChat 3.0 — when the silent exit check looks again (pure: runs in Node tests).
 *
 * The normal heartbeat is every 5 minutes. As soon as an exit is PENDING (the buffer ends in at least one
 * clearly-outside reading) the check looks again every minute — foreground only, nothing is shown — until it
 * ends in 'outside_confirmed' or a reading inside the radius cancels it; then the normal heartbeat takes over.
 * The chain must not die on a reading that is ignored (poor accuracy), on a position timeout or on a check that
 * was skipped because another one was running: all of those keep the exit pending, so the next look is scheduled.
 */

/** While an exit is pending, look again this often. */
export const SILENT_VERIFY_INTERVAL_MS = 60 * 1000;

export interface VerifyState {
  /** What the check ended with ('uncertain' also covers an ignored reading or a position error). */
  status: 'inside' | 'outside_confirmed' | 'uncertain';
  /** The buffer ends in a clearly-outside reading (utils/exitCheck.ts outsideRunLength > 0). */
  pendingExit: boolean;
  /** The check did not run (another one was in flight, or it was too soon after the last). */
  skipped?: boolean;
}

/** Milliseconds until the next look, or null when the normal 5-minute heartbeat is enough. */
export function nextVerifyDelayMs(state: VerifyState): number | null {
  if (state.status === 'inside' || state.status === 'outside_confirmed') return null;
  return state.pendingExit ? SILENT_VERIFY_INTERVAL_MS : null;
}
