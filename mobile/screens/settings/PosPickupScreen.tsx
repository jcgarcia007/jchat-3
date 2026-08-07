/**
 * JChat 3.0 — POS Pickup Screen (waiter "Órdenes" board)
 *
 * Lets the waiter see item statuses for all open orders in the business and
 * mark ready items as delivered (set_item_status → 'done').
 *
 * Layout:
 *   Header: ← businessName  [N ready badge]
 *   Filter: [Todos] [Solo listos]
 *   SectionList: grouped by table_label
 *     Each row: qty × name  seat  status-badge  [Entregado] (if ready)
 *
 * Data: pos_pickup_board(business_id) RPC.
 * Mutation: set_item_status(order_item_id, 'done') via posSetItemStatus().
 * Realtime: order_items + orders channels, 600 ms debounce, cleaned up on unmount.
 * Reload: useFocusEffect — reloads on every screen focus.
 *
 * Scope: read + set_item_status. Does NOT touch checkout, split, or backend.
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SectionList,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  IconCheck,
  IconChevronLeft,
  IconClipboardList,
} from '@tabler/icons-react-native';

import { palette } from '../../theme/tokens';
import { useThemeColors } from '../../theme/colors';
import { supabase, isSupabaseConfigured } from '../../services/supabase';
import {
  posPickupBoard,
  posSetItemStatus,
  type PosPickupItem,
} from '../../services/pos';
import type { PosStackParamList } from '../../navigation/PosNavigator';

// ─── Navigation types ─────────────────────────────────────────────────────────

type PosPickupNav = NativeStackNavigationProp<PosStackParamList, 'PosPickup'>;
type PosPickupRoute = RouteProp<PosStackParamList, 'PosPickup'>;

// ─── Section type ─────────────────────────────────────────────────────────────

interface TableSection {
  title: string;           // table_label
  data: PosPickupItem[];
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function PosPickupScreen() {
  const c = useThemeColors();
  const { t } = useTranslation('settings');
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<PosPickupNav>();
  const route = useRoute<PosPickupRoute>();
  const { businessId, businessName } = route.params;

  const [items, setItems] = useState<PosPickupItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [deliveringId, setDeliveringId] = useState<string | null>(null);
  const [showOnlyReady, setShowOnlyReady] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load board ──────────────────────────────────────────────────────────────

  const loadBoard = useCallback(async () => {
    try {
      const rows = await posPickupBoard(businessId);
      setItems(rows);
    } catch {
      // Stay with previous data on error
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  // ── Debounced refresh for realtime ────────────────────────────────────────

  const scheduleRefresh = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { void loadBoard(); }, 600);
  }, [loadBoard]);

  // ── Reload on focus + realtime subscription ───────────────────────────────

  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      setLoading(true);

      posPickupBoard(businessId)
        .then((rows) => { if (mounted) setItems(rows); })
        .catch(() => {})
        .finally(() => { if (mounted) setLoading(false); });

      if (!isSupabaseConfigured) return undefined;

      const itemsChannel = supabase
        .channel('pos-pickup-items-rt')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'order_items' },
          scheduleRefresh,
        )
        .subscribe();

      const ordersChannel = supabase
        .channel('pos-pickup-orders-rt')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'orders' },
          scheduleRefresh,
        )
        .subscribe();

      return () => {
        mounted = false;
        if (debounceRef.current) clearTimeout(debounceRef.current);
        supabase.removeChannel(itemsChannel);
        supabase.removeChannel(ordersChannel);
      };
    }, [businessId, scheduleRefresh]),
  );

  // ── Derived values ─────────────────────────────────────────────────────────

  const readyCount = useMemo(
    () => items.filter((i) => i.item_status === 'ready').length,
    [items],
  );

  const sections = useMemo<TableSection[]>(() => {
    const filtered = showOnlyReady
      ? items.filter((i) => i.item_status === 'ready')
      : items;

    const map = new Map<string, PosPickupItem[]>();
    for (const item of filtered) {
      const key = item.table_label || '—';
      const existing = map.get(key);
      if (existing) {
        existing.push(item);
      } else {
        map.set(key, [item]);
      }
    }

    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([title, data]) => ({ title, data }));
  }, [items, showOnlyReady]);

  // ── Mark as delivered ─────────────────────────────────────────────────────

  const handleDeliver = useCallback(async (item: PosPickupItem) => {
    if (deliveringId) return;
    setDeliveringId(item.order_item_id);

    // Optimistic removal
    setItems((prev) => prev.filter((i) => i.order_item_id !== item.order_item_id));

    const result = await posSetItemStatus(item.order_item_id, 'done');
    if (!result.ok) {
      // Revert optimistic removal and alert
      void loadBoard();
      Alert.alert(t('pos.pickupErrDeliver'));
    } else {
      // Sync in background to pick up any other changes
      void loadBoard();
    }

    setDeliveringId(null);
  }, [deliveringId, loadBoard, t]);

  // ── Status badge color ────────────────────────────────────────────────────

  const statusColor = useCallback(
    (status: string): string => {
      if (status === 'preparing') return c.warning;
      if (status === 'ready')     return c.success;
      return c.textTertiary;
    },
    [c],
  );

  // ── Render item ───────────────────────────────────────────────────────────

  const renderItem = useCallback(
    ({ item }: { item: PosPickupItem }) => {
      const isReady = item.item_status === 'ready';
      const isDelivering = deliveringId === item.order_item_id;
      const sc = statusColor(item.item_status);

      const statusKey =
        item.item_status === 'preparing' ? 'pos.pickupStatusPreparing'
        : item.item_status === 'ready'   ? 'pos.pickupStatusReady'
        : 'pos.pickupStatusPending';

      return (
        <View
          style={[
            styles.itemRow,
            {
              backgroundColor: isReady ? c.success + '12' : c.bgSurface,
              borderBottomColor: c.borderSubtle,
            },
          ]}
        >
          {/* ── Name + seat ──────────────────────────────────────────────── */}
          <View style={styles.itemLeft}>
            <Text style={[styles.itemName, { color: c.textPrimary }]} numberOfLines={2}>
              {item.qty} × {item.item_name}
            </Text>
            {item.seat != null && (
              <Text style={[styles.itemSeat, { color: c.textTertiary }]}>
                {t('pos.pickupSeat', { seat: item.seat })}
              </Text>
            )}
          </View>

          {/* ── Status badge + deliver button ─────────────────────────────── */}
          <View style={styles.itemRight}>
            <View style={[styles.statusBadge, { backgroundColor: sc + '22' }]}>
              <View style={[styles.statusDot, { backgroundColor: sc }]} />
              <Text style={[styles.statusText, { color: sc }]}>
                {t(statusKey)}
              </Text>
            </View>

            {isReady && (
              <Pressable
                onPress={() => { void handleDeliver(item); }}
                disabled={deliveringId !== null}
                style={({ pressed }) => [
                  styles.deliverBtn,
                  {
                    backgroundColor: c.success,
                    opacity: pressed || isDelivering || deliveringId !== null ? 0.65 : 1,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={t('pos.pickupDelivered')}
              >
                {isDelivering ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <IconCheck size={12} color="#fff" strokeWidth={2.5} />
                    <Text style={styles.deliverBtnText}>{t('pos.pickupDelivered')}</Text>
                  </>
                )}
              </Pressable>
            )}
          </View>
        </View>
      );
    },
    [c, deliveringId, handleDeliver, statusColor, t],
  );

  // ── Render section header ─────────────────────────────────────────────────

  const renderSectionHeader = useCallback(
    ({ section }: { section: TableSection }) => (
      <View
        style={[
          styles.sectionHeader,
          { backgroundColor: c.bgBase, borderBottomColor: c.borderSubtle },
        ]}
      >
        <Text style={[styles.sectionTitle, { color: c.textSecondary }]}>
          {section.title}
        </Text>
      </View>
    ),
    [c],
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.screen, { backgroundColor: c.bgBase }]}>
      <StatusBar barStyle={c.bgBase === palette.bgBase ? 'light-content' : 'dark-content'} />

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + 12,
            backgroundColor: c.bgBase,
            borderBottomColor: c.borderSubtle,
          },
        ]}
      >
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel={t('workMode.pinCancel')}
        >
          <IconChevronLeft size={24} color={c.brand} strokeWidth={2} />
        </Pressable>

        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: c.textPrimary }]} numberOfLines={1}>
            {t('pos.pickupTitle')}
          </Text>
          <Text style={[styles.headerSub, { color: c.textTertiary }]} numberOfLines={1}>
            {businessName}
          </Text>
        </View>

        {readyCount > 0 && (
          <View style={[styles.readyBadge, { backgroundColor: c.success }]}>
            <Text style={styles.readyBadgeText}>{readyCount}</Text>
          </View>
        )}
      </View>

      {/* ── Filter toggle ───────────────────────────────────────────────────── */}
      <View
        style={[
          styles.filterBar,
          { backgroundColor: c.bgSurface, borderBottomColor: c.borderSubtle },
        ]}
      >
        <Pressable
          onPress={() => setShowOnlyReady(false)}
          style={[
            styles.filterBtn,
            !showOnlyReady && { backgroundColor: c.brand + 'DD' },
          ]}
          accessibilityRole="button"
          accessibilityState={{ selected: !showOnlyReady }}
        >
          <Text
            style={[
              styles.filterBtnText,
              { color: !showOnlyReady ? '#fff' : c.textSecondary },
            ]}
          >
            {t('pos.pickupFilterAll')}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setShowOnlyReady(true)}
          style={[
            styles.filterBtn,
            showOnlyReady && { backgroundColor: c.success + 'DD' },
          ]}
          accessibilityRole="button"
          accessibilityState={{ selected: showOnlyReady }}
        >
          <Text
            style={[
              styles.filterBtnText,
              { color: showOnlyReady ? '#fff' : c.textSecondary },
            ]}
          >
            {t('pos.pickupFilterReady')}
          </Text>
        </Pressable>
      </View>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={c.brand} />
          <Text style={[styles.centerText, { color: c.textTertiary }]}>
            {t('pos.pickupLoading')}
          </Text>
        </View>
      ) : sections.length === 0 ? (
        <View style={styles.center}>
          <IconClipboardList size={48} color={c.textTertiary} strokeWidth={1.5} />
          <Text style={[styles.emptyTitle, { color: c.textPrimary }]}>
            {showOnlyReady ? t('pos.pickupEmptyReady') : t('pos.pickupEmpty')}
          </Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.order_item_id}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          stickySectionHeadersEnabled
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const H_PAD = 16;

const styles = StyleSheet.create({
  screen: { flex: 1 },

  // ── Header ──────────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: H_PAD,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: { marginRight: 8, padding: 4 },
  headerCenter: { flex: 1, minWidth: 0 },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  headerSub: { fontSize: 12, marginTop: 2 },
  readyBadge: {
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
  readyBadgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  // ── Filter bar ──────────────────────────────────────────────────────────────
  filterBar: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: H_PAD,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  filterBtn: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 16,
  },
  filterBtnText: { fontSize: 13, fontWeight: '600' },

  // ── Section header ─────────────────────────────────────────────────────────
  sectionHeader: {
    paddingHorizontal: H_PAD,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },

  // ── Item row ────────────────────────────────────────────────────────────────
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: H_PAD,
    paddingVertical: 11,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  itemLeft: { flex: 1, minWidth: 0, gap: 2 },
  itemName: { fontSize: 14, fontWeight: '500' },
  itemSeat: { fontSize: 12 },
  itemRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },

  // ── Status badge ─────────────────────────────────────────────────────────────
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 10,
  },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 11, fontWeight: '600' },

  // ── Deliver button ────────────────────────────────────────────────────────────
  deliverBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 10,
    minWidth: 36,
  },
  deliverBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  // ── Loading / empty ─────────────────────────────────────────────────────────
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 32,
  },
  centerText: { fontSize: 14, marginTop: 8 },
  emptyTitle: { fontSize: 17, fontWeight: '600', textAlign: 'center' },
});
