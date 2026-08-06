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
  IconLayoutGrid,
} from '@tabler/icons-react-native';

import { palette } from '../../theme/tokens';
import { useThemeColors } from '../../theme/colors';
import {
  posTablesOverview,
  type PosTablesOverviewRow,
} from '../../services/pos';
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

  // ── Reload on every focus ─────────────────────────────────────────────────
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

  // ── Legend counts ─────────────────────────────────────────────────────────
  const freeCount = tables.filter((row) => row.state === 'libre').length;
  const occupiedCount = tables.length - freeCount;

  // ── Navigation ────────────────────────────────────────────────────────────
  const handleTablePress = useCallback(
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

  // ── Table card ────────────────────────────────────────────────────────────
  const renderTable = ({ item }: { item: PosTablesOverviewRow }) => {
    const isOccupied = item.state === 'ocupada';
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
      // unassigned + occupied — flag so staff can claim it
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
});
