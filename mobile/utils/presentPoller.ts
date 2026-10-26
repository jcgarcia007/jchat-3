/**
 * JChat 3.0 — the schedule of the presence-list filter (pure: every outside thing is injected, so Node tests drive it with a fake clock).
 *
 * Asks once when it starts, then every `intervalMs` (60 s), and whenever `trigger()` is called (the app came back to the foreground,
 * or the list of people changed). It NEVER calls while stopped (the room is closed / unmounted) nor while the app is in the
 * background, never runs two calls at once, and keeps at least `minGapMs` between calls (a trailing call is scheduled instead of dropped).
 * The answer of a call that finishes after stop() is ignored.
 */

export interface PresentPollerDeps<R> {
  /** The call. Resolves with the answer, or null / rejects when it failed. */
  fetch: () => Promise<R | null>;
  /** True while the app is in the foreground (never poll otherwise). */
  isForeground: () => boolean;
  onResult: (result: R | null) => void;
  now: () => number;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
  setRepeat: (fn: () => void, ms: number) => unknown;
  clearRepeat: (handle: unknown) => void;
  intervalMs?: number;
  minGapMs?: number;
}

export const PRESENT_POLL_INTERVAL_MS = 60_000;
export const PRESENT_POLL_MIN_GAP_MS = 5_000;

export interface PresentPoller {
  start: () => void;
  stop: () => void;
  trigger: () => void;
}

export function createPresentPoller<R>(deps: PresentPollerDeps<R>): PresentPoller {
  const intervalMs = deps.intervalMs ?? PRESENT_POLL_INTERVAL_MS;
  const minGapMs = deps.minGapMs ?? PRESENT_POLL_MIN_GAP_MS;
  let running = false;
  let inFlight = false;
  let lastAt = Number.NEGATIVE_INFINITY;
  let repeat: unknown = null;
  let pending: unknown = null;
  let generation = 0;

  const run = () => {
    inFlight = true;
    lastAt = deps.now();
    const mine = generation;
    deps
      .fetch()
      .catch(() => null)
      .then((result) => {
        inFlight = false;
        if (running && mine === generation) deps.onResult(result);
      });
  };

  const trigger = () => {
    if (!running || inFlight || !deps.isForeground()) return;
    const wait = lastAt + minGapMs - deps.now();
    if (wait > 0) {
      if (pending === null) {
        pending = deps.setTimer(() => {
          pending = null;
          trigger();
        }, wait);
      }
      return;
    }
    run();
  };

  return {
    start() {
      if (running) return;
      running = true;
      generation += 1;
      repeat = deps.setRepeat(trigger, intervalMs);
      trigger();
    },
    stop() {
      running = false;
      generation += 1;
      if (repeat !== null) deps.clearRepeat(repeat);
      if (pending !== null) deps.clearTimer(pending);
      repeat = null;
      pending = null;
    },
    trigger,
  };
}
