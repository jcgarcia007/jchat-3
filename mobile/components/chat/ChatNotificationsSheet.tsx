/**
 * JChat 3.0 — ChatNotificationsSheet
 *
 * The 🔔 of the chat top bar: a sheet over the chat with the user's notifications, filtered
 * All / Match / Orders. Tapping a row opens its screen (likes → "Liked me", match → its chat,
 * order_status → tracking, gifts → the 1:1 chat); closing returns to the chat.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View, type ListRenderItemInfo } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { IconX } from '@tabler/icons-react-native';

import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import { NOTIFICATION_ICONS } from '../../hooks/useNotificationPresenter';
import {
  isMatchNotificationType,
  isOrderNotificationType,
  routeForNotification,
  type NotificationRoute,
  type NotificationRow,
} from '../../services/notifications';
import { formatSocialTime } from '../../utils/formatSocialTime';

type Filter = 'all' | 'match' | 'orders';
const FILTERS: Filter[] = ['all', 'match', 'orders'];

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Already filtered/visible rows (from useNotificationPresenter). */
  notifications: NotificationRow[];
  textFor: (row: NotificationRow) => string;
  onMarkRead: (id: string) => void;
  /** Opens the route of a tapped notification (the sheet closes first). */
  onOpenRoute: (route: NotificationRoute) => void;
}

export function ChatNotificationsSheet({
  visible,
  onClose,
  notifications,
  textFor,
  onMarkRead,
  onOpenRoute,
}: Props): React.ReactElement {
  const c = useThemeColors();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation('chat');
  const { t: tSocial, i18n: i18nSocial } = useTranslation('social');
  const [filter, setFilter] = useState<Filter>('all');

  const rows = useMemo(
    () =>
      notifications.filter((n) =>
        filter === 'all' ? true : filter === 'match' ? isMatchNotificationType(n.type) : isOrderNotificationType(n.type),
      ),
    [notifications, filter],
  );

  const open = useCallback(
    (row: NotificationRow) => {
      onMarkRead(row.id);
      const route = routeForNotification(row.type, row.payload);
      onClose();
      if (route) onOpenRoute(route);
    },
    [onMarkRead, onClose, onOpenRoute],
  );

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<NotificationRow>) => {
      const Icon = NOTIFICATION_ICONS[item.type];
      return (
        <Pressable
          accessibilityRole="button"
          onPress={() => open(item)}
          style={[styles.row, { backgroundColor: item.is_read ? c.bgSurface : c.bgElevated, borderBottomColor: c.borderSubtle }]}
        >
          <View style={[styles.iconWrap, { backgroundColor: c.brandLight }]}>
            <Icon size={20} color={c.brand} strokeWidth={2} />
          </View>
          <View style={styles.rowText}>
            <Text style={[styles.text, { color: c.textPrimary }]}>{textFor(item)}</Text>
            <Text style={[styles.time, { color: c.textTertiary }]}>
              {formatSocialTime(item.created_at, i18nSocial.language, tSocial)}
            </Text>
          </View>
          {!item.is_read ? <View style={[styles.dot, { backgroundColor: c.danger }]} /> : null}
        </Pressable>
      );
    },
    [c, open, textFor, tSocial, i18nSocial.language],
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose} accessibilityRole="none" />
      <View style={[styles.sheet, { backgroundColor: c.bgSurface, paddingBottom: insets.bottom + 8 }]}>
        <View style={[styles.handle, { backgroundColor: c.borderSubtle }]} />
        <View style={styles.header}>
          <Text style={[styles.title, { color: c.textPrimary }]}>{t('notificationsSheet.title')}</Text>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t('notificationsSheet.close')}
            style={styles.closeBtn}
          >
            <IconX size={22} color={c.textSecondary} />
          </Pressable>
        </View>

        <View style={styles.filters} accessibilityRole="tablist">
          {FILTERS.map((f) => {
            const active = f === filter;
            return (
              <Pressable
                key={f}
                onPress={() => setFilter(f)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                style={[
                  styles.chip,
                  { backgroundColor: active ? c.brand : c.bgElevated, borderColor: active ? c.brand : c.borderSubtle },
                ]}
              >
                <Text style={[styles.chipLabel, { color: active ? palette.onBrand : c.textPrimary }]}>
                  {t(`notificationsSheet.filter.${f}`)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: c.textSecondary }]}>
              {t('notificationsSheet.empty')}
            </Text>
          }
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: palette.scrimMedium },
  sheet: {
    maxHeight: '75%',
    minHeight: '45%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginBottom: 4 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 20, paddingRight: 8 },
  title: { fontSize: 18, fontWeight: '700' },
  closeBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  filters: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
  chip: { minHeight: 44, paddingHorizontal: 16, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  chipLabel: { fontSize: 14, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, minHeight: 64, borderBottomWidth: StyleSheet.hairlineWidth },
  iconWrap: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, gap: 2 },
  text: { fontSize: 15, lineHeight: 20 },
  time: { fontSize: 12 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  empty: { textAlign: 'center', paddingVertical: 32, fontSize: 14 },
});
