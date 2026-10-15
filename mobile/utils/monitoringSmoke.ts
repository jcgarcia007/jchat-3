/**
 * JChat 3.0 — manual check that Sentry receives events. DEV ONLY: call it from a temporary button (e.g. in Settings while
 * developing); it does nothing in a release build, and nothing when Sentry is not initialised (no DSN).
 */

import { Sentry } from '../services/monitoring';

export function captureTestError(): void {
  if (!__DEV__) return;
  Sentry.captureException(new Error('JChat Sentry smoke test (safe to ignore)'));
}
