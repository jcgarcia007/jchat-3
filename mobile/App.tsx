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
import React, { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import StripeRoot from './components/StripeRoot';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { VenueSessionProvider } from './context/VenueSessionContext';
import AppNavigator from './navigation/AppNavigator';
import { applyAppearance, loadStoredAppearance } from './theme/appearance';
import { loadUserSettings } from './services/userSettings';

function AuthenticatedAppearanceBridge() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;

    void Promise.all([loadUserSettings(user.id), loadStoredAppearance()])
      .then(async ([remote, local]) => {
        if (cancelled || !remote.appearance || remote.appearance === local) return;
        await applyAppearance(remote.appearance);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  return null;
}

export default function App() {
  const [appearanceReady, setAppearanceReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    void loadStoredAppearance()
      .then((stored) => applyAppearance(stored ?? 'system'))
      .catch(() => undefined)
      .finally(() => {
        if (mounted) setAppearanceReady(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  if (!appearanceReady) return null;

  return (
    // Outermost: required by react-native-gesture-handler (Match swipe deck).
    <GestureHandlerRootView style={styles.root}>
      {/* The only SafeAreaProvider: components outside the NavigationContainer (VenueSessionBar) need it. */}
      <SafeAreaProvider>
        <StripeRoot>
          <AuthProvider>
            <AuthenticatedAppearanceBridge />
            <CartProvider>
              <VenueSessionProvider>
                <AppNavigator />
              </VenueSessionProvider>
            </CartProvider>
          </AuthProvider>
        </StripeRoot>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
