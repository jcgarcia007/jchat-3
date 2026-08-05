/**
 * JChat 3.0 — POS Navigator (C2a)
 *
 * Nested stack that wraps the POS screens in a single StripeTerminalProvider.
 * This architecture is needed because StripeTerminalProvider is a React context
 * — it must be an ancestor of every screen that calls useStripeTerminal().
 * Since both PosHome and PosOrder need Terminal access, the provider must wrap
 * them both. A nested sub-navigator is the cleanest way to do this without
 * breaking the existing SettingsStack structure.
 *
 * Navigation flow:
 *   WorkModeScreen → (SettingsStack) → PosRoot → (PosStack) → PosHome → PosOrder
 *
 * Token security: tokenProvider calls the `terminal` Edge Function via the
 * Supabase client — the user's JWT is attached automatically. No Stripe keys
 * ever leave the server.
 */

import React, { useCallback, useEffect } from 'react';
import {
  createNativeStackNavigator,
  type NativeStackNavigationOptions,
} from '@react-navigation/native-stack';
import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import {
  StripeTerminalProvider,
  useStripeTerminal,
} from '@stripe/stripe-terminal-react-native';

import { getConnectionTokenSecret } from '../services/terminal';
import PosHomeScreen from '../screens/settings/PosHomeScreen';
import PosOrderScreen from '../screens/settings/PosOrderScreen';
import PosCheckoutScreen from '../screens/settings/PosCheckoutScreen';
import type { SettingsStackParamList } from './SettingsStack';

// ─── Param list ───────────────────────────────────────────────────────────────

/**
 * Screens in the POS nested stack. Imported by PosHomeScreen and PosOrderScreen
 * for their navigation / route types.
 */
export type PosStackParamList = {
  PosHome: { businessId: string; businessName: string; employeeId: string };
  PosOrder: {
    businessId: string;
    businessName: string;
    tableId: string;
    tableLabel: string;
  };
  /** In-person payment for an open tab on a table (C2b). */
  PosCheckout: {
    businessId: string;
    tableId: string;
    tableLabel: string;
  };
};

// ─── SDK initializer ──────────────────────────────────────────────────────────

/**
 * Rendered inside StripeTerminalProvider. Calls initialize() once on mount so
 * the SDK is ready to discover and connect readers. Must be a child of the
 * provider — useStripeTerminal() is unavailable above it in the tree.
 *
 * In development (Expo Go), this will warn because the native module is not
 * bundled — that is expected. The EAS dev build is required to use Terminal.
 */
function PosTerminalInit(): React.ReactElement | null {
  const { initialize } = useStripeTerminal();

  useEffect(() => {
    initialize().catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[PosNavigator] Terminal initialize failed (EAS build required):', msg);
    });
    // `initialize` reference is stable (SDK guarantee); no cleanup needed.
  }, [initialize]);

  return null;
}

// ─── Navigator ────────────────────────────────────────────────────────────────

const PosStack = createNativeStackNavigator<PosStackParamList>();
const screenOptions: NativeStackNavigationOptions = { headerShown: false };

type PosRootRoute = RouteProp<SettingsStackParamList, 'PosRoot'>;

/**
 * PosNavigator — rendered as the `PosRoot` screen inside SettingsStack.
 *
 * Reads { businessId, businessName, employeeId } from the SettingsStack route,
 * creates a memoized tokenProvider that closes over businessId, and passes it
 * to StripeTerminalProvider. The businessId is stable for the lifetime of this
 * screen (the employee stays on the same business until they pop the stack).
 */
export default function PosNavigator(): React.ReactElement {
  const { params } = useRoute<PosRootRoute>();
  const { businessId, businessName, employeeId } = params;

  // Memoized so the provider doesn't re-mount on parent re-renders.
  const tokenProvider = useCallback(
    (): Promise<string> => getConnectionTokenSecret(businessId),
    [businessId],
  );

  return (
    <StripeTerminalProvider tokenProvider={tokenProvider} logLevel="none">
      <PosTerminalInit />
      <PosStack.Navigator screenOptions={screenOptions}>
        {/* Pass params down to the first screen so it can read them from useRoute(). */}
        <PosStack.Screen
          name="PosHome"
          component={PosHomeScreen}
          initialParams={{ businessId, businessName, employeeId }}
        />
        <PosStack.Screen name="PosOrder" component={PosOrderScreen} />
        {/* PosCheckout must be inside this navigator (needs useStripeTerminal) */}
        <PosStack.Screen name="PosCheckout" component={PosCheckoutScreen} />
      </PosStack.Navigator>
    </StripeTerminalProvider>
  );
}
