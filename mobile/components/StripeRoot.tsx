/**
 * JChat 3.0 — StripeRoot (Task 3.6)
 *
 * Platform-split provider for @stripe/stripe-react-native.
 *
 * Metro resolver picks the correct implementation at bundle time:
 *   StripeRoot.native.tsx — wraps children in <StripeProvider> (iOS + Android)
 *   StripeRoot.web.tsx    — pass-through (stripe-react-native is native-only)
 *
 * This file is the TypeScript fallback that `tsc --noEmit` resolves when
 * no platform suffix is known at type-check time. It re-exports from the
 * web pass-through (the safest no-op shape).
 *
 * Do not import this file directly — always import './components/StripeRoot'
 * and let Metro / tsc resolve the right variant.
 */

export { default } from './StripeRoot.web';
