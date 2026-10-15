/**
 * JChat 3.0 — ChatNotificationsSheet
 *
 * The 🔔 of the chat top bar: a sheet over the chat with the user's notifications, filtered
 * All / Match / Orders. Tapping a row opens its screen (likes → "Liked me", match → its chat,
 * order_status → tracking, gifts → the 1:1 chat); closing returns to the chat.
 *
 * Under the chips, while the active filter has unread rows: "{n} sin leer" + "Marcar todo como leído". No
 * confirmation: it marks at once and an inline toast (4 s) offers "Deshacer". Closing the sheet drops the
 * toast; the marking stays done.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View, type ListRenderItemInfo } from 'react-native';
import { AppModal } from '../common/AppModal';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { IconChecks, IconX } from '@tabler/icons-react-native';

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
import { InlineToast } from '../common/InlineToast';
import { PinnedOrderRow } from '../venue/PinnedOrderRow';
import type { ActiveOrder } from '../../services/orders';

type Filter = 'all' | 'match' | 'orders';
const FILTERS: Filter[] = ['all', 'match', 'orders'];

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Already filtered/visible rows (from useNotificationPresenter). */
  notifications: NotificationRow[];
  textFor: (row: NotificationRow) => string;
  onMarkRead: (id: string) => void;
  /** Marks every unread notification of the filter as read; resolves with the ids it changed ([] on failure). */
  onMarkAllRead: (filter: Filter) => Promise<string[]>;
  /** Puts those ids back to unread (the toast's Undo). */
  onUndoMarkAll: (ids: string[]) => void;
  /** Opens the route of a tapped notification (the sheet closes first). */
  onOpenRoute: (route: NotificationRoute) => void;
  /** Orders in progress the user swiped away from the home bar: pinned on top of All / Orders. */
  pinnedOrders?: ActiveOrder[];
}

export function ChatNotificationsSheet({
  visible,
  onClose,
  notifications,
  textFor,
  onMarkRead,
  onMarkAllRead,
  onUndoMarkAll,
  onOpenRoute,
  pinnedOrders = [],
}: Props): React.ReactElement {
  const c = useThemeColors();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation('chat');
  const { t: tSocial, i18n: i18nSocial } = useTranslation('social');
  const [filter, setFilter] = useState<Filter>('all');
  const [toast, setToast] = useState<{ ids: string[]; count: number } | null>(null);
  const [marking, setMarking] = useState(false);

  // Closing the sheet drops the toast (what it announced stays done).
  useEffect(() => {
    if (!visible) setToast(null);
  }, [visible]);

  const rows = useMemo(
    () =>
      notifications.filter((n) =>
        filter === 'all' ? true : filter === 'match' ? isMatchNotificationType(n.type) : isOrderNotificationType(n.type),
      ),
    [notifications, filter],
  );

  const unreadIds = useMemo(() => rows.filter((n) => !n.is_read).map((n) => n.id), [rows]);

  const markAll = useCallback(async () => {
    if (marking || unreadIds.length === 0) return;
    setMarking(true);
    const shown = new Set(unreadIds);
    const ids = await onMarkAllRead(filter);
    setMarking(false);
    if (ids.length === 0) return;
    // The count says what the person saw (Match rows of venues with Match off are hidden from the list).
    setToast({ ids, count: ids.filter((id) => shown.has(id)).length || ids.length });
  }, [marking, unreadIds, onMarkAllRead, filter]);

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
            <Icon size={20} color={c.brandText} strokeWidth={2} />
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
    <AppModal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable accessible={false} style={styles.overlay} onPress={onClose} accessibilityRole="none" />
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
                  { backgroundColor: active ? c.brandFill : c.bgElevated, borderColor: active ? c.brand : c.borderSubtle },
                ]}
              >
                <Text style={[styles.chipLabel, { color: active ? palette.onBrand : c.textPrimary }]}>
                  {t(`notificationsSheet.filter.${f}`)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {unreadIds.length > 0 ? (
          <View style={styles.markAllRow}>
            <Text style={[styles.unreadText, { color: c.textTertiary }]}>
              {t('notificationsSheet.unreadCount', { count: unreadIds.length })}
            </Text>
            <Pressable
              onPress={() => void markAll()}
              disabled={marking}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('notificationsSheet.markAllRead')}
              style={[styles.markAllBtn, { backgroundColor: c.brandLight, opacity: marking ? 0.6 : 1 }]}
            >
              <IconChecks size={17} color={c.brandText} />
              <Text style={[styles.markAllLabel, { color: c.brandText }]}>{t('notificationsSheet.markAllRead')}</Text>
            </Pressable>
          </View>
        ) : null}

        <FlatList
          ListHeaderComponent={
            filter !== 'match' && pinnedOrders.length > 0 ? (
              <View>
                {pinnedOrders.map((order) => (
                  <PinnedOrderRow
                    key={order.id}
                    order={order}
                    background={c.bgSurface}
                    onPress={(o) => {
                      onClose();
                      onOpenRoute({ screen: 'OrderTracking', params: { orderId: o.id } });
                    }}
                  />
                ))}
              </View>
            ) : null
          }
          data={rows}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          ListEmptyComponent={
            filter !== 'match' && pinnedOrders.length > 0 ? null : (
              <Text style={[styles.empty, { color: c.textSecondary }]}>
                {t('notificationsSheet.empty')}
              </Text>
            )
          }
        />

        {toast ? (
          <InlineToast
            testID="notifications-undo-toast"
            message={t('notificationsSheet.markedRead', { count: toast.count })}
            actionLabel={t('actions.undo', { ns: 'common' })}
            onAction={() => onUndoMarkAll(toast.ids)}
            onDismiss={() => setToast(null)}
            bottom={insets.bottom + 12}
          />
        ) : null}
      </View>
    </AppModal>
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
  markAllRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 16, paddingBottom: 8 },
  unreadText: { flexShrink: 1, fontSize: 13 },
  markAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: 12, borderRadius: 10 },
  markAllLabel: { fontSize: 13, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, minHeight: 64, borderBottomWidth: StyleSheet.hairlineWidth },
  iconWrap: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, gap: 2 },
  text: { fontSize: 15, lineHeight: 20 },
  time: { fontSize: 12 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  empty: { textAlign: 'center', paddingVertical: 32, fontSize: 14 },
});
