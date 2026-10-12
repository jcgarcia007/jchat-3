/**
 * JChat 3.0 — "the app is usable again" events (iOS / Android): AppState → 'active'.
 * The web build resolves foregroundEvents.web.ts (visibilitychange + the browser's `online` event).
 */

import { AppState } from 'react-native';

export type ForegroundReason = 'foreground' | 'online';

/** Calls `listener` every time the app returns to the foreground. Returns the unsubscribe function. */
export function subscribeForeground(listener: (reason: ForegroundReason) => void): () => void {
  const subscription = AppState.addEventListener('change', (status) => {
    if (status === 'active') listener('foreground');
  });
  return () => subscription.remove();
}
