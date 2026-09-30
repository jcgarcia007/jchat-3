/**
 * JChat 3.0 — Bottom Tab Navigator (Task 0.7)
 * Design System Section 10.1:
 *   Tab order:  Map | Profile, with the create-post action centered between.
 *   Active:     palette.brand        (#5C7CFA)
 *   Inactive:   palette.textTertiary (#636366)
 *   Icons:      @tabler/icons-react-native
 */

import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import MapScreen from '../../screens/map/MapScreen';
import ProfileScreen from '../../screens/profile/ProfileScreen';

// ---------------------------------------------------------------------------
// Param list
// ---------------------------------------------------------------------------

export type BottomTabParamList = {
  Map: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<BottomTabParamList>();

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function BottomTabs() {
  return (
    <Tab.Navigator
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="Map" component={MapScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}
