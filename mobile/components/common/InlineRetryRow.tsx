/**
 * JChat 3.0 — InlineRetryRow: a one-line error with a "Reintentar" button, shown in place (e.g. under a chat's top
 * bar when the messages could not be loaded). Takes no space while `visible` is false. Colors are passed in by
 * the caller (the chat theme); the error text is announced politely to screen readers.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { IconAlertCircle } from '@tabler/icons-react-native';

interface Props {
  visible: boolean;
  message: string;
  onRetry: () => void;
  textColor: string;
  accentColor: string;
  backgroundColor: string;
  borderColor: string;
}

export function InlineRetryRow({
  visible,
  message,
  onRetry,
  textColor,
  accentColor,
  backgroundColor,
  borderColor,
}: Props): React.ReactElement | null {
  const { t } = useTranslation('common');
  if (!visible) return null;
  return (
    <View
      testID="inline-retry-row"
      role="alert"
      accessibilityLiveRegion="polite"
      style={[styles.row, { backgroundColor, borderBottomColor: borderColor }]}
    >
      <IconAlertCircle size={18} color={accentColor} />
      <Text style={[styles.message, { color: textColor }]} numberOfLines={2}>
        {message}
      </Text>
      <Pressable
        testID="inline-retry-button"
        accessibilityRole="button"
        accessibilityLabel={t('actions.retry')}
        hitSlop={10}
        onPress={onRetry}
        style={styles.retry}
      >
        <Text style={[styles.retryLabel, { color: accentColor }]}>{t('actions.retry')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  message: { flex: 1, fontSize: 13 },
  retry: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  retryLabel: { fontSize: 13, fontWeight: '700' },
});
