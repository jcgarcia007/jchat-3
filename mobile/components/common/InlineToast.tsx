/**
 * JChat 3.0 — InlineToast: a short message with one optional action ("Deshacer"), drawn INSIDE the
 * surface that mounts it (absolute, bottom of the nearest positioned parent such as a sheet) instead of
 * over the whole app. It dismisses itself after `durationMs` (4 s) and clears its timer on unmount, so a
 * parent that closes (a sheet) simply unmounts it and whatever it announced stays done.
 *
 * Accessibility: announced politely to screen readers (accessibilityLiveRegion on Android/iOS,
 * role="status" on web). No sound, no vibration.
 */

import React, { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { IconCheck } from '@tabler/icons-react-native';

import { useThemeColors } from '../../theme/colors';

interface Props {
  message: string;
  /** Label of the optional action button (e.g. "Deshacer"). */
  actionLabel?: string;
  onAction?: () => void;
  /** Called after `durationMs` and after the action was pressed. */
  onDismiss: () => void;
  durationMs?: number;
  /** Distance from the bottom of the parent (e.g. the safe-area inset + margin). */
  bottom?: number;
  testID?: string;
}

export function InlineToast({
  message,
  actionLabel,
  onAction,
  onDismiss,
  durationMs = 4000,
  bottom = 16,
  testID,
}: Props): React.ReactElement {
  const c = useThemeColors();
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    const timer = setTimeout(() => dismissRef.current(), durationMs);
    return () => clearTimeout(timer);
  }, [durationMs, message]);

  return (
    <View
      testID={testID}
      role="status"
      accessibilityLiveRegion="polite"
      accessibilityLabel={message}
      style={[styles.toast, { bottom, backgroundColor: c.bgElevated, borderColor: c.borderSubtle }]}
    >
      <IconCheck size={18} color={c.success} strokeWidth={2.5} />
      <Text style={[styles.message, { color: c.textPrimary }]} numberOfLines={2}>
        {message}
      </Text>
      {actionLabel && onAction ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          hitSlop={10}
          onPress={() => {
            onAction();
            onDismiss();
          }}
          style={styles.action}
        >
          <Text style={[styles.actionLabel, { color: c.brand }]}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: 16,
    right: 16,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    zIndex: 20,
    elevation: 6,
  },
  message: { flex: 1, fontSize: 14, lineHeight: 19 },
  action: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { fontSize: 14, fontWeight: '700' },
});
