/**
 * JChat 3.0 — "is Truth or Dare on at this venue?", asked again when it may have changed (pure: no React, no I/O; a Node test drives it).
 *
 * The chat asks once when it opens and again when the screen regains focus or the app comes back to the foreground. The checker keeps that safe:
 *   • at most ONE request in flight: a refresh asked meanwhile for the same venue is dropped (no bursts);
 *   • an answer is applied only if the checker is still alive and still looking at the venue it asked about (a late answer after leaving the screen,
 *     or after the venue changed, is discarded);
 *   • a request that throws keeps what was known (the service itself answers `false` when it cannot confirm, which is what it has always done).
 * It does not know about Match or any other call of the chat: a failure elsewhere cannot reach it.
 */

export interface EnabledChecker {
  /** Asks (once at a time) whether the game is on at `businessId`. Resolves when that ask, and any one queued for a new venue, is done. */
  refresh: (businessId: string | null | undefined) => Promise<void>;
  /** Stops applying answers (unmount). */
  dispose: () => void;
}

export function createEnabledChecker(
  check: (businessId: string) => Promise<boolean>,
  apply: (enabled: boolean) => void,
): EnabledChecker {
  let disposed = false;
  let wanted: string | null = null;
  let running: Promise<void> | null = null;

  const run = async (): Promise<void> => {
    // Loops while the venue asked for changed during a request: still one request at a time.
    for (;;) {
      const asked = wanted;
      if (disposed || !asked) {
        running = null;
        return;
      }
      let answer: boolean | undefined;
      try {
        answer = await check(asked);
      } catch {
        answer = undefined; // keep what was known
      }
      if (disposed) {
        running = null;
        return;
      }
      if (wanted === asked) {
        if (answer !== undefined) apply(answer);
        running = null; // cleared in the same turn as the answer: a refresh right after starts a new request
        return;
      }
      // the venue changed while this request was out: its answer is discarded and the new venue is asked next
    }
  };

  return {
    refresh(businessId) {
      if (disposed) return Promise.resolve();
      wanted = businessId ?? null;
      if (!wanted) return running ?? Promise.resolve();
      if (!running) {
        running = run();
      }
      return running;
    },
    dispose() {
      disposed = true;
      wanted = null;
    },
  };
}
