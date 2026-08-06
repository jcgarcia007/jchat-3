/**
 * JChat 3.0 — Stripe Terminal SDK guard wrapper
 *
 * Stripe Terminal's iOS native module (`StripeTerminalReactNative`) creates a
 * `NativeEventEmitter` at import time. React Native 0.85+ makes the non-null
 * requirement strict, so importing the SDK when the native module is absent
 * (Expo Go, iOS Simulator without a full EAS build) crashes the runtime with:
 *
 *   Invariant Violation: `new NativeEventEmitter()` requires a non-null argument
 *
 * SOLUTION: detect native module availability ONCE at module load time via a
 * synchronous NativeModules lookup — if absent, never call require().
 *
 * HOW TO USE:
 *   import { StripeTerminalProvider, useStripeTerminal, isTerminalAvailable }
 *     from '../../services/terminalSdk';  // adjust depth for your file
 *
 *   • `isTerminalAvailable` tells you whether to show Terminal UI or a fallback.
 *   • `StripeTerminalProvider` / `useStripeTerminal` are always safe to call —
 *     stubs replace them when the native module is absent.
 *
 * RULE: this module is the ONLY file in the project that may reference the SDK
 * package path. Never import directly from '@stripe/stripe-terminal-react-native'.
 */

import React from 'react';
import type { ReactNode } from 'react';
import { NativeModules } from 'react-native';

// ─── Availability check ────────────────────────────────────────────────────────

/**
 * True when the Stripe Terminal native module is compiled into this build.
 * False in Expo Go, the iOS Simulator (without a full EAS build), and Android
 * emulators that lack the native binary.
 */
export const isTerminalAvailable = !!NativeModules.StripeTerminalReactNative;

// ─── Dynamic SDK load (module initializer only runs when module is present) ───

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sdk: Record<string, any> | null = isTerminalAvailable
  ? // Dynamic require so the module-level NativeEventEmitter constructor is
    // never evaluated when the native module is absent.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    (require('@stripe/stripe-terminal-react-native') as Record<string, any>)
  : null;

// ─── StripeTerminalProvider ────────────────────────────────────────────────────

/** Transparent passthrough used when Terminal is unavailable. */
function StubTerminalProvider({ children }: { children?: ReactNode }): React.ReactElement {
  // eslint-disable-next-line react/jsx-no-useless-fragment
  return React.createElement(React.Fragment, null, children);
}

/**
 * Drop-in replacement for the real StripeTerminalProvider.
 * When Terminal is unavailable it renders a transparent passthrough so the
 * navigator tree stays intact without any SDK calls.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const StripeTerminalProvider: React.ComponentType<any> =
  sdk
    ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sdk.StripeTerminalProvider as React.ComponentType<any>)
    : StubTerminalProvider;

// ─── useStripeTerminal ─────────────────────────────────────────────────────────

const _STUB_ERR = {
  message: 'Stripe Terminal requires a physical device with an EAS build.',
};

/**
 * Singleton stub result — all async methods return safely; no readers exist.
 * Used as the hook return value when the native module is absent so screens
 * can still call the hook unconditionally (rules of hooks) without crashing.
 *
 * Stub shape:
 *   • discoverReaders   → resolves with {} (no readers found)
 *   • connectedReader   → null  → auto-connect logic never fires
 *   • discoveredReaders → []    → auto-connect loop never triggers
 *   • connect/charge fns → resolve with { error } so callers degrade gracefully
 *   • disconnectReader  → resolves immediately (no cleanup needed)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const STUB_HOOK_RESULT: Record<string, any> = Object.freeze({
  initialize:             async () => ({}),
  discoverReaders:        async () => ({}),
  cancelDiscovering:      async () => ({}),
  connectReader:          async () => ({ error: _STUB_ERR }),
  retrievePaymentIntent:  async () => ({ error: _STUB_ERR }),
  collectPaymentMethod:   async () => ({ error: _STUB_ERR }),
  confirmPaymentIntent:   async () => ({ error: _STUB_ERR }),
  disconnectReader:       async () => {},
  discoveredReaders:      [],
  connectedReader:        null,
});

/**
 * Drop-in replacement for the real useStripeTerminal hook.
 * When Terminal is unavailable, returns the frozen stub result — a stable
 * object reference that doesn't trigger re-renders. Screens should check
 * `isTerminalAvailable` and render an appropriate fallback UI; they must
 * NOT attempt real payments when this returns stub values.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const useStripeTerminal: () => any =
  sdk
    ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sdk.useStripeTerminal as () => any)
    : () => STUB_HOOK_RESULT;
