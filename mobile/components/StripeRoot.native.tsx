/**
 * JChat 3.0 — StripeRoot (native) (Task 3.6)
 *
 * Wraps children in @stripe/stripe-react-native's StripeProvider.
 * The publishable key is read from EXPO_PUBLIC_STRIPE_PK so it never
 * ships as a hardcoded literal. Falls back to a placeholder so the
 * app boots in demo mode without crashing.
 *
 * Platform split: this file is used on iOS and Android.
 * The web pass-through is in StripeRoot.web.tsx.
 *
 * Provider order (per CLAUDE.md):
 *   StripeRoot → Language → Theme → AuthContext → children
 */

import React from 'react';
import { StripeProvider } from '@stripe/stripe-react-native';

const STRIPE_PK =
  process.env.EXPO_PUBLIC_STRIPE_PK ?? 'pk_test_placeholder_not_configured';

interface StripeRootProps {
  // StripeProvider requires ReactElement, not the broader ReactNode.
  children: React.ReactElement | React.ReactElement[];
}

/**
 * Native StripeProvider.
 * merchantIdentifier must match the Apple Merchant ID registered in the
 * Apple Developer Portal and in app.json/plugins. Required for Apple Pay.
 */
export default function StripeRoot({ children }: StripeRootProps): React.ReactElement {
  return (
    <StripeProvider
      publishableKey={STRIPE_PK}
      merchantIdentifier="merchant.com.jchat.app"
      urlScheme="jchat"
    >
      {children}
    </StripeProvider>
  );
}
