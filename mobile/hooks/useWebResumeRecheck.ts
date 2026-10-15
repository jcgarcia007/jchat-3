/**
 * JChat 3.0 — native: nothing to do. The web version (useWebResumeRecheck.web.ts) re-checks the venue presence when the
 * network comes back or the page is restored; iOS / Android already do it with AppState.
 */

export interface WebResumeRecheckArgs {
  /** Runs the check (the caller's own throttled check, never a second path). */
  onResume: () => void;
  enabled: boolean;
  /** Milliseconds since the last automatic check started. */
  ageMs: () => number;
  /** Minimum gap between automatic checks (RESUME_RECHECK_MIN_GAP_MS). */
  minGapMs: number;
}

export function useWebResumeRecheck(_args: WebResumeRecheckArgs): void {
  // no-op on iOS / Android
}
