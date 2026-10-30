import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { IconChevronRight } from '@tabler/icons-react-native';

import { useThemeColors } from '../../theme/colors';

/**
 * "Your network" (Edit profile): Followers, Following and Requests with their numbers, each opening the Friends screen on its tab. The profile no longer
 * shows these counters; they live here. A red dot marks the Requests row while some follow request is waiting for an answer.
 */
export type NetworkTab = 'followers' | 'following' | 'requests';

interface Props {
  followers: number;
  following: number;
  requests: number;
  onOpen: (tab: NetworkTab) => void;
}

function formatCount(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value);
}

export function YourNetwork({ followers, following, requests, onOpen }: Props) {
  const { t } = useTranslation('profile');
  const c = useThemeColors();
  const rows: { tab: NetworkTab; label: string; count: number }[] = [
    { tab: 'followers', label: t('edit.networkFollowers'), count: followers },
    { tab: 'following', label: t('edit.networkFollowing'), count: following },
    { tab: 'requests', label: t('edit.networkRequests'), count: requests },
  ];
  return (
    <View style={styles.section}>
      <Text style={[styles.title, { color: c.textSecondary }]} accessibilityRole="header">{t('edit.networkTitle')}</Text>
      <View style={[styles.card, { backgroundColor: c.bgSurface, borderColor: c.borderSubtle }]}>
        {rows.map((row, index) => (
          <Pressable
            key={row.tab}
            testID={`edit-network-${row.tab}`}
            style={[styles.row, index > 0 && { borderTopColor: c.borderSubtle, borderTopWidth: StyleSheet.hairlineWidth }]}
            onPress={() => onOpen(row.tab)}
            accessibilityRole="button"
            accessibilityLabel={t('edit.networkA11y', { label: row.label, count: row.count })}
          >
            <Text style={[styles.label, { color: c.textPrimary }]}>{row.label}</Text>
            {row.tab === 'requests' && row.count > 0 ? <View testID="edit-network-requests-dot" style={[styles.dot, { backgroundColor: c.danger }]} /> : null}
            <Text style={[styles.count, { color: row.tab === 'requests' && row.count > 0 ? c.textPrimary : c.textSecondary }]}>{formatCount(row.count)}</Text>
            <IconChevronRight size={18} color={c.textTertiary} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginHorizontal: 20, marginBottom: 12 },
  title: { fontSize: 13, fontWeight: '700', marginBottom: 8, marginLeft: 4 },
  card: { borderWidth: 1, borderRadius: 14, overflow: 'hidden' },
  row: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14 },
  label: { flex: 1, fontSize: 15, fontWeight: '600' },
  count: { fontSize: 15, fontWeight: '700' },
  dot: { width: 9, height: 9, borderRadius: 5 },
});
