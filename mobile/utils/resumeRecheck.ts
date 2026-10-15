/**
 * JChat 3.0 — when the web app re-checks the venue presence by itself (pure: no React, no DOM).
 *
 * A browser tab in the background has its timers throttled (or is suspended altogether on iOS Safari), so the 5-minute
 * heartbeat can miss its window and the presence (15 min) lapses. Coming back to the tab or getting the network back must
 * re-check at once, through the SAME check the chat gate uses (runAutoGeoCheck → runGeoCheck), never a second path.
 *
 * `visible` (visibilitychange → visible) is already delivered by react-native-web's AppState 'change' to the gate and to the
 * venue session; the web hook adds what AppState does not report: `online` and a page restored from the back-forward cache.
 */

export type ResumeTrigger = 'visible' | 'online' | 'pageshow';

export interface ResumeRecheckInput {
  trigger: ResumeTrigger;
  /** document.visibilityState === 'visible' right now. */
  visible: boolean;
  /** navigator.onLine right now. */
  online: boolean;
  /** Milliseconds since the last automatic check started. */
  sinceLastCheckMs: number;
  /** RESUME_RECHECK_MIN_GAP_MS. */
  minGapMs: number;
  /** pageshow only: the page came from the back-forward cache (event.persisted). */
  persisted?: boolean;
}

/** True when a resume event must trigger a presence re-check now. */
export function shouldResumeRecheck(input: ResumeRecheckInput): boolean {
  if (!input.visible) return false; // never read the position of a tab nobody is looking at
  if (!input.online) return false; // the RPC would fail; the `online` event re-checks as soon as the network is back
  if (input.trigger === 'pageshow' && input.persisted !== true) return false; // a normal load is not a resume
  return input.sinceLastCheckMs >= input.minGapMs; // brief flips do not re-check
}
