/**
 * JChat 3.0 — Settings stack (Stage 1 cleanup)
 * Groups Settings → Privacy so `navigation.navigate('Privacy')` from the
 * Settings screen resolves within a typed stack.
 */

import React from 'react';
import {
  createNativeStackNavigator,
  NativeStackNavigationOptions,
} from '@react-navigation/native-stack';

import SettingsScreen from '../screens/settings/SettingsScreen';
import PrivacyScreen from '../screens/settings/PrivacyScreen';
import WorkModeScreen from '../screens/settings/WorkModeScreen';
import ChangePasswordScreen from '../screens/settings/ChangePasswordScreen';
import BlockedUsersScreen from '../screens/settings/BlockedUsersScreen';
import MyOrdersScreen from '../screens/orders/MyOrdersScreen';
import MyReservationsScreen from '../screens/reservations/MyReservationsScreen';
// Web loads the POS flow on demand (navigation/lazyScreens.web.tsx); iOS / Android import it statically.
import { PosNavigator } from './lazyScreens';

export type SettingsStackParamList = {
  SettingsHome: undefined;
  Privacy: undefined;
  BlockedUsers: undefined;
  WorkMode: undefined;
  ChangePassword: undefined;
  MyOrders: undefined;
  MyReservations: undefined;
  /** Entry point for the entire POS flow. Renders PosNavigator (nested stack + StripeTerminalProvider). */
  PosRoot: { businessId: string; businessName: string; employeeId: string; plan: string | null };
};

const Stack = createNativeStackNavigator<SettingsStackParamList>();

const screenOptions: NativeStackNavigationOptions = { headerShown: false };

export default function SettingsStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="SettingsHome" component={SettingsScreen} />
      <Stack.Screen name="Privacy" component={PrivacyScreen} />
      <Stack.Screen name="BlockedUsers" component={BlockedUsersScreen} />
      <Stack.Screen name="WorkMode" component={WorkModeScreen} />
      <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} />
      <Stack.Screen name="MyOrders" component={MyOrdersScreen} />
      <Stack.Screen name="MyReservations" component={MyReservationsScreen} />
      <Stack.Screen name="PosRoot" component={PosNavigator} />
    </Stack.Navigator>
  );
}
