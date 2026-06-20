/**
 * JChat 3.0 — StripeRoot (web) (Task 3.6)
 *
 * Web pass-through: @stripe/stripe-react-native does not run on web.
 * Payments on web use the Stripe.js SDK directly (not in scope for this task).
 * This file simply renders children so that StripeRoot can be imported
 * in App.tsx without breaking the web build.
 *
 * Platform split: this file is used on web (Metro resolver picks .web.tsx).
 * The native provider is in StripeRoot.native.tsx.
 */

import React from 'react';

interface StripeRootProps {
  children: React.ReactNode;
}

/** No-op pass-through on web — stripe-react-native is native-only. */
export default function StripeRoot({ children }: StripeRootProps): React.ReactElement {
  return <>{children}</>;
}
