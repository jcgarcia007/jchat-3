/**
 * JChat 3.0 — ReconnectingBanner: a discreet "Reconectando…" line while a chat's live channel is down for more
 * than a few seconds (see hooks/useResilientChannel). It takes no space when everything is fine and is announced
 * politely to screen readers. Colors from the chat theme.
 */

import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

interface Props {
  visible: boolean;
  textColor: string;
  backgroundColor: string;
  borderColor: string;
}

export function ReconnectingBanner({ visible, textColor, backgroundColor, borderColor }: Props): React.ReactElement | null {
  const { t } = useTranslation('common');
  if (!visible) return null;
  return (
    <View
      testID="reconnecting-banner"
      role="status"
      accessibilityLiveRegion="polite"
      style={[styles.banner, { backgroundColor, borderBottomColor: borderColor }]}
    >
      <ActivityIndicator size="small" color={textColor} />
      <Text style={[styles.text, { color: textColor }]}>{t('realtime.reconnecting')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  text: { fontSize: 12, fontWeight: '600' },
});
