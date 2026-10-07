/**
 * One pinned "In progress" row of Notifications for an order the user swiped away from the home bar.
 * It is derived from the live order (status follows realtime); tapping opens the order tracking. Used by the
 * Messages tab and by the chat's 🔔 sheet.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { IconReceipt } from '@tabler/icons-react-native';

import { useThemeColors } from '../../theme/colors';
import type { ActiveOrder } from '../../services/orders';

interface Props {
  order: ActiveOrder;
  onPress: (order: ActiveOrder) => void;
  /** Row background: the Messages tab sits on bgBase, the sheet on bgSurface. */
  background: string;
}

export function PinnedOrderRow({ order, onPress, background }: Props): React.ReactElement {
  const c = useThemeColors();
  const { t } = useTranslation('social');
  const { t: tPos } = useTranslation('pos');
  const status = tPos(`tracking.status.${order.status}`, { defaultValue: order.status });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('messages.pinnedOrderA11y', { n: order.order_number, status })}
      onPress={() => onPress(order)}
      style={[styles.row, { backgroundColor: background, borderBottomColor: c.borderSubtle }]}
    >
      <View style={[styles.icon, { backgroundColor: c.brandLight }]}>
        <IconReceipt size={21} color={c.brand} strokeWidth={2} />
      </View>
      <View style={styles.content}>
        <Text style={[styles.title, { color: c.textPrimary }]} numberOfLines={1}>
          {t('messages.pinnedOrderTitle', { n: order.order_number, status })}
        </Text>
        <Text style={[styles.sub, { color: c.textTertiary }]} numberOfLines={1}>
          {t('messages.pinnedOrderSub', { business: order.business_name ?? '' })}
        </Text>
      </View>
      <View style={[styles.badge, { backgroundColor: c.brandLight }]}>
        <Text style={[styles.badgeText, { color: c.brand }]}>{t('messages.pinnedBadge')}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  content: { flex: 1, gap: 2 },
  title: { fontSize: 15, fontWeight: '700' },
  sub: { fontSize: 13 },
  badge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { fontSize: 12, fontWeight: '700' },
});
