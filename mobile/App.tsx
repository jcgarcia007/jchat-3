/**
 * JChat 3.0 — Entry point
 * Renders the root navigator wrapped in all global providers.
 *
 * Provider order (per CLAUDE.md):
 *   StripeRoot → Language → Theme → AuthContext → children
 *
 * StripeRoot is a platform split:
 *   .native.tsx — wraps in @stripe/stripe-react-native StripeProvider
 *   .web.tsx    — pass-through (stripe-react-native is native-only)
 */

import './i18n'; // must be first — initialises i18next before any component renders
import React from 'react';
import StripeRoot from './components/StripeRoot';
import { AuthProvider } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import AppNavigator from './navigation/AppNavigator';

export default function App() {
  return (
    <StripeRoot>
      <AuthProvider>
        <CartProvider>
          <AppNavigator />
        </CartProvider>
      </AuthProvider>
    </StripeRoot>
  );
}
