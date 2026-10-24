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

// Web loads the Map tab on demand (navigation/lazyScreens.web.tsx); iOS / Android import it statically.
import { MapScreen } from '../lazyScreens';
import ProfileScreen from '../../screens/profile/ProfileScreen';
import NearbyScreen from '../../screens/nearby/NearbyScreen';
import MessagesScreen from '../../screens/dms/MessagesScreen';
import OffersScreen from '../../screens/offers/OffersScreen';
import NotchTabBar from '../../components/navigation/NotchTabBar';

// ---------------------------------------------------------------------------
// Param list
// ---------------------------------------------------------------------------

export type BottomTabParamList = {
  Map: undefined;
  Nearby: undefined;
  Messages: undefined;
  Profile: undefined;
  /** Hidden route: NotchTabBar draws only the first four; the centre button navigates here. */
  Offers: undefined;
};

const Tab = createBottomTabNavigator<BottomTabParamList>();

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function BottomTabs() {
  return (
    <Tab.Navigator
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <NotchTabBar {...props} />}
    >
      <Tab.Screen name="Map" component={MapScreen} />
      <Tab.Screen name="Nearby" component={NearbyScreen} />
      <Tab.Screen name="Messages" component={MessagesScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
      <Tab.Screen name="Offers" component={OffersScreen} />
    </Tab.Navigator>
  );
}
