/**
 * JChat 3.0 — POS Receipts Screen (Fase 4B)
 *
 * Shows today's succeeded payments for the active business.
 * ─ Employee: only their own payments (paid_by = auth.uid()), via pos_receipts_today RPC.
 * ─ Owner: all payments for the day.
 * "Today" = anchored to America/New_York on the server.
 *
 * Each row: hour · table · amount · tip · Reprint button (if printer configured).
 * Reprint reuses the Fase 4A flow: get_public_receipt → buildReceiptEscPos → printToNetwork.
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
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { IconChevronLeft, IconPrinter, IconReceipt } from '@tabler/icons-react-native';

import { palette } from '../../theme/tokens';
import { useThemeColors } from '../../theme/colors';
import { supabase } from '../../services/supabase';
import { posReceiptsToday, type PosReceiptRow } from '../../services/pos';
import {
  fetchAnyPrinter,
  printToNetwork,
  type NetworkPrinter,
} from '../../services/printer';
import {
  buildReceiptEscPos,
  type PublicReceipt,
} from '../../services/escpos';
import type { PosStackParamList } from '../../navigation/PosNavigator';

// ─── Types ────────────────────────────────────────────────────────────────────

type PosReceiptsNav   = NativeStackNavigationProp<PosStackParamList, 'PosReceipts'>;
type PosReceiptsRoute = RouteProp<PosStackParamList, 'PosReceipts'>;

type PrintState = 'idle' | 'printing' | 'done' | 'error';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

// ─── Row component ────────────────────────────────────────────────────────────

interface RowProps {
  row: PosReceiptRow;
  printer: NetworkPrinter | 'none' | null;
  colors: ReturnType<typeof useThemeColors>;
  t: ReturnType<typeof useTranslation>['t'];
}

function ReceiptRowItem({ row, printer, colors, t }: RowProps) {
  const [printState, setPrintState] = useState<PrintState>('idle');

  const handleReprint = useCallback(async () => {
    if (!row.receipt_code) return;
    if (!printer || printer === 'none') return;
    if (printState === 'printing') return;

    setPrintState('printing');
    try {
      const { data, error } = await supabase.rpc('get_public_receipt', {
        p_code: row.receipt_code,
      });
      if (error || !data) throw new Error('receipt not found');
      const bytes = buildReceiptEscPos(
        data as PublicReceipt,
        row.receipt_code,
        printer.width_mm,
      );
      await printToNetwork(printer.host, printer.port, bytes);
      setPrintState('done');
      setTimeout(() => setPrintState('idle'), 3000);
    } catch {
      setPrintState('error');
      setTimeout(() => setPrintState('idle'), 4000);
    }
  }, [row.receipt_code, printer, printState]);

  const canReprint = !!row.receipt_code && !!printer && printer !== 'none';
  const printBtnColor =
    printState === 'done'  ? colors.success :
    printState === 'error' ? colors.danger  :
    colors.brand;

  return (
    <View style={[styles.row, { borderBottomColor: colors.borderSubtle }]}>
      {/* Left: time + table */}
      <View style={styles.rowLeft}>
        <Text style={[styles.rowTime, { color: colors.textSecondary }]}>
          {formatTime(row.created_at)}
        </Text>
        <Text style={[styles.rowTable, { color: colors.textPrimary }]} numberOfLines={1}>
          {row.table_label ?? '—'}
        </Text>
      </View>

      {/* Center: amount + tip */}
      <View style={styles.rowCenter}>
        <Text style={[styles.rowAmount, { color: colors.textPrimary }]}>
          {formatCents(row.amount_cents)}
        </Text>
        {row.tip_cents > 0 && (
          <Text style={[styles.rowTip, { color: colors.textSecondary }]}>
            +{formatCents(row.tip_cents)} tip
          </Text>
        )}
      </View>

      {/* Right: reprint button */}
      <Pressable
        style={[
          styles.reprintBtn,
          { borderColor: canReprint ? printBtnColor : colors.borderSubtle },
          !canReprint && styles.reprintBtnDisabled,
        ]}
        onPress={handleReprint}
        disabled={!canReprint || printState === 'printing'}
        accessibilityLabel={t('settings:pos.receiptsReprint')}
      >
        {printState === 'printing' ? (
          <ActivityIndicator size="small" color={printBtnColor} />
        ) : (
          <IconPrinter size={16} color={canReprint ? printBtnColor : colors.textSecondary} />
        )}
      </Pressable>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function PosReceiptsScreen(): React.ReactElement {
  const { t } = useTranslation('settings');
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<PosReceiptsNav>();
  const { params } = useRoute<PosReceiptsRoute>();
  const { businessId } = params;

  const [rows, setRows]       = useState<PosReceiptRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errKey, setErrKey]   = useState<string | null>(null);
  const [printer, setPrinter] = useState<NetworkPrinter | 'none' | null>(null);

  // Load receipts on every focus (new payments may have come in).
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      async function load() {
        setLoading(true);
        setErrKey(null);

        const [printerResult, receiptsResult] = await Promise.all([
          fetchAnyPrinter(businessId).catch(() => null),
          posReceiptsToday(businessId),
        ]);

        if (cancelled) return;
        setPrinter(printerResult ?? 'none');

        if (!receiptsResult.ok) {
          setErrKey(
            receiptsResult.reason === 'no_access'
              ? 'settings:pos.receiptsErrNoAccess'
              : 'settings:pos.receiptsErrDb',
          );
          setRows([]);
        } else {
          setRows(receiptsResult.rows);
        }
        setLoading(false);
      }

      load();
      return () => { cancelled = true; };
    }, [businessId]),
  );

  const renderRow = useCallback(
    ({ item }: { item: PosReceiptRow }) => (
      <ReceiptRowItem row={item} printer={printer} colors={colors} t={t} />
    ),
    [printer, colors, t],
  );

  const isDark = colors.bgBase === palette.bgBase;

  return (
    <View style={[styles.root, { backgroundColor: colors.bgBase }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Header */}
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + 8, borderBottomColor: colors.borderSubtle },
        ]}
      >
        <Pressable
          style={styles.backBtn}
          onPress={() => navigation.canGoBack() && navigation.goBack()}
          hitSlop={12}
          accessibilityLabel="Regresar"
        >
          <IconChevronLeft size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
          {t('settings:pos.receiptsTitle')}
        </Text>
        <View style={styles.backBtn} /* spacer */ />
      </View>

      {/* Body */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.brand} size="large" />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            {t('settings:pos.receiptsLoading')}
          </Text>
        </View>
      ) : errKey ? (
        <View style={styles.centered}>
          <IconReceipt size={40} color={colors.textSecondary} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            {t(errKey)}
          </Text>
        </View>
      ) : rows.length === 0 ? (
        <View style={styles.centered}>
          <IconReceipt size={40} color={colors.textTertiary} />
          <Text style={[styles.emptyText, { color: colors.textPrimary }]}>
            {t('settings:pos.receiptsEmpty')}
          </Text>
          <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
            {t('settings:pos.receiptsEmptySub')}
          </Text>
        </View>
      ) : (
        <>
          {/* Column headers */}
          <View style={[styles.colHeader, { borderBottomColor: colors.borderSubtle }]}>
            <Text style={[styles.colLeft,   { color: colors.textSecondary }]}>
              {t('settings:pos.receiptsTime')}
            </Text>
            <Text style={[styles.colCenter, { color: colors.textSecondary }]}>
              {t('settings:pos.receiptsAmount')}
            </Text>
            <Text style={[styles.colRight,  { color: colors.textSecondary }]}>
              {t('settings:pos.receiptsReprint')}
            </Text>
          </View>
          <FlatList
            data={rows}
            keyExtractor={(r) => r.id}
            renderItem={renderRow}
            contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
          />
        </>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:     { flex: 1 },
  header: {
    flexDirection:    'row',
    alignItems:       'center',
    justifyContent:   'space-between',
    paddingHorizontal: 16,
    paddingBottom:    12,
    borderBottomWidth: 1,
  },
  backBtn:     { width: 32, alignItems: 'flex-start' },
  headerTitle: { fontSize: 17, fontWeight: '600', flex: 1, textAlign: 'center' },
  centered: {
    flex: 1,
    alignItems:     'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 32,
  },
  loadingText: { fontSize: 14, marginTop: 8 },
  emptyText:   { fontSize: 16, fontWeight: '600', textAlign: 'center' },
  emptySub:    { fontSize: 14, textAlign: 'center' },
  colHeader: {
    flexDirection:    'row',
    alignItems:       'center',
    paddingHorizontal: 16,
    paddingVertical:   8,
    borderBottomWidth: 1,
  },
  colLeft:   { flex: 1.2, fontSize: 12, fontWeight: '600' },
  colCenter: { flex: 1,   fontSize: 12, fontWeight: '600', textAlign: 'right' },
  colRight:  { width: 44, fontSize: 12, fontWeight: '600', textAlign: 'center' },
  row: {
    flexDirection:    'row',
    alignItems:       'center',
    paddingHorizontal: 16,
    paddingVertical:   12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowLeft:   { flex: 1.2, gap: 2 },
  rowTime:   { fontSize: 12 },
  rowTable:  { fontSize: 14, fontWeight: '500' },
  rowCenter: { flex: 1, alignItems: 'flex-end', gap: 2 },
  rowAmount: { fontSize: 14, fontWeight: '600' },
  rowTip:    { fontSize: 12 },
  reprintBtn: {
    width:          36,
    height:         36,
    borderRadius:   8,
    borderWidth:    1,
    alignItems:     'center',
    justifyContent: 'center',
    marginLeft:     8,
  },
  reprintBtnDisabled: { opacity: 0.4 },
});
