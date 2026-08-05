/**
 * JChat 3.0 — POS Home Screen (table grid)
 *
 * Reached after a successful PIN verification from WorkModeScreen.
 * Loads the active tables for the business and shows them in a 2-column grid.
 * Tapping a table navigates to PosOrderScreen.
 */

import React, { useCallback, useEffect, useState } from 'react';
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
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { IconChevronLeft, IconLayoutGrid } from '@tabler/icons-react-native';

import { palette } from '../../theme/tokens';
import { useThemeColors } from '../../theme/colors';
import { posTables, type PosTableRow } from '../../services/pos';
import type { PosStackParamList } from '../../navigation/PosNavigator';

type PosHomeNav = NativeStackNavigationProp<PosStackParamList, 'PosHome'>;
type PosHomeRoute = RouteProp<PosStackParamList, 'PosHome'>;

export default function PosHomeScreen() {
  const c = useThemeColors();
  const { t } = useTranslation('settings');
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<PosHomeNav>();
  const route = useRoute<PosHomeRoute>();
  const { businessId, businessName } = route.params;

  const [tables, setTables] = useState<PosTableRow[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Load tables on mount ───────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;
    posTables(businessId)
      .then((rows) => {
        if (mounted) setTables(rows);
      })
      .catch(() => {
        // Stay empty on error; user can retry by navigating away and back.
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [businessId]);

  // ── Navigate to order screen ───────────────────────────────────────────────
  const handleTablePress = useCallback(
    (table: PosTableRow) => {
      navigation.navigate('PosOrder', {
        businessId,
        businessName,
        tableId: table.id,
        tableLabel: table.label,
      });
    },
    [navigation, businessId, businessName],
  );

  // ── Render helpers ─────────────────────────────────────────────────────────

  const renderTableSubtitle = (table: PosTableRow): string => {
    const hasFl = !!table.floor;
    const hasSe = typeof table.seats === 'number';
    if (hasFl && hasSe) {
      return t('pos.tableFloorSeats', { floor: table.floor, count: table.seats });
    }
    if (hasFl) return t('pos.tableFloor', { floor: table.floor });
    if (hasSe) return t('pos.tableSeats', { count: table.seats });
    return '';
  };

  const renderTable = ({ item }: { item: PosTableRow }) => {
    const subtitle = renderTableSubtitle(item);
    return (
      <Pressable
        onPress={() => handleTablePress(item)}
        style={({ pressed }) => [
          styles.tableCard,
          { backgroundColor: c.bgSurface, borderColor: c.borderSubtle },
          pressed && { opacity: 0.72 },
        ]}
        accessibilityRole="button"
        accessibilityLabel={item.label}
      >
        <Text style={[styles.tableLabel, { color: c.textPrimary }]}>
          {item.label}
        </Text>
        {subtitle ? (
          <Text style={[styles.tableSub, { color: c.textTertiary }]}>{subtitle}</Text>
        ) : null}
      </Pressable>
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
          keyExtractor={(t) => t.id}
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

  backButton: {
    marginRight: 8,
    padding: 4,
  },

  headerTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: '600',
  },

  // ── Loading / empty ─────────────────────────────────────────────────────────
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 32,
  },

  loadingText: {
    fontSize: 14,
    marginTop: 8,
  },

  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },

  emptySub: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },

  // ── Grid ───────────────────────────────────────────────────────────────────
  grid: {
    paddingTop: 16,
    paddingHorizontal: H_PAD,
    gap: 12,
  },

  gridRow: {
    gap: 12,
  },

  tableCard: {
    flex: 1,
    minHeight: 88,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },

  tableLabel: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.3,
  },

  tableSub: {
    fontSize: 12,
    marginTop: 4,
  },
});
