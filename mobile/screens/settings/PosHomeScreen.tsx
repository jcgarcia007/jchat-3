/**
 * JChat 3.0 — POS Home Screen (C4 — Table Grid with States)
 *
 * Shows active tables as a 2-column visual grid. Each card reflects live state:
 *   • state:      'libre' (green) | 'ocupada' (orange)
 *   • assignment: 'mine' (accent) | 'other' (dim) | 'unassigned' (neutral)
 *   • party_size: adjustable with inline +/− stepper (calls posSetPartySize best-effort)
 *   • open total: sum of unpaid orders shown when > 0
 *
 * Data from posTablesOverview() RPC — single call, replaces posTables + posOpenOrdersSummary.
 * Refreshes on every focus (useFocusEffect → returning from PosOrder/PosCheckout).
 *
 * Navigation (unchanged):
 *   • Tap card          → PosOrderScreen  (nueva orden)
 *   • "Cobrar" button   → PosCheckoutScreen (only for occupied tables)
 */

import React, { useCallback, useState } from 'react';
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
  IconChevronLeft,
  IconCreditCard,
  IconLayoutGrid,
  IconMinus,
  IconPlus,
  IconUserFilled,
} from '@tabler/icons-react-native';

import { palette } from '../../theme/tokens';
import { useThemeColors } from '../../theme/colors';
import {
  posTablesOverview,
  posSetPartySize,
  type PosTablesOverviewRow,
} from '../../services/pos';
import type { PosStackParamList } from '../../navigation/PosNavigator';

// ─── Navigation types ─────────────────────────────────────────────────────────

type PosHomeNav = NativeStackNavigationProp<PosStackParamList, 'PosHome'>;
type PosHomeRoute = RouteProp<PosStackParamList, 'PosHome'>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

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

  // ── Reload on every focus ────────────────────────────────────────────────────
  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      setLoading(true);

      posTablesOverview(businessId)
        .then((rows) => {
          if (mounted) setTables(rows);
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

  // ── Legend counts ────────────────────────────────────────────────────────────
  const freeCount = tables.filter((row) => row.state === 'libre').length;
  const occupiedCount = tables.length - freeCount;

  // ── Party size stepper ───────────────────────────────────────────────────────
  /**
   * Optimistically update party_size for a table and call the RPC best-effort.
   * Reverts local state on RPC failure so the next focus refresh will correct it.
   */
  const adjustParty = useCallback(
    (tableId: string, delta: number) => {
      // Read current value from state before updating
      setTables((prev) => {
        const target = prev.find((row) => row.table_id === tableId);
        if (!target) return prev;
        const max = target.seats ?? 100;
        const current = target.party_size ?? 0;
        const next = Math.min(Math.max(0, current + delta), max);
        if (next === current) return prev; // nothing to do

        // Fire RPC (best-effort; revert on failure)
        posSetPartySize(businessId, tableId, next).catch(() => {
          setTables((p) =>
            p.map((row) =>
              row.table_id === tableId ? { ...row, party_size: current } : row,
            ),
          );
        });

        return prev.map((row) =>
          row.table_id === tableId ? { ...row, party_size: next } : row,
        );
      });
    },
    [businessId],
  );

  // ── Navigation helpers ───────────────────────────────────────────────────────
  const handleNewOrder = useCallback(
    (table: PosTablesOverviewRow) => {
      navigation.navigate('PosOrder', {
        businessId,
        businessName,
        tableId: table.table_id,
        tableLabel: table.label,
        plan,
      });
    },
    [navigation, businessId, businessName, plan],
  );

  const handleCobrar = useCallback(
    (table: PosTablesOverviewRow) => {
      navigation.navigate('PosCheckout', {
        businessId,
        tableId: table.table_id,
        tableLabel: table.label,
      });
    },
    [navigation, businessId],
  );

  // ── Table card ───────────────────────────────────────────────────────────────
  const renderTable = ({ item }: { item: PosTablesOverviewRow }) => {
    const isOccupied = item.state === 'ocupada';
    const stateColor = isOccupied ? c.warning : c.success;
    const hasOpenTotal = isOccupied && item.open_total_cents > 0;
    const partySize = item.party_size ?? 0;

    // Subtitle: floor and/or seats
    const subParts: string[] = [];
    if (item.floor) subParts.push(t('pos.tableFloor', { floor: item.floor }));
    if (typeof item.seats === 'number') subParts.push(t('pos.tableSeats', { count: item.seats }));
    const subtitle = subParts.join(' · ');

    // Assignment badge config
    let assignLabel: string | null = null;
    let assignColor = c.textTertiary;
    if (item.assignment === 'mine') {
      assignLabel = t('pos.assignmentMine');
      assignColor = c.brand;
    } else if (item.assignment === 'other') {
      assignLabel = t('pos.assignmentOther');
      assignColor = c.textTertiary;
    } else if (isOccupied) {
      // unassigned + occupied: flag it so staff can claim the table
      assignLabel = t('pos.assignmentUnassigned');
      assignColor = c.warning;
    }

    return (
      <Pressable
        onPress={() => handleNewOrder(item)}
        style={({ pressed }) => [
          styles.tableCard,
          {
            backgroundColor: c.bgSurface,
            // Subtle overall border tinted by state for occupied; neutral for libre
            borderColor: isOccupied ? stateColor + '55' : c.borderSubtle,
            // Bold left accent stripe — visual state indicator
            borderLeftColor: stateColor,
          },
          pressed && { opacity: 0.82 },
        ]}
        accessibilityRole="button"
        accessibilityLabel={`${item.label}, ${isOccupied ? t('pos.stateOcupada') : t('pos.stateLibre')}`}
      >
        {/* ── Row 1: state chip + assignment badge ──────────────────────────── */}
        <View style={styles.cardTopRow}>
          {/* State chip */}
          <View style={[styles.stateChip, { backgroundColor: stateColor + '22' }]}>
            <View style={[styles.stateDot, { backgroundColor: stateColor }]} />
            <Text style={[styles.stateText, { color: stateColor }]}>
              {isOccupied ? t('pos.stateOcupada') : t('pos.stateLibre')}
            </Text>
          </View>

          {/* Assignment badge (only when relevant) */}
          {assignLabel ? (
            <View style={[styles.assignBadge, { backgroundColor: assignColor + '22' }]}>
              <Text style={[styles.assignText, { color: assignColor }]}>
                {assignLabel}
              </Text>
            </View>
          ) : null}
        </View>

        {/* ── Table label ───────────────────────────────────────────────────── */}
        <Text style={[styles.tableLabel, { color: c.textPrimary }]} numberOfLines={1}>
          {item.label}
        </Text>

        {/* ── Subtitle: floor + seats ───────────────────────────────────────── */}
        {subtitle.length > 0 ? (
          <Text style={[styles.tableSub, { color: c.textTertiary }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}

        {/* ── Party size stepper + open total ──────────────────────────────── */}
        <View style={styles.cardBottomRow}>
          {/* Party size stepper */}
          <View style={styles.partyStepper}>
            <Pressable
              onPress={() => adjustParty(item.table_id, -1)}
              style={[
                styles.stepBtn,
                { backgroundColor: c.bgBase, borderColor: c.borderSubtle },
              ]}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={`-1 ${t('pos.partyPeople', { count: 1 })}`}
            >
              <IconMinus size={11} color={c.textSecondary} strokeWidth={2.5} />
            </Pressable>

            <View style={styles.partyCount}>
              <IconUserFilled size={10} color={c.textTertiary} />
              <Text
                style={[
                  styles.partyText,
                  { color: partySize > 0 ? c.textPrimary : c.textTertiary },
                ]}
              >
                {partySize > 0 ? t('pos.partyPeople', { count: partySize }) : '0'}
              </Text>
            </View>

            <Pressable
              onPress={() => adjustParty(item.table_id, 1)}
              style={[
                styles.stepBtn,
                { backgroundColor: c.bgBase, borderColor: c.borderSubtle },
              ]}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={`+1 ${t('pos.partyPeople', { count: 1 })}`}
            >
              <IconPlus size={11} color={c.textSecondary} strokeWidth={2.5} />
            </Pressable>
          </View>

          {/* Open total (only for occupied tables with balance) */}
          {hasOpenTotal ? (
            <Text style={[styles.openTotal, { color: c.warning }]} numberOfLines={1}>
              {formatCents(item.open_total_cents)}
            </Text>
          ) : null}
        </View>

        {/* ── Cobrar button (occupied tables only) ─────────────────────────── */}
        {isOccupied ? (
          <Pressable
            onPress={() => handleCobrar(item)}
            style={({ pressed }) => [
              styles.cobrarBtn,
              { backgroundColor: c.brand },
              pressed && { opacity: 0.78 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={`${t('pos.cobrar')} ${item.label}`}
          >
            <IconCreditCard size={14} color="#fff" strokeWidth={2.2} />
            <Text style={styles.cobrarBtnText}>
              {hasOpenTotal
                ? `${t('pos.cobrar')} ${formatCents(item.open_total_cents)}`
                : t('pos.cobrar')}
            </Text>
          </Pressable>
        ) : null}
      </Pressable>
    );
  };

  // ── Render ───────────────────────────────────────────────────────────────────
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
            {/* Libre chip */}
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

            {/* Ocupada chip */}
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

  // ── Table label + subtitle ───────────────────────────────────────────────────
  tableLabel: { fontSize: 20, fontWeight: '700', letterSpacing: -0.3 },
  tableSub: { fontSize: 12, marginTop: -4 },

  // ── Party size stepper + open total ─────────────────────────────────────────
  cardBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  partyStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stepBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  partyCount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    minWidth: 46,
  },
  partyText: { fontSize: 12, fontWeight: '600' },
  openTotal: { fontSize: 13, fontWeight: '700' },

  // ── Cobrar button ────────────────────────────────────────────────────────────
  cobrarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 7,
    borderRadius: 10,
  },
  cobrarBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
});
