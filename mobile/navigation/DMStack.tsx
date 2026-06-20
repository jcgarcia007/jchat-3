/**
 * JChat 3.0 — DM Stack Navigator (Task 1.12)
 *
 * Screens:
 *   DMInbox  — conversation list
 *   DMChat   — full chat for a given conversationId
 *
 * Usage: rendered as the DMs tab component inside BottomTabs.
 */

import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import DMInboxScreen from '../screens/dms/DMInboxScreen';
import DMChatScreen from '../screens/dms/DMChatScreen';

// ─── Param list (exported for typed navigation hooks) ─────────────────────────

export type DMStackParamList = {
  DMInbox: undefined;
  DMChat: {
    conversationId: string;
    /** Optional: used to load the partner's profile on first open. */
    otherUserId?: string;
  };
};

const Stack = createNativeStackNavigator<DMStackParamList>();

// ─── Navigator ────────────────────────────────────────────────────────────────

export default function DMStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="DMInbox" component={DMInboxScreen} />
      <Stack.Screen name="DMChat" component={DMChatScreen} />
    </Stack.Navigator>
  );
}
