/**
 * JChat 3.0 — ChatRoom Screen placeholder (Task 0.7)
 * Real implementation: Task 2.4
 * Deep-link target: jchat://room/:id
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import type { MainStackParamList } from '../../navigation/AppNavigator';

type ChatRoomRoute = RouteProp<MainStackParamList, 'ChatRoom'>;

export default function ChatRoomScreen() {
  const c = useThemeColors();
  const route = useRoute<ChatRoomRoute>();
  const roomId = route.params?.id ?? '(unknown)';

  return (
    <View style={[styles.container, { backgroundColor: c.bgBase }]}>
      <Text style={[styles.title, { color: c.textPrimary }]}>Chat Room</Text>
      <Text style={[styles.roomId, { color: palette.brand }]}>#{roomId}</Text>
      <Text style={[styles.subtitle, { color: c.textTertiary }]}>
        Coming — Task 2.4
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: '600' },
  roomId: { fontSize: 18, fontWeight: '500', marginTop: 8 },
  subtitle: { fontSize: 14, marginTop: 6 },
});
