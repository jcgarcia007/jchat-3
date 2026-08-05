/**
 * JChat 3.0 — POS Home Screen (table grid, C2b)
 *
 * Reached after a successful PIN verification from WorkModeScreen.
 * Loads the active tables for the business and shows them in a 2-column grid.
 *
 * Per-table state (loaded in parallel after tables):
 *   • Open-order badge: shows "$X.XX cuenta abierta" when the table has unpaid orders.
 *   • "Cobrar" action: navigates to PosCheckoutScreen with the table's open orders.
 *   • "Nueva orden" action: navigates to PosOrderScreen (existing behavior).
 *
 * Data refreshes on every focus (useFocusEffect) so returning from PosCheckout
 * shows the updated badge state without a manual reload.
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
  IconPlus,
} from '@tabler/icons-react-native';

import { palette } from '../../theme/tokens';
import { useThemeColors } from '../../theme/colors';
import {
  posTables,
  posOpenOrdersSummary,
  type PosTableRow,
  type PosTableOpenSummary,
} from '../../services/pos';
import type { PosStackParamList } from '../../navigation/PosNavigator';

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

  const [tables, setTables] = useState<PosTableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [openOrders, setOpenOrders] = useState<Record<string, PosTableOpenSummary>>({});

  // ── Reload on every focus (returns from PosCheckout → badges update) ────────
  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      setLoading(true);

      Promise.all([
        posTables(businessId),
        posOpenOrdersSummary(businessId),
      ])
        .then(([rows, summary]) => {
          if (!mounted) return;
          setTables(rows);
          setOpenOrders(summary);
        })
        .catch(() => {
          // Stay with previous data on error
        })
        .finally(() => {
          if (mounted) setLoading(false);
        });

      return () => { mounted = false; };
    }, [businessId]),
  );

  // ── Navigation helpers ─────────────────────────────────────────────────────

  const handleNewOrder = useCallback(
    (table: PosTableRow) => {
      navigation.navigate('PosOrder', {
        businessId,
        businessName,
        tableId: table.id,
        tableLabel: table.label,
        plan,
      });
    },
    [navigation, businessId, businessName],
  );

  const handleCobrar = useCallback(
    (table: PosTableRow) => {
      navigation.navigate('PosCheckout', {
        businessId,
        tableId: table.id,
        tableLabel: table.label,
      });
    },
    [navigation, businessId],
  );

  // ── Render helpers ─────────────────────────────────────────────────────────

  const tableSubtitle = (table: PosTableRow): string => {
    const hasFl = !!table.floor;
    const hasSe = typeof table.seats === 'number';
    if (hasFl && hasSe) return t('pos.tableFloorSeats', { floor: table.floor, count: table.seats });
    if (hasFl) return t('pos.tableFloor', { floor: table.floor });
    if (hasSe) return t('pos.tableSeats', { count: table.seats });
    return '';
  };

  const renderTable = ({ item }: { item: PosTableRow }) => {
    const sub = tableSubtitle(item);
    const summary = openOrders[item.id];
    const hasOpenOrders = !!summary;

    return (
      <View
        style={[
          styles.tableCard,
          { backgroundColor: c.bgSurface, borderColor: c.borderSubtle },
        ]}
      >
        {/* Table info */}
        <View style={styles.cardTop}>
          <Text style={[styles.tableLabel, { color: c.textPrimary }]}>
            {item.label}
          </Text>
          {sub ? (
            <Text style={[styles.tableSub, { color: c.textTertiary }]}>{sub}</Text>
          ) : null}

          {/* Open-tab badge */}
          {hasOpenOrders ? (
            <View style={[styles.badge, { backgroundColor: c.brandLight }]}>
              <Text style={[styles.badgeText, { color: c.brand }]}>
                {t('pos.openTab')} · {formatCents(summary.totalCents)}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Action buttons */}
        <View style={[styles.cardActions, hasOpenOrders && styles.cardActionsDual]}>
          {hasOpenOrders ? (
            <Pressable
              onPress={() => handleCobrar(item)}
              style={({ pressed }) => [
                styles.actionBtn,
                styles.actionBtnPrimary,
                { backgroundColor: c.brand },
                pressed && { opacity: 0.78 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`${t('pos.cobrar')} ${item.label}`}
            >
              <IconCreditCard size={15} color="#fff" strokeWidth={2.2} />
              <Text style={styles.actionBtnPrimaryText}>{t('pos.cobrar')}</Text>
            </Pressable>
          ) : null}

          <Pressable
            onPress={() => handleNewOrder(item)}
            style={({ pressed }) => [
              styles.actionBtn,
              styles.actionBtnSecondary,
              {
                backgroundColor: c.bgBase,
                borderColor: c.borderSubtle,
                flex: hasOpenOrders ? undefined : 1,
              },
              pressed && { opacity: 0.72 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={`${t('pos.newOrder')} ${item.label}`}
          >
            <IconPlus size={15} color={c.textSecondary} strokeWidth={2.2} />
            <Text style={[styles.actionBtnSecondaryText, { color: c.textSecondary }]}>
              {t('pos.newOrder')}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.screen, { backgroundColor: c.bgBase }]}>
      <StatusBar
        barStyle={c.bgBase === palette.bgBase ? 'light-content' : 'dark-content'}
      />

      {/* Header */}
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

      {/* Body */}
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
        <FlatList
          data={tables}
          keyExtractor={(item) => item.id}
          numColumns={2}
          contentContainerStyle={[
            styles.grid,
            { paddingBottom: insets.bottom + 24 },
          ]}
          columnWrapperStyle={styles.gridRow}
          renderItem={renderTable}
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

  // ── Header ─────────────────────────────────────────────────────────────────
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

  // ── Grid ───────────────────────────────────────────────────────────────────
  grid: { paddingTop: 16, paddingHorizontal: H_PAD, gap: 12 },
  gridRow: { gap: 12 },

  // ── Table card ─────────────────────────────────────────────────────────────
  tableCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 12,
  },

  cardTop: { gap: 4 },

  tableLabel: { fontSize: 20, fontWeight: '700', letterSpacing: -0.3 },
  tableSub: { fontSize: 12 },

  // ── Open-tab badge ──────────────────────────────────────────────────────────
  badge: {
    marginTop: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  badgeText: { fontSize: 11, fontWeight: '600' },

  // ── Action buttons ──────────────────────────────────────────────────────────
  cardActions: { flexDirection: 'row', gap: 8 },
  cardActionsDual: {},

  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
  },

  actionBtnPrimary: {},
  actionBtnPrimaryText: { color: '#fff', fontSize: 13, fontWeight: '600' },

  actionBtnSecondary: { borderWidth: StyleSheet.hairlineWidth },
  actionBtnSecondaryText: { fontSize: 13, fontWeight: '500' },
});
