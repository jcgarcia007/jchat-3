/**
 * JChat 3.0 — DmNotice: the short floating notice for a direct message that arrived while the profile sheet is
 * open (name + text). Tapping it opens the conversation; it dismisses itself after 6 s.
 */

import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { IconMessageCircle } from '@tabler/icons-react-native';

import { useThemeColors } from '../../theme/colors';
import type { IncomingDmNotice } from '../../hooks/useIncomingDmNotice';

interface Props {
  notice: IncomingDmNotice;
  /** Offset below the new-messages pill when both show. */
  extraTop?: number;
  onOpen: (notice: IncomingDmNotice) => void;
  onDismiss: () => void;
}

export function DmNotice({ notice, extraTop = 0, onOpen, onDismiss }: Props): React.ReactElement {
  const c = useThemeColors();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation('profile');

  useEffect(() => {
    const timer = setTimeout(onDismiss, 6000);
    return () => clearTimeout(timer);
  }, [notice, onDismiss]);

  return (
    <Pressable
      testID="profile-dm-notice"
      onPress={() => onOpen(notice)}
      accessibilityRole="button"
      accessibilityLabel={t('sheet.dmNoticeA11y', { name: notice.name, text: notice.text })}
      accessibilityLiveRegion="polite"
      style={({ pressed }) => [styles.box, { top: insets.top + 6 + extraTop, backgroundColor: c.bgSurface, borderColor: c.borderSubtle, opacity: pressed ? 0.85 : 1 }]}
    >
      <IconMessageCircle size={20} color={c.brand} />
      <Text numberOfLines={1} style={[styles.text, { color: c.textPrimary }]}>
        <Text style={styles.name}>{notice.name}</Text>
        {notice.text ? `  ${notice.text}` : ''}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: { position: 'absolute', alignSelf: 'center', width: '92%', maxWidth: 420, minHeight: 48, borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10, zIndex: 21, elevation: 8 },
  text: { flex: 1, fontSize: 14 },
  name: { fontWeight: '800' },
});
