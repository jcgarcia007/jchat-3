/**
 * JChat 3.0 — POS Table Hub (C7)
 *
 * Central command screen for a single table. Opened when the employee taps a
 * table card in PosHomeScreen. Shows:
 *
 *   • Party-size stepper (calls posSetPartySize, optimistic)
 *   • Circular table diagram with N seat buttons around the table
 *     – Tap seat → PosOrderScreen in draft mode for that seat
 *     – Tap center → PosOrderScreen in draft mode (no seat / whole-table)
 *     – Seat buttons highlight when they have draft items
 *   • Summary list grouped by seat:
 *     – "Sent" items (read-only, from posTableItems)
 *     – "Draft" items (editable: +/– qty + trash, from PosDraftContext)
 *   • Footer totals (sent tab + pending draft)
 *   • Three action buttons:
 *     – "Send to Kitchen" — active when draft exists
 *     – "Split Bill"      — always disabled (Stage 3 future)
 *     – "Charge"          — active when sent items exist → PosCheckout
 *
 * Data refresh: useFocusEffect reloads posTablesOverview + posTableItems every
 * time the screen gains focus (covers the return from PosOrderScreen).
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
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
  IconMinus,
  IconPlus,
  IconTrash,
  IconUsers,
} from '@tabler/icons-react-native';

import { palette } from '../../theme/tokens';
import { useThemeColors } from '../../theme/colors';
import {
  posTablesOverview,
  posTableItems,
  posSetPartySize,
  posCreateOrder,
} from '../../services/pos';
import type {
  PosTablesOverviewRow,
  PosTableItemRow,
  PosOrderItem,
} from '../../services/pos';
import { usePosDraft } from '../../contexts/PosDraftContext';
import type { DraftItem } from '../../contexts/PosDraftContext';
import type { PosStackParamList } from '../../navigation/PosNavigator';

// ─── Navigation types ─────────────────────────────────────────────────────────

type HubNav = NativeStackNavigationProp<PosStackParamList, 'PosTableHub'>;
type HubRoute = RouteProp<PosStackParamList, 'PosTableHub'>;

// ─── Diagram constants ────────────────────────────────────────────────────────

/** Width of the diagram canvas (pt). */
const CANVAS_W = 280;
/** Height of the diagram canvas (pt). */
const CANVAS_H = 220;
/** Center X of the canvas. */
const CX = CANVAS_W / 2;   // 140
/** Center Y of the canvas. */
const CY = CANVAS_H / 2;   // 110
/** Horizontal ellipse radius for seat placement. */
const RX = 108;
/** Vertical ellipse radius for seat placement. */
const RY = 78;
/** Diameter of each seat button. */
const SEAT_SIZE = 44;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Compute absolute (left, top) position for seat i out of N, arranged on an
 * ellipse starting from the top and going clockwise.
 */
function seatPosition(i: number, total: number): { left: number; top: number } {
  const angle = (i / total) * 2 * Math.PI - Math.PI / 2;
  return {
    left: CX + RX * Math.cos(angle) - SEAT_SIZE / 2,
    top: CY + RY * Math.sin(angle) - SEAT_SIZE / 2,
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/** One row for a sent (read-only) item in the summary. */
function SentRow({ item }: { item: PosTableItemRow }) {
  const c = useThemeColors();
  const { t } = useTranslation('settings');
  return (
    <View style={styles.summaryRow}>
      <Text style={[styles.rowName, { color: c.textSecondary }]} numberOfLines={1}>
        {item.qty}× {item.item_name}
      </Text>
      <View style={[styles.sentBadge, { backgroundColor: c.success + '22' }]}>
        <Text style={[styles.sentBadgeText, { color: c.success }]}>
          {t('pos.hubSentBadge')}
        </Text>
      </View>
      <Text style={[styles.rowPrice, { color: c.textTertiary }]}>
        {formatPrice(item.price_cents * item.qty)}
      </Text>
    </View>
  );
}

/** One row for a draft (editable) item in the summary. */
function DraftRow({
  item,
  onIncrease,
  onDecrease,
  onRemove,
}: {
  item: DraftItem;
  onIncrease: (item: DraftItem) => void;
  onDecrease: (item: DraftItem) => void;
  onRemove: (item: DraftItem) => void;
}) {
  const c = useThemeColors();
  const priceCents = (item.basePriceCents + item.modifierExtraCents) * item.qty;
  return (
    <View style={styles.summaryRow}>
      <Text style={[styles.rowName, { color: c.textPrimary }]} numberOfLines={1}>
        {item.qty}× {item.name}
      </Text>
      <View style={styles.draftControls}>
        <Pressable
          onPress={() => onDecrease(item)}
          style={[styles.draftBtn, { backgroundColor: c.bgSurface, borderColor: c.borderSubtle }]}
          accessibilityRole="button"
        >
          <IconMinus size={12} color={c.textSecondary} strokeWidth={2} />
        </Pressable>
        <Pressable
          onPress={() => onIncrease(item)}
          style={[styles.draftBtn, { backgroundColor: c.bgSurface, borderColor: c.borderSubtle }]}
          accessibilityRole="button"
        >
          <IconPlus size={12} color={c.textSecondary} strokeWidth={2} />
        </Pressable>
        <Pressable
          onPress={() => onRemove(item)}
          style={[styles.draftBtn, { backgroundColor: c.bgSurface, borderColor: c.borderSubtle }]}
          accessibilityRole="button"
        >
          <IconTrash size={12} color={c.danger} strokeWidth={2} />
        </Pressable>
      </View>
      <Text style={[styles.rowPrice, { color: c.textTertiary }]}>
        {formatPrice(priceCents)}
      </Text>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function PosTableHub(): React.ReactElement {
  const c = useThemeColors();
  const { t } = useTranslation('settings');
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<HubNav>();
  const route = useRoute<HubRoute>();
  const { businessId, businessName, tableId, tableLabel, plan } = route.params;

  // ── Draft context ───────────────────────────────────────────────────────────
  const { getTableDraft, getSeatDraft, setSeatDraft, clearTableDraft } = usePosDraft();

  // ── Remote state ────────────────────────────────────────────────────────────
  const [tableData, setTableData] = useState<PosTablesOverviewRow | null>(null);
  const [sentItems, setSentItems] = useState<PosTableItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // ── Party size (local, synced to server optimistically) ─────────────────────
  const [partySize, setPartySize] = useState<number>(1);
  const maxSeats = tableData?.seats ?? 12;

  // ── Draft items (live from context — re-computed on every render) ───────────
  const tableDraft = getTableDraft(tableId);

  // ── Focus refresh ───────────────────────────────────────────────────────────
  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      setLoading(true);

      Promise.all([
        posTablesOverview(businessId),
        posTableItems(businessId, tableId),
      ])
        .then(([overviewRows, itemRows]) => {
          if (!mounted) return;
          const row = overviewRows.find((r) => r.table_id === tableId) ?? null;
          setTableData(row);
          if (row) setPartySize(row.party_size ?? 1);
          setSentItems(itemRows);
        })
        .catch(() => {})
        .finally(() => {
          if (mounted) setLoading(false);
        });

      return () => {
        mounted = false;
      };
    }, [businessId, tableId]),
  );

  // ── Derived ─────────────────────────────────────────────────────────────────
  const hasDraft = tableDraft.length > 0;
  const hasSent = sentItems.length > 0;

  const sentTotal = useMemo(
    () => sentItems.reduce((sum, i) => sum + i.price_cents * i.qty, 0),
    [sentItems],
  );
  const draftTotal = useMemo(
    () =>
      tableDraft.reduce(
        (sum, d) => sum + (d.basePriceCents + d.modifierExtraCents) * d.qty,
        0,
      ),
    [tableDraft],
  );

  /** Unique seat keys that have at least one item (sent or draft). */
  const seatGroups = useMemo(() => {
    const keys = new Set<string>();
    sentItems.forEach((i) =>
      keys.add(i.seat === null ? 'table' : String(i.seat)),
    );
    tableDraft.forEach((d) =>
      keys.add(d.seat === null ? 'table' : String(d.seat)),
    );
    return [...keys].sort((a, b) => {
      if (a === 'table') return -1;
      if (b === 'table') return 1;
      return Number(a) - Number(b);
    });
  }, [sentItems, tableDraft]);

  // ── Seat diagram positions ───────────────────────────────────────────────────
  const seatPositions = useMemo(
    () =>
      Array.from({ length: partySize }, (_, i) => ({
        seat: i + 1,
        ...seatPosition(i, partySize),
      })),
    [partySize],
  );

  /** Returns true if there are draft items for the given seat (or null=table). */
  const seatHasDraft = useCallback(
    (seat: number | null): boolean =>
      getSeatDraft(tableId, seat).length > 0,
    [tableId, getSeatDraft],
  );

  // ── Navigation ───────────────────────────────────────────────────────────────
  const handleSeatPress = useCallback(
    (seat: number | null) => {
      navigation.navigate('PosOrder', {
        businessId,
        businessName,
        tableId,
        tableLabel,
        plan,
        seat,
        mode: 'draft',
      });
    },
    [navigation, businessId, businessName, tableId, tableLabel, plan],
  );

  // ── Party-size stepper ────────────────────────────────────────────────────
  const handleAdjustParty = useCallback(
    async (delta: number) => {
      const next = Math.max(1, Math.min(partySize + delta, maxSeats));
      if (next === partySize) return;
      const prev = partySize;
      setPartySize(next); // optimistic
      try {
        await posSetPartySize(businessId, tableId, next);
      } catch {
        setPartySize(prev); // revert on error
      }
    },
    [partySize, maxSeats, businessId, tableId],
  );

  // ── Draft item controls ───────────────────────────────────────────────────
  const handleIncrease = useCallback(
    (item: DraftItem) => {
      const seatItems = getSeatDraft(tableId, item.seat);
      setSeatDraft(
        tableId,
        item.seat,
        seatItems.map((d) =>
          d.cartKey === item.cartKey ? { ...d, qty: d.qty + 1 } : d,
        ),
      );
    },
    [tableId, getSeatDraft, setSeatDraft],
  );

  const handleDecrease = useCallback(
    (item: DraftItem) => {
      const seatItems = getSeatDraft(tableId, item.seat);
      setSeatDraft(
        tableId,
        item.seat,
        seatItems
          .map((d) =>
            d.cartKey === item.cartKey ? { ...d, qty: d.qty - 1 } : d,
          )
          .filter((d) => d.qty > 0),
      );
    },
    [tableId, getSeatDraft, setSeatDraft],
  );

  const handleRemove = useCallback(
    (item: DraftItem) => {
      const seatItems = getSeatDraft(tableId, item.seat);
      setSeatDraft(
        tableId,
        item.seat,
        seatItems.filter((d) => d.cartKey !== item.cartKey),
      );
    },
    [tableId, getSeatDraft, setSeatDraft],
  );

  // ── Send to kitchen ───────────────────────────────────────────────────────
  const handleSendToKitchen = useCallback(async () => {
    if (!hasDraft || submitting) return;
    setSubmitting(true);

    const posItems: PosOrderItem[] = tableDraft.map((d) => ({
      menu_item_id: d.menuItemId,
      qty: d.qty,
      seat: d.seat,
      ...(d.note.trim() ? { special_instructions: d.note.trim() } : {}),
      ...(d.modifiers.length > 0
        ? { options: { modifiers: d.modifiers } }
        : {}),
    }));

    const result = await posCreateOrder(businessId, tableId, posItems);
    setSubmitting(false);

    if (result.ok) {
      clearTableDraft(tableId);
      // Refresh sent items from server
      posTableItems(businessId, tableId)
        .then((rows) => setSentItems(rows))
        .catch(() => {});
      Alert.alert(t('pos.hubKitchenSent'), t('pos.hubKitchenSentMsg'), [
        { text: t('pos.submitOk') },
      ]);
      return;
    }

    // Error mapping
    const errorMap: Record<string, string> = {
      table_not_in_business: t('pos.errorTableNotInBusiness'),
      item_not_available: t('pos.errorItemNotAvailable'),
      no_valid_items: t('pos.errorNoValidItems'),
      no_access: t('pos.errorNoAccess'),
      not_configured: t('pos.errorNotConfigured'),
      invalid_modifier: t('pos.errorModifier'),
      db_error: t('pos.errorDb'),
    };
    Alert.alert(
      t('pos.errorTitle'),
      errorMap[result.reason] ?? t('pos.errorDb'),
    );
  }, [
    hasDraft,
    submitting,
    tableDraft,
    businessId,
    tableId,
    posCreateOrder,
    clearTableDraft,
    t,
  ]);

  // ── Cobrar ────────────────────────────────────────────────────────────────
  const handleCobrar = useCallback(() => {
    navigation.navigate('PosCheckout', { businessId, tableId, tableLabel });
  }, [navigation, businessId, tableId, tableLabel]);

  // ── State info for header ──────────────────────────────────────────────────
  const isOccupied = tableData?.state === 'ocupada';
  const stateColor = isOccupied ? c.warning : c.success;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.screen, { backgroundColor: c.bgBase }]}>
      <StatusBar
        barStyle={c.bgBase === palette.bgBase ? 'light-content' : 'dark-content'}
      />

      {/* ── Header ──────────────────────────────────────────────────────────── */}
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
        <View style={styles.headerTitleBlock}>
          <Text style={[styles.headerTitle, { color: c.textPrimary }]} numberOfLines={1}>
            {businessName}
          </Text>
          <View style={styles.headerSubRow}>
            <Text style={[styles.headerSub, { color: c.textSecondary }]}>
              {tableLabel}
            </Text>
            {tableData && (
              <View
                style={[
                  styles.stateChip,
                  { backgroundColor: stateColor + '22' },
                ]}
              >
                <View
                  style={[styles.stateDot, { backgroundColor: stateColor }]}
                />
                <Text style={[styles.stateText, { color: stateColor }]}>
                  {isOccupied ? t('pos.stateOcupada') : t('pos.stateLibre')}
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={c.brand} />
        </View>
      ) : (
        <ScrollView
          style={styles.body}
          contentContainerStyle={[
            styles.bodyContent,
            { paddingBottom: insets.bottom + 180 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Party stepper ──────────────────────────────────────────────── */}
          <View style={[styles.partyRow, { backgroundColor: c.bgSurface, borderColor: c.borderSubtle }]}>
            <IconUsers size={16} color={c.textSecondary} strokeWidth={1.5} />
            <Text style={[styles.partyLabel, { color: c.textSecondary }]}>
              {t('pos.partyPeople', { count: partySize })}
            </Text>
            <View style={styles.partyStepper}>
              <Pressable
                onPress={() => void handleAdjustParty(-1)}
                disabled={partySize <= 1}
                style={[
                  styles.stepBtn,
                  { backgroundColor: c.bgBase, borderColor: c.borderSubtle },
                ]}
                accessibilityRole="button"
              >
                <IconMinus
                  size={13}
                  color={partySize > 1 ? c.textSecondary : c.textTertiary}
                  strokeWidth={2}
                />
              </Pressable>
              <Text style={[styles.stepCount, { color: c.textPrimary }]}>
                {partySize}
              </Text>
              <Pressable
                onPress={() => void handleAdjustParty(1)}
                disabled={partySize >= maxSeats}
                style={[
                  styles.stepBtn,
                  { backgroundColor: c.bgBase, borderColor: c.borderSubtle },
                ]}
                accessibilityRole="button"
              >
                <IconPlus
                  size={13}
                  color={partySize < maxSeats ? c.textSecondary : c.textTertiary}
                  strokeWidth={2}
                />
              </Pressable>
            </View>
          </View>

          {/* ── Table diagram ──────────────────────────────────────────────── */}
          <View style={styles.diagramOuter}>
            <View style={styles.diagramCanvas}>
              {/* Center table rectangle */}
              <Pressable
                onPress={() => handleSeatPress(null)}
                style={({ pressed }) => [
                  styles.tableRect,
                  {
                    backgroundColor: seatHasDraft(null)
                      ? c.brand
                      : c.bgSurface,
                    borderColor: seatHasDraft(null) ? c.brand : c.borderSubtle,
                  },
                  pressed && { opacity: 0.8 },
                ]}
                accessibilityRole="button"
                accessibilityLabel={t('pos.hubTableCenter')}
              >
                <Text
                  style={[
                    styles.tableRectLabel,
                    {
                      color: seatHasDraft(null) ? '#fff' : c.textTertiary,
                    },
                  ]}
                >
                  {t('pos.hubTableCenter')}
                </Text>
              </Pressable>

              {/* Seat buttons */}
              {seatPositions.map(({ seat, left, top }) => {
                const hasDraftForSeat = seatHasDraft(seat);
                return (
                  <Pressable
                    key={seat}
                    onPress={() => handleSeatPress(seat)}
                    style={({ pressed }) => [
                      styles.seatBtn,
                      {
                        left,
                        top,
                        backgroundColor: hasDraftForSeat ? c.brand : c.bgSurface,
                        borderColor: hasDraftForSeat ? c.brand : c.borderSubtle,
                      },
                      pressed && { opacity: 0.8 },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={t('pos.hubSeatLabel', { n: seat })}
                  >
                    <Text
                      style={[
                        styles.seatNumber,
                        {
                          color: hasDraftForSeat ? '#fff' : c.textPrimary,
                        },
                      ]}
                    >
                      {seat}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* ── Summary ────────────────────────────────────────────────────── */}
          {seatGroups.length === 0 ? (
            <View style={styles.emptyHint}>
              <Text style={[styles.emptyHintText, { color: c.textTertiary }]}>
                {t('pos.hubNoItems')}
              </Text>
            </View>
          ) : (
            <View style={[styles.summaryCard, { backgroundColor: c.bgSurface, borderColor: c.borderSubtle }]}>
              {seatGroups.map((key, idx) => {
                const seat = key === 'table' ? null : Number(key);
                const seatSent = sentItems.filter((i) => i.seat === seat);
                const seatDraft = tableDraft.filter((d) => d.seat === seat);
                const seatLabel =
                  seat === null
                    ? t('pos.hubTableCenter')
                    : t('pos.hubSeatLabel', { n: seat });

                return (
                  <View key={key}>
                    {idx > 0 && (
                      <View
                        style={[
                          styles.sectionDivider,
                          { backgroundColor: c.borderSubtle },
                        ]}
                      />
                    )}
                    <View style={styles.seatSection}>
                      {/* Seat header */}
                      <Text
                        style={[
                          styles.seatSectionTitle,
                          { color: c.textPrimary },
                        ]}
                      >
                        {seatLabel}
                      </Text>

                      {/* Sent items */}
                      {seatSent.map((item) => (
                        <SentRow key={item.order_item_id} item={item} />
                      ))}

                      {/* Draft items */}
                      {seatDraft.map((item) => (
                        <DraftRow
                          key={item.cartKey}
                          item={item}
                          onIncrease={handleIncrease}
                          onDecrease={handleDecrease}
                          onRemove={handleRemove}
                        />
                      ))}
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* ── Totals ─────────────────────────────────────────────────────── */}
          {(hasSent || hasDraft) && (
            <View style={[styles.totalsRow, { borderTopColor: c.borderSubtle }]}>
              {hasSent && (
                <Text style={[styles.totalItem, { color: c.textSecondary }]}>
                  {t('pos.openTab')}{' '}
                  <Text style={{ color: c.textPrimary, fontWeight: '600' }}>
                    {formatPrice(sentTotal)}
                  </Text>
                </Text>
              )}
              {hasDraft && (
                <Text style={[styles.totalItem, { color: c.warning }]}>
                  {/* "Por enviar" label reused from cartSubtotal context */}
                  {t('pos.cartSubtotal')}{' '}
                  <Text style={{ fontWeight: '600' }}>
                    {formatPrice(draftTotal)}
                  </Text>
                </Text>
              )}
            </View>
          )}
        </ScrollView>
      )}

      {/* ── Fixed action bar ──────────────────────────────────────────────────── */}
      <View
        style={[
          styles.actionBar,
          {
            backgroundColor: c.bgSurface,
            borderTopColor: c.borderSubtle,
            paddingBottom: insets.bottom + 8,
          },
        ]}
      >
        {/* Send to Kitchen */}
        <Pressable
          onPress={() => void handleSendToKitchen()}
          disabled={!hasDraft || submitting}
          style={({ pressed }) => [
            styles.actionBtn,
            {
              backgroundColor:
                hasDraft && !submitting ? c.brand : c.borderSubtle,
            },
            pressed && hasDraft && { opacity: 0.8 },
          ]}
          accessibilityRole="button"
          accessibilityState={{ disabled: !hasDraft || submitting }}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text
              style={[
                styles.actionBtnText,
                { color: hasDraft && !submitting ? '#fff' : c.textTertiary },
              ]}
            >
              {t('pos.submitButton')}
            </Text>
          )}
        </Pressable>

        {/* Split Bill — disabled (Stage 3 future) */}
        <Pressable
          disabled
          style={[styles.actionBtn, { backgroundColor: c.borderSubtle }]}
          accessibilityRole="button"
          accessibilityState={{ disabled: true }}
        >
          <Text style={[styles.actionBtnText, { color: c.textTertiary }]}>
            {t('pos.hubSplitBill')}
          </Text>
        </Pressable>

        {/* Charge */}
        <Pressable
          onPress={hasSent ? handleCobrar : undefined}
          disabled={!hasSent}
          style={({ pressed }) => [
            styles.actionBtn,
            { backgroundColor: hasSent ? c.gold : c.borderSubtle },
            pressed && hasSent && { opacity: 0.8 },
          ]}
          accessibilityRole="button"
          accessibilityState={{ disabled: !hasSent }}
        >
          <Text
            style={[
              styles.actionBtnText,
              { color: hasSent ? '#fff' : c.textTertiary },
            ]}
          >
            {t('pos.cobrar')}
          </Text>
        </Pressable>
      </View>
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
    alignItems: 'flex-start',
    paddingHorizontal: H_PAD,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: { marginRight: 8, padding: 4, marginTop: 2 },
  headerTitleBlock: { flex: 1 },
  headerTitle: { fontSize: 18, fontWeight: '600' },
  headerSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  headerSub: { fontSize: 13 },
  stateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  stateDot: { width: 6, height: 6, borderRadius: 3 },
  stateText: { fontSize: 11, fontWeight: '600' },

  // ── Body ────────────────────────────────────────────────────────────────────
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1 },
  bodyContent: { paddingTop: 16, paddingHorizontal: H_PAD, gap: 16 },

  // ── Party stepper ────────────────────────────────────────────────────────────
  partyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  partyLabel: { flex: 1, fontSize: 14 },
  partyStepper: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stepBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepCount: { fontSize: 15, fontWeight: '600', minWidth: 24, textAlign: 'center' },

  // ── Diagram ──────────────────────────────────────────────────────────────────
  diagramOuter: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  diagramCanvas: {
    width: CANVAS_W,
    height: CANVAS_H,
    position: 'relative',
  },

  // Center table rectangle (absolute within canvas)
  tableRect: {
    position: 'absolute',
    width: 110,
    height: 70,
    left: CX - 55,
    top: CY - 35,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tableRectLabel: { fontSize: 13, fontWeight: '600' },

  // Seat circle (absolute within canvas)
  seatBtn: {
    position: 'absolute',
    width: SEAT_SIZE,
    height: SEAT_SIZE,
    borderRadius: SEAT_SIZE / 2,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seatNumber: { fontSize: 14, fontWeight: '700' },

  // ── Summary ──────────────────────────────────────────────────────────────────
  emptyHint: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  emptyHintText: { fontSize: 13, textAlign: 'center', lineHeight: 18 },

  summaryCard: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },

  sectionDivider: { height: StyleSheet.hairlineWidth },

  seatSection: { paddingHorizontal: 14, paddingVertical: 12 },

  seatSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },

  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  rowName: { flex: 1, fontSize: 13 },
  rowPrice: { fontSize: 13, minWidth: 50, textAlign: 'right' },

  sentBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  sentBadgeText: { fontSize: 10, fontWeight: '700' },

  draftControls: { flexDirection: 'row', gap: 4 },
  draftBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Totals ────────────────────────────────────────────────────────────────
  totalsRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
    gap: 4,
  },
  totalItem: { fontSize: 14 },

  // ── Action bar ────────────────────────────────────────────────────────────
  actionBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: H_PAD,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  actionBtn: {
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnText: { fontSize: 15, fontWeight: '600' },
});
