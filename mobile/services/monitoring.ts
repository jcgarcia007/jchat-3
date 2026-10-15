/**
 * JChat 3.0 — error monitoring (Sentry). iOS, Android and the Expo web build.
 *
 * Works without credentials: with no EXPO_PUBLIC_SENTRY_DSN nothing is initialised (a console.warn in __DEV__ only).
 * Privacy rules live in utils/monitoringConfig.ts (no PII, user = id only, console breadcrumbs dropped, e-mail / IP /
 * location / coordinates / tokens / passwords removed in beforeSend). Session replay keeps Sentry's DEFAULT masks
 * (all text, images and inputs masked): do not turn them off. Replay is a native-only integration (not added on web).
 *
 * @sentry/react-native covers Expo web itself (its own `isWeb()` paths), so there is no separate .web.ts.
 * Source-map upload at build time needs SENTRY_AUTH_TOKEN; without it set SENTRY_DISABLE_AUTO_UPLOAD=true (docs/SENTRY_SETUP.md).
 */

import { Platform } from 'react-native';
import * as Sentry from '@sentry/react-native';

import { buildSentryOptions } from '../utils/monitoringConfig';

let initialised = false;

/** Initialises Sentry once. Returns true when it is active (a valid DSN was configured). */
export function initMonitoring(): boolean {
  if (initialised) return true;
  // Expo inlines EXPO_PUBLIC_* only for this literal form.
  const options = buildSentryOptions(process.env.EXPO_PUBLIC_SENTRY_DSN);
  if (!options) {
    if (__DEV__) console.warn('[monitoring] EXPO_PUBLIC_SENTRY_DSN is not set: Sentry is not initialised');
    return false;
  }
  Sentry.init({
    ...options,
    integrations: Platform.OS === 'web' ? [] : [Sentry.mobileReplayIntegration()], // default masks: never disabled
  });
  initialised = true;
  return true;
}

/** Only the user's ID is attached to events (never an e-mail, name or username). `null` clears it on sign-out. */
export function setMonitoringUser(userId: string | null): void {
  if (!initialised) return;
  Sentry.setUser(userId ? { id: userId } : null);
}

export { Sentry };
