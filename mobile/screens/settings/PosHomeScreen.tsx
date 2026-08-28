/**
 * JChat 3.0 — POS Home Screen (C4 simplified)
 *
 * Shows active tables as a 2-column visual grid. Each card shows only the
 * essentials so staff can quickly identify and tap a table:
 *
 *   • Table label (large, legible)
 *   • Occupancy state by color: libre (green) / ocupada (orange)
 *     — left-border stripe + state chip + legend bar
 *   • Assignment badge: mine (accent) | other (dim) | unassigned (warning)
 *
 * Removed from cards (moved to table-detail screen — future stage):
 *   • Party size +/− stepper
 *   • Open total amount
 *   • "Cobrar" button
 *   • Floor + seat-count subtitle
 *
 * Data from posTablesOverview() RPC — single call, refreshes on every focus.
 *
 * Navigation: tap any card → PosOrderScreen (unchanged from C4).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
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
  IconArchive,
  IconChevronLeft,
  IconClipboardList,
  IconLayoutGrid,
  IconPlugConnected,
  IconReceipt,
} from '@tabler/icons-react-native';

import { palette } from '../../theme/tokens';
import { useThemeColors } from '../../theme/colors';
import {
  posPickupBoard,
  posTablesOverview,
  type PosTablesOverviewRow,
} from '../../services/pos';
import { getChatPermissions } from '../../services/permissions';
import { supabase } from '../../services/supabase';
import type { PosStackParamList } from '../../navigation/PosNavigator';

// ─── Navigation types ─────────────────────────────────────────────────────────

type PosHomeNav = NativeStackNavigationProp<PosStackParamList, 'PosHome'>;
type PosHomeRoute = RouteProp<PosStackParamList, 'PosHome'>;

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function PosHomeScreen() {
  const c = useThemeColors();
  const { t } = useTranslation('settings');
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<PosHomeNav>();
  const route = useRoute<PosHomeRoute>();
  const { businessId, businessName, plan } = route.params;

  const [tables, setTables] = useState<PosTablesOverviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [readyCount, setReadyCount] = useState(0);
  const [canInventory, setCanInventory] = useState(false);

  // One-time permission check for the Inventory button
  useEffect(() => {
    void (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const perms = await getChatPermissions({ businessId, userId: user.id });
        setCanInventory(perms.inventory_manage);
      } catch {
        // Non-fatal — button stays hidden
      }
    })();
  }, [businessId]);

  // ── Reload on every focus ─────────────────────────────────────────────────
  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      setLoading(true);

      Promise.all([
        posTablesOverview(businessId),
        posPickupBoard(businessId).catch(() => []),
      ])
        .then(([rows, pickupRows]) => {
          if (mounted) {
            setTables(rows);
            setReadyCount(pickupRows.filter((i) => i.item_status === 'ready').length);
          }
        })
        .catch(() => {
          // Stay with previous data on error
        })
        .finally(() => {
          if (mounted) setLoading(false);
        });

      return () => {
        mounted = false;
      };
    }, [businessId]),
  );

  // ── Legend counts ─────────────────────────────────────────────────────────
  const freeCount = tables.filter((row) => row.state === 'libre' && row.combined_into === null).length;
  const occupiedCount = tables.filter((row) => row.state === 'ocupada' && row.combined_into === null).length;

  // ── Combined table helpers ─────────────────────────────────────────────────
  /** Map table_id → label for resolving combined_into references. */
  const labelById = useMemo<Map<string, string>>(
    () => new Map(tables.map((t) => [t.table_id, t.label])),
    [tables],
  );
  /** Set of primary table IDs (those that have at least one secondary). */
  const primaryIds = useMemo<Set<string>>(
    () => {
      const s = new Set<string>();
      for (const t of tables) {
        if (t.combined_into !== null) s.add(t.combined_into);
      }
      return s;
    },
    [tables],
  );

  // ── Navigation ────────────────────────────────────────────────────────────
  const handleTablePress = useCallback(
    (table: PosTablesOverviewRow) => {
      // Combined (secondary) tables: navigate to the primary table's hub.
      const targetId    = table.combined_into ?? table.table_id;
      const targetLabel = table.combined_into
        ? (labelById.get(table.combined_into) ?? table.label)
        : table.label;

      navigation.navigate('PosTableHub', {
        businessId,
        businessName,
        tableId: targetId,
        tableLabel: targetLabel,
        plan,
      });
    },
    [navigation, businessId, businessName, plan, labelById],
  );

  // ── Table card ────────────────────────────────────────────────────────────
  const renderTable = ({ item }: { item: PosTablesOverviewRow }) => {
    const isCombinedSecondary = item.combined_into !== null;
    const isPrimary = primaryIds.has(item.table_id);
    const isOccupied = item.state === 'ocupada';

    // Combined secondary: dim card, show "Combinada con X", tap → primary hub
    if (isCombinedSecondary) {
      const primaryLabel = labelById.get(item.combined_into!) ?? '—';
      return (
        <Pressable
          onPress={() => handleTablePress(item)}
          style={({ pressed }) => [
            styles.tableCard,
            {
              backgroundColor: c.bgSurface,
              borderColor: c.borderSubtle,
              borderLeftColor: c.brand + '88',
              opacity: pressed ? 0.75 : 0.72,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel={`${item.label}, ${t('pos.combinedWith', { label: primaryLabel })}`}
        >
          <View style={styles.cardTopRow}>
            <View style={[styles.stateChip, { backgroundColor: c.brand + '18' }]}>
              <IconPlugConnected size={11} color={c.brand} strokeWidth={2} />
              <Text style={[styles.stateText, { color: c.brand }]}>
                {t('pos.combinedWith', { label: primaryLabel })}
              </Text>
            </View>
          </View>
          <Text style={[styles.tableLabel, { color: c.textTertiary }]} numberOfLines={1}>
            {item.label}
          </Text>
        </Pressable>
      );
    }

    // Normal / primary table card
    const stateColor = isOccupied ? c.warning : c.success;

    // Assignment badge
    let assignLabel: string | null = null;
    let assignColor = c.textTertiary;
    if (item.assignment === 'mine') {
      assignLabel = t('pos.assignmentMine');
      assignColor = c.brand;
    } else if (item.assignment === 'other') {
      assignLabel = t('pos.assignmentOther');
      assignColor = c.textTertiary;
    } else if (isOccupied) {
      assignLabel = t('pos.assignmentUnassigned');
      assignColor = c.warning;
    }

    return (
      <Pressable
        onPress={() => handleTablePress(item)}
        style={({ pressed }) => [
          styles.tableCard,
          {
            backgroundColor: c.bgSurface,
            borderColor: isOccupied ? stateColor + '55' : c.borderSubtle,
            borderLeftColor: stateColor,
          },
          pressed && { opacity: 0.82 },
        ]}
        accessibilityRole="button"
        accessibilityLabel={`${item.label}, ${isOccupied ? t('pos.stateOcupada') : t('pos.stateLibre')}`}
      >
        {/* ── State chip + assignment badge ────────────────────────────────── */}
        <View style={styles.cardTopRow}>
          <View style={[styles.stateChip, { backgroundColor: stateColor + '22' }]}>
            <View style={[styles.stateDot, { backgroundColor: stateColor }]} />
            <Text style={[styles.stateText, { color: stateColor }]}>
              {isOccupied ? t('pos.stateOcupada') : t('pos.stateLibre')}
            </Text>
          </View>

          {assignLabel ? (
            <View style={[styles.assignBadge, { backgroundColor: assignColor + '22' }]}>
              <Text style={[styles.assignText, { color: assignColor }]}>
                {assignLabel}
              </Text>
            </View>
          ) : null}

          {/* Combined-primary indicator */}
          {isPrimary ? (
            <View style={[styles.assignBadge, { backgroundColor: c.brand + '18' }]}>
              <IconPlugConnected size={10} color={c.brand} strokeWidth={2} />
            </View>
          ) : null}
        </View>

        {/* ── Table label ─────────────────────────────────────────────────── */}
        <Text style={[styles.tableLabel, { color: c.textPrimary }]} numberOfLines={1}>
          {item.label}
        </Text>
      </Pressable>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.screen, { backgroundColor: c.bgBase }]}>
      <StatusBar
        barStyle={c.bgBase === palette.bgBase ? 'light-content' : 'dark-content'}
      />

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
        <Text
          style={[styles.headerTitle, { color: c.textPrimary }]}
          numberOfLines={1}
        >
          {businessName}
        </Text>

        {/* ── Inventory button (inventory_manage or owner) ──────────── */}
        {canInventory ? (
          <Pressable
            onPress={() => navigation.navigate('PosInventory', { businessId, businessName })}
            style={({ pressed }) => [styles.ordersButton, { opacity: pressed ? 0.65 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel={t('pos.inventoryBtn', { defaultValue: 'Inventario' })}
          >
            <IconArchive size={22} color={c.brand} strokeWidth={2} />
          </Pressable>
        ) : null}

        {/* ── Recibos de hoy (Fase 4B) ─────────────────────────────────── */}
        <Pressable
          onPress={() => navigation.navigate('PosReceipts', { businessId })}
          style={({ pressed }) => [styles.ordersButton, { opacity: pressed ? 0.65 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel={t('pos.receiptsTitle')}
        >
          <IconReceipt size={22} color={c.brand} strokeWidth={2} />
        </Pressable>

        {/* ── Órdenes (pickup board) button ────────────────────────────── */}
        <Pressable
          onPress={() => navigation.navigate('PosPickup', { businessId, businessName })}
          style={({ pressed }) => [styles.ordersButton, { opacity: pressed ? 0.65 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel={t('pos.ordersBtn')}
        >
          <IconClipboardList size={22} color={c.brand} strokeWidth={2} />
          {readyCount > 0 && (
            <View style={[styles.ordersBadge, { backgroundColor: c.success }]}>
              <Text style={styles.ordersBadgeText}>{readyCount}</Text>
            </View>
          )}
        </Pressable>
      </View>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={c.brand} />
          <Text style={[styles.loadingText, { color: c.textTertiary }]}>
            {t('pos.tablesLoading')}
          </Text>
        </View>
      ) : tables.length === 0 ? (
        <View style={styles.center}>
          <IconLayoutGrid size={48} color={c.textTertiary} strokeWidth={1.5} />
          <Text style={[styles.emptyTitle, { color: c.textPrimary }]}>
            {t('pos.tablesEmpty')}
          </Text>
          <Text style={[styles.emptySub, { color: c.textTertiary }]}>
            {t('pos.tablesEmptySub')}
          </Text>
        </View>
      ) : (
        <>
          {/* ── Legend bar ──────────────────────────────────────────────────── */}
          <View
            style={[
              styles.legendBar,
              {
                backgroundColor: c.bgSurface,
                borderBottomColor: c.borderSubtle,
              },
            ]}
          >
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: c.success }]} />
              <Text style={[styles.legendText, { color: c.textSecondary }]}>
                {t('pos.stateLibre')}
              </Text>
              <Text style={[styles.legendCount, { color: c.textPrimary }]}>
                {freeCount}
              </Text>
            </View>

            <View style={[styles.legendSep, { backgroundColor: c.borderSubtle }]} />

            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: c.warning }]} />
              <Text style={[styles.legendText, { color: c.textSecondary }]}>
                {t('pos.stateOcupada')}
              </Text>
              <Text style={[styles.legendCount, { color: c.textPrimary }]}>
                {occupiedCount}
              </Text>
            </View>
          </View>

          {/* ── Table grid ──────────────────────────────────────────────────── */}
          <FlatList
            data={tables}
            keyExtractor={(item) => item.table_id}
            numColumns={2}
            contentContainerStyle={[
              styles.grid,
              { paddingBottom: insets.bottom + 24 },
            ]}
            columnWrapperStyle={styles.gridRow}
            renderItem={renderTable}
            showsVerticalScrollIndicator={false}
          />
        </>
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
  headerTitle: { flex: 1, fontSize: 20, fontWeight: '600' },

  // ── Loading / empty ─────────────────────────────────────────────────────────
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 32,
  },
  loadingText: { fontSize: 14, marginTop: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '600', textAlign: 'center' },
  emptySub: { fontSize: 14, textAlign: 'center', lineHeight: 20 },

  // ── Legend bar ───────────────────────────────────────────────────────────────
  legendBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: H_PAD,
    paddingVertical: 10,
    gap: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 9, height: 9, borderRadius: 5 },
  legendText: { fontSize: 13 },
  legendCount: { fontSize: 13, fontWeight: '700' },
  legendSep: { width: StyleSheet.hairlineWidth, height: 14 },

  // ── Grid ────────────────────────────────────────────────────────────────────
  grid: { paddingTop: 16, paddingHorizontal: H_PAD, gap: 12 },
  gridRow: { gap: 12 },

  // ── Table card ──────────────────────────────────────────────────────────────
  tableCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: 3,
    padding: 12,
    gap: 8,
  },

  // ── State chip ───────────────────────────────────────────────────────────────
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  stateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 10,
  },
  stateDot: { width: 7, height: 7, borderRadius: 4 },
  stateText: { fontSize: 11, fontWeight: '600' },

  // ── Assignment badge ─────────────────────────────────────────────────────────
  assignBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 10,
  },
  assignText: { fontSize: 11, fontWeight: '600' },

  // ── Table label ──────────────────────────────────────────────────────────────
  tableLabel: { fontSize: 20, fontWeight: '700', letterSpacing: -0.3 },

  // ── Órdenes header button ────────────────────────────────────────────────────
  ordersButton: { padding: 6, marginLeft: 6, position: 'relative' },
  ordersBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ordersBadgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },
});
