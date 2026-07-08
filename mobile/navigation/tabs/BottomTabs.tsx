/**
 * JChat 3.0 — Bottom Tab Navigator (Task 0.7)
 * Design System Section 10.1:
 *   Tab order:  Map | Nearby | DMs | Friends | Profile
 *   Active:     palette.brand        (#5C7CFA)
 *   Inactive:   palette.textTertiary (#636366)
 *   Icons:      @tabler/icons-react-native
 */

import React from 'react';
import { useColorScheme } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { NavigatorScreenParams } from '@react-navigation/native';
import {
  IconMap,
  IconBuildingStore,
  IconMessage,
  IconUsers,
  IconUser,
} from '@tabler/icons-react-native';

import { getColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';

import MapScreen from '../../screens/map/MapScreen';
import NearbyScreen from '../../screens/nearby/NearbyScreen';
// Task 1.12: DMsScreen placeholder replaced by the real DMStack navigator
import DMStack, { type DMStackParamList } from '../DMStack';
import FriendsScreen from '../../screens/friends/FriendsScreen';
import ProfileScreen from '../../screens/profile/ProfileScreen';

// ---------------------------------------------------------------------------
// Param list
// ---------------------------------------------------------------------------

export type BottomTabParamList = {
  Map: undefined;
  Nearby: undefined;
  DMs: NavigatorScreenParams<DMStackParamList>;
  Friends: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<BottomTabParamList>();

const ICON_SIZE = 24;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function BottomTabs() {
  const scheme = useColorScheme();
  const c = getColors(scheme);

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: palette.brand,
        tabBarInactiveTintColor: palette.textTertiary,
        tabBarStyle: {
          backgroundColor: c.bgSurface,
          borderTopColor: c.borderSubtle,
          borderTopWidth: 1,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '500',
        },
      }}
    >
      <Tab.Screen
        name="Map"
        component={MapScreen}
        options={{
          tabBarIcon: ({ color }) => (
            <IconMap size={ICON_SIZE} color={color} strokeWidth={2} />
          ),
        }}
      />
      <Tab.Screen
        name="Nearby"
        component={NearbyScreen}
        options={{
          tabBarIcon: ({ color }) => (
            <IconBuildingStore size={ICON_SIZE} color={color} strokeWidth={2} />
          ),
        }}
      />
      <Tab.Screen
        name="DMs"
        component={DMStack}
        options={{
          tabBarIcon: ({ color }) => (
            <IconMessage size={ICON_SIZE} color={color} strokeWidth={2} />
          ),
          // TODO(tab-badge): wire getTotalUnread() here once dynamic badge
          // support is stable in React Navigation v7.
        }}
      />
      <Tab.Screen
        name="Friends"
        component={FriendsScreen}
        options={{
          tabBarIcon: ({ color }) => (
            <IconUsers size={ICON_SIZE} color={color} strokeWidth={2} />
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarIcon: ({ color }) => (
            <IconUser size={ICON_SIZE} color={color} strokeWidth={2} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}
