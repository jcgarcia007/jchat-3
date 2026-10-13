/**
 * JChat 3.0 — NewMessagesPill: shown above the profile sheet while the venue chat behind it receives messages
 * ("💬 3 mensajes nuevos en {local} ↓"). Tapping it closes the sheet and returns to the chat.
 */

import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { palette } from '../../theme/tokens';

interface Props {
  count: number;
  business: string;
  onPress: () => void;
}

export function NewMessagesPill({ count, business, onPress }: Props): React.ReactElement | null {
  const { t } = useTranslation('profile');
  const insets = useSafeAreaInsets();
  if (count <= 0) return null;
  const label = t('sheet.newMessages', { count, business });
  return (
    <Pressable
      testID="profile-new-messages"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityLiveRegion="polite"
      style={({ pressed }) => [styles.pill, { top: insets.top + 6, backgroundColor: palette.brandFill, opacity: pressed ? 0.85 : 1 }]}
    >
      <Text numberOfLines={1} style={[styles.label, { color: palette.onBrand }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: { position: 'absolute', alignSelf: 'center', maxWidth: '90%', minHeight: 36, paddingHorizontal: 16, borderRadius: 18, justifyContent: 'center', zIndex: 20, elevation: 6 },
  label: { fontSize: 14, fontWeight: '700' },
});
