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

export type SettingsStackParamList = {
  SettingsHome: undefined;
  Privacy: undefined;
};

const Stack = createNativeStackNavigator<SettingsStackParamList>();

const screenOptions: NativeStackNavigationOptions = { headerShown: false };

export default function SettingsStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="SettingsHome" component={SettingsScreen} />
      <Stack.Screen name="Privacy" component={PrivacyScreen} />
    </Stack.Navigator>
  );
}
