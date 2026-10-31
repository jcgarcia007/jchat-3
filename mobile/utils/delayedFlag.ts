/**
 * Anti-flicker for loading states (pure: no React, no React Native, so a Node test can drive it with fake timers).
 *
 * `set(true)` starts the clock; the flag turns on only if loading is STILL on after `delayMs`. `set(false)` turns it off at once and cancels a pending
 * turn-on, so a load that ends sooner than the delay never shows anything (no skeleton flash). Turning loading on again restarts the clock.
 */
export interface DelayedFlag {
  /** Tell the flag whether the thing is loading right now. */
  set: (loading: boolean) => void;
  /** Cancel any pending timer (call on unmount). */
  dispose: () => void;
}

export interface Timers {
  setTimeout: (callback: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
}

const REAL_TIMERS: Timers = {
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export function createDelayedFlag(onChange: (on: boolean) => void, delayMs = 200, timers: Timers = REAL_TIMERS): DelayedFlag {
  let on = false;
  let pending: unknown = null;

  const cancel = () => {
    if (pending !== null) {
      timers.clearTimeout(pending);
      pending = null;
    }
  };

  return {
    set(loading) {
      if (loading) {
        if (on || pending !== null) return; // already counting or already showing: keep the original start
        pending = timers.setTimeout(() => {
          pending = null;
          on = true;
          onChange(true);
        }, delayMs);
        return;
      }
      cancel();
      if (on) {
        on = false;
        onChange(false);
      }
    },
    dispose: cancel,
  };
}
