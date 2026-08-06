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

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
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
  IconPlugConnected,
  IconPlugOff,
  IconTrash,
  IconUsers,
} from '@tabler/icons-react-native';

import { palette } from '../../theme/tokens';
import { useThemeColors } from '../../theme/colors';
import { supabase, isSupabaseConfigured } from '../../services/supabase';
import {
  posTablesOverview,
  posTableItems,
  posSetPartySize,
  posCreateOrder,
  posVoidOrder,
  posCombineTables,
  posUncombineTable,
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

  // Effective status: item_status is fine-grained (set per item by the kitchen
  // system), but the kitchen marks the order as a whole via order_status.
  // If the item is still 'pending' but the order has been picked up, surface
  // the order-level state so the waiter sees the real kitchen progress.
  const effectiveStatus = (() => {
    if (item.item_status !== 'pending') return item.item_status;
    if (item.order_status === 'preparing') return 'preparing';
    if (item.order_status === 'ready')     return 'ready';
    return 'pending';
  })();

  // Map effective status to display label — unknown values shown as-is.
  const statusLabel = (() => {
    switch (effectiveStatus) {
      case 'pending':   return t('pos.itemStatusPending');
      case 'preparing': return t('pos.itemStatusPreparing');
      case 'ready':     return t('pos.itemStatusReady');
      default:          return effectiveStatus;
    }
  })();

  // Map effective status to color token.
  const statusColor = (() => {
    switch (effectiveStatus) {
      case 'preparing': return c.warning;
      case 'ready':     return c.success;
      default:          return c.textTertiary; // pending + unknown → neutral
    }
  })();

  return (
    <View style={styles.summaryRow}>
      <Text style={[styles.rowName, { color: c.textSecondary }]} numberOfLines={1}>
        {item.qty}× {item.item_name}
      </Text>
      <View style={[styles.sentBadge, { backgroundColor: statusColor + '22' }]}>
        <Text style={[styles.sentBadgeText, { color: statusColor }]}>
          {statusLabel}
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
  /** Full list of all tables — used for combine picker and redirect logic. */
  const [allTables, setAllTables] = useState<PosTablesOverviewRow[]>([]);
  const [sentItems, setSentItems] = useState<PosTableItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  /** order_id currently being voided — null when idle. Prevents double-tap. */
  const [voidingOrderId, setVoidingOrderId] = useState<string | null>(null);

  // ── Combine state ───────────────────────────────────────────────────────────
  const [showCombinePicker, setShowCombinePicker] = useState(false);
  const [combining, setCombining] = useState(false);
  /** table_id being uncombined — null when idle. */
  const [uncombiningId, setUncombiningId] = useState<string | null>(null);

  // ── Round filter — null = "All" ──────────────────────────────────────────────
  /** The order_id of the currently selected round chip, or null for "All". */
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  // ── Realtime — live order_items status updates ──────────────────────────────
  // Debounce ref prevents flooding posTableItems when rapid UPDATE events arrive.
  const realtimeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Double-tap ref for "+" at capacity ────────────────────────────────────
  // Stores the timestamp of the last "+" press to detect a double-tap within
  // ~300 ms when partySize has reached maxSeats.
  const plusLastTapRef = useRef<number>(0);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    // Shared debounced refresh used by both listeners below.
    const refresh = () => {
      if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current);
      realtimeDebounceRef.current = setTimeout(() => {
        posTableItems(businessId, tableId)
          .then((rows) => setSentItems(rows))
          .catch(() => {});
      }, 400);
    };

    const channel = supabase
      .channel(`pos-hub-rt-${tableId}`)
      // Item-level updates (item_status: e.g. item marked ready individually)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'order_items' },
        refresh,
      )
      // Order-level updates (order_status: kitchen marks 'preparing' for the whole order)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders' },
        refresh,
      )
      .subscribe();

    return () => {
      if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [businessId, tableId]);

  // ── Party size (local, synced to server optimistically) ─────────────────────
  const [partySize, setPartySize] = useState<number>(1);
  // Use combined_seats so the stepper can reach the full capacity of all merged tables.
  const maxSeats = tableData?.combined_seats ?? tableData?.seats ?? 12;

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
          setAllTables(overviewRows);

          // Redirect: if this table is a combined secondary, navigate to the primary.
          if (row?.combined_into) {
            const primaryRow = overviewRows.find((r) => r.table_id === row.combined_into) ?? null;
            navigation.replace('PosTableHub', {
              businessId,
              businessName,
              tableId: row.combined_into,
              tableLabel: primaryRow?.label ?? tableLabel,
              plan,
            });
            return;
          }

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
    }, [businessId, businessName, tableId, tableLabel, plan, navigation]),
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

  /**
   * Ordered list of distinct order_ids from sentItems (preserving appearance
   * order = creation order from server). Index+1 is the round number.
   */
  const orderedRounds = useMemo(() => {
    const seen = new Set<string>();
    const ids: string[] = [];
    for (const item of sentItems) {
      if (!seen.has(item.order_id)) {
        seen.add(item.order_id);
        ids.push(item.order_id);
      }
    }
    return ids;
  }, [sentItems]);

  // Reset filter selection when the selected round disappears (e.g. after refresh).
  useEffect(() => {
    if (selectedOrderId !== null && !orderedRounds.includes(selectedOrderId)) {
      setSelectedOrderId(null);
    }
  }, [orderedRounds, selectedOrderId]);

  /** Items to show in the summary — all when "All", or only matching round. */
  const filteredSentItems = useMemo(
    () =>
      selectedOrderId === null
        ? sentItems
        : sentItems.filter((i) => i.order_id === selectedOrderId),
    [sentItems, selectedOrderId],
  );

  /** Draft items are only shown in the "All" view, not per-round. */
  const showDraft = selectedOrderId === null;

  /**
   * The order_id to use for the action panel (Cancel / Edit buttons).
   *
   * With exactly 1 round the panel is always available — no chip needed.
   * With ≥2 rounds the employee must select a chip first (existing behaviour).
   * Null → panel hidden.
   */
  const actionOrderId = useMemo((): string | null => {
    if (orderedRounds.length === 1) return orderedRounds[0];
    return selectedOrderId;
  }, [orderedRounds, selectedOrderId]);

  /**
   * True when the action order exists AND it has not been picked up by the
   * kitchen. Two conditions must both hold:
   *   1. order_status is not 'preparing' or 'ready'  ← order-level gate
   *      (kitchen marks orders as a whole, not per item)
   *   2. every item_status is still 'pending'         ← item-level safety net
   * If either fails → show "En preparación" lock text.
   */
  const selectedRoundAllPending = useMemo(() => {
    if (actionOrderId === null) return false;
    const items = sentItems.filter((i) => i.order_id === actionOrderId);
    if (items.length === 0) return false;
    const orderOk = !['preparing', 'ready'].includes(items[0].order_status);
    const itemsOk = items.every((i) => i.item_status === 'pending');
    return orderOk && itemsOk;
  }, [sentItems, actionOrderId]);

  /** Unique seat keys that have at least one item to display. */
  const seatGroups = useMemo(() => {
    const keys = new Set<string>();
    filteredSentItems.forEach((i) =>
      keys.add(i.seat === null ? 'table' : String(i.seat)),
    );
    if (showDraft) {
      tableDraft.forEach((d) =>
        keys.add(d.seat === null ? 'table' : String(d.seat)),
      );
    }
    return [...keys].sort((a, b) => {
      if (a === 'table') return -1;
      if (b === 'table') return 1;
      return Number(a) - Number(b);
    });
  }, [filteredSentItems, tableDraft, showDraft]);

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

  // ── Dividir ───────────────────────────────────────────────────────────────
  const handleDividir = useCallback(() => {
    navigation.navigate('PosSplit', { businessId, tableId, tableLabel, partySize });
  }, [navigation, businessId, tableId, tableLabel, partySize]);

  // ── Void / edit order ─────────────────────────────────────────────────────
  /**
   * Void the given order on the server, then either discard it (mode='cancel')
   * or reload its items into the draft for editing (mode='edit').
   *
   * Security: only businessId + orderId are sent to the server.
   * The server validates status gating and computes nothing from client data.
   */
  const handleVoidOrder = useCallback(
    async (orderId: string, mode: 'cancel' | 'edit') => {
      if (voidingOrderId) return;
      setVoidingOrderId(orderId);

      const result = await posVoidOrder(businessId, orderId);
      setVoidingOrderId(null);

      if (!result.ok) {
        const msgMap: Record<string, string> = {
          in_preparation:  t('pos.voidOrderErrInPrep'),
          split_in_progress: t('pos.voidOrderErrSplit'),
          already_paid:    t('pos.voidOrderErrPaid'),
          no_access:       t('pos.errorNoAccess'),
        };
        Alert.alert(
          t('pos.errorTitle'),
          msgMap[result.reason] ?? t('pos.voidOrderErr'),
        );
        return;
      }

      if (mode === 'edit') {
        // Rebuild the draft per-seat so the employee can adjust and re-send.
        // menu_item_id comes from PosTableItemRow (returned by pos_table_items).
        // Modifiers are not reconstructed (group_id not in stored data);
        // special_instructions are preserved as the item note.
        const orderItems = sentItems.filter((i) => i.order_id === orderId);
        const bySeat = new Map<number | null, PosTableItemRow[]>();
        for (const item of orderItems) {
          const bucket = bySeat.get(item.seat);
          if (bucket) bucket.push(item);
          else bySeat.set(item.seat, [item]);
        }
        bySeat.forEach((items, seat) => {
          const existing = getSeatDraft(tableId, seat);
          const newItems: DraftItem[] = items.map((item) => ({
            cartKey: item.order_item_id,
            menuItemId: item.menu_item_id,
            name: item.item_name,
            basePriceCents: item.price_cents,
            modifierExtraCents: 0,
            qty: item.qty,
            seat: item.seat,
            modifiers: [],
            note: item.special_instructions ?? '',
          }));
          setSeatDraft(tableId, seat, [...existing, ...newItems]);
        });
      }

      // Refresh sent items and reset filter to "All"
      posTableItems(businessId, tableId)
        .then((rows) => setSentItems(rows))
        .catch(() => {});
      setSelectedOrderId(null);
    },
    // posVoidOrder + posTableItems are stable module imports — no need in deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [voidingOrderId, businessId, tableId, sentItems, getSeatDraft, setSeatDraft, t],
  );

  /** Show confirmation Alert, then call handleVoidOrder in cancel mode. */
  const handleCancelOrderPress = useCallback(
    (orderId: string) => {
      Alert.alert(
        t('pos.voidOrderConfirmTitle'),
        t('pos.voidOrderConfirmMsg'),
        [
          { text: t('pos.voidOrderConfirmDismiss'), style: 'cancel' },
          {
            text: t('pos.voidOrderConfirmBtn'),
            style: 'destructive',
            onPress: () => { void handleVoidOrder(orderId, 'cancel'); },
          },
        ],
      );
    },
    [t, handleVoidOrder],
  );

  // ── Combine/uncombine derived ─────────────────────────────────────────────
  /** Tables currently annexed to this primary table. */
  const combinedSecondaries = useMemo(
    () => allTables.filter((t) => t.combined_into === tableId),
    [allTables, tableId],
  );
  /** Tables that can be annexed as a secondary (server-verified combinable flag). */
  const freeTables = useMemo(
    () =>
      allTables.filter(
        (t) =>
          t.table_id !== tableId &&
          t.combinable === true,
      ),
    [allTables, tableId],
  );

  // ── Refresh helper (post-combine/uncombine) ───────────────────────────────
  const refreshAll = useCallback(() => {
    Promise.all([
      posTablesOverview(businessId),
      posTableItems(businessId, tableId),
    ])
      .then(([overviewRows, itemRows]) => {
        const row = overviewRows.find((r) => r.table_id === tableId) ?? null;
        setAllTables(overviewRows);
        setTableData(row);
        if (row) setPartySize(row.party_size ?? 1);
        setSentItems(itemRows);
      })
      .catch(() => {});
  }, [businessId, tableId]);

  /**
   * Handler for the "+" stepper button.
   *
   * • Below capacity  → add one person (normal behaviour).
   * • At capacity     → double-tap within ~300 ms opens the combine picker.
   *                     Single tap at capacity → no-op (the button still renders
   *                     with a brand tint so staff knows something can happen).
   */
  const handlePlusPress = useCallback(() => {
    if (partySize < maxSeats) {
      void handleAdjustParty(1);
      return;
    }
    // At cap — detect double-tap
    const now = Date.now();
    if (now - plusLastTapRef.current < 300) {
      plusLastTapRef.current = 0; // reset so a third tap starts fresh
      if (combining || !!uncombiningId) return;
      if (freeTables.length === 0) {
        Alert.alert(t('pos.combineMesa'), t('pos.combineNoFree'));
        return;
      }
      setShowCombinePicker(true);
    } else {
      plusLastTapRef.current = now;
      // Single tap at max → no-op; a subtle brand tint on the icon signals it
    }
  }, [partySize, maxSeats, handleAdjustParty, combining, uncombiningId, freeTables, t]);

  // ── Combine handler ───────────────────────────────────────────────────────
  const handleCombine = useCallback(
    async (secondaryTableId: string) => {
      setShowCombinePicker(false);
      setCombining(true);
      const result = await posCombineTables(businessId, tableId, secondaryTableId);
      setCombining(false);

      if (!result.ok) {
        const msgMap: Record<string, string> = {
          secondary_in_use:           t('pos.combineErrInUse'),
          secondary_has_open_orders:  t('pos.combineErrOpenOrders'),
          secondary_already_combined: t('pos.combineErrAlreadyCombined'),
          no_access:                  t('pos.combineErrNoAccess'),
        };
        Alert.alert(
          t('pos.errorTitle'),
          msgMap[result.reason] ?? t('pos.combineErrGeneral'),
        );
        return;
      }

      refreshAll();
    },
    [businessId, tableId, t, refreshAll],
  );

  // ── Uncombine handler ─────────────────────────────────────────────────────
  const handleUncombine = useCallback(
    async (secondaryTableId: string) => {
      if (uncombiningId) return;
      setUncombiningId(secondaryTableId);
      const result = await posUncombineTable(businessId, secondaryTableId);
      setUncombiningId(null);

      if (!result.ok) {
        Alert.alert(t('pos.errorTitle'), t('pos.uncombineErr'));
        return;
      }

      refreshAll();
    },
    [businessId, t, uncombiningId, refreshAll],
  );

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
          {/* ── Combined tables section ────────────────────────────────────── */}
          {(combinedSecondaries.length > 0 || combining) && (
            <View style={[styles.combinedSection, { backgroundColor: c.bgSurface, borderColor: c.borderSubtle }]}>
              <View style={styles.combinedHeader}>
                <IconPlugConnected size={14} color={c.brand} strokeWidth={2} />
                <Text style={[styles.combinedHeaderText, { color: c.textSecondary }]}>
                  {t('pos.combinedTablesSection')}
                </Text>
              </View>
              {combinedSecondaries.map((sec) => (
                <View key={sec.table_id} style={[styles.combinedRow, { borderTopColor: c.borderSubtle }]}>
                  <Text style={[styles.combinedRowLabel, { color: c.textPrimary }]}>
                    {sec.label}
                  </Text>
                  <Text style={[styles.combinedRowSeats, { color: c.textTertiary }]}>
                    {sec.seats != null ? `${sec.seats} asientos` : ''}
                  </Text>
                  <Pressable
                    onPress={() => { void handleUncombine(sec.table_id); }}
                    disabled={!!uncombiningId}
                    style={[styles.uncombineBtn, { borderColor: c.danger + '88' }]}
                    accessibilityRole="button"
                    accessibilityLabel={t('pos.combineSeparar')}
                    accessibilityState={{ disabled: !!uncombiningId }}
                  >
                    {uncombiningId === sec.table_id ? (
                      <ActivityIndicator size="small" color={c.danger} />
                    ) : (
                      <>
                        <IconPlugOff size={12} color={c.danger} strokeWidth={2} />
                        <Text style={[styles.uncombineBtnText, { color: c.danger }]}>
                          {t('pos.combineSeparar')}
                        </Text>
                      </>
                    )}
                  </Pressable>
                </View>
              ))}
              {combining && (
                <View style={[styles.combinedRow, { borderTopColor: c.borderSubtle }]}>
                  <ActivityIndicator size="small" color={c.brand} />
                  <Text style={[styles.combinedRowLabel, { color: c.textTertiary }]}>
                    {t('pos.combineMesa')}…
                  </Text>
                </View>
              )}
            </View>
          )}

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
                onPress={handlePlusPress}
                style={[
                  styles.stepBtn,
                  { backgroundColor: c.bgBase, borderColor: c.borderSubtle },
                ]}
                accessibilityRole="button"
                accessibilityLabel={
                  partySize >= maxSeats
                    ? t('pos.combineMesa')
                    : undefined
                }
                accessibilityHint={
                  partySize >= maxSeats
                    ? t('pos.combineMesa')
                    : undefined
                }
              >
                <IconPlus
                  size={13}
                  // At cap: brand tint hints that double-tap opens combine picker
                  color={partySize < maxSeats ? c.textSecondary : c.brand}
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

          {/* ── Round filter chips (only shown with ≥2 rounds) ──────────── */}
          {orderedRounds.length >= 2 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.filterScroll}
              contentContainerStyle={styles.filterRow}
            >
              {/* "All" chip */}
              <Pressable
                onPress={() => setSelectedOrderId(null)}
                style={[
                  styles.filterChip,
                  selectedOrderId === null
                    ? { backgroundColor: c.brand }
                    : { backgroundColor: c.bgSurface, borderColor: c.borderSubtle, borderWidth: 1 },
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: selectedOrderId === null }}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    { color: selectedOrderId === null ? '#fff' : c.textSecondary },
                  ]}
                >
                  {t('pos.filterAll')}
                </Text>
              </Pressable>

              {/* Per-round chips */}
              {orderedRounds.map((orderId, idx) => {
                const isActive = selectedOrderId === orderId;
                return (
                  <Pressable
                    key={orderId}
                    onPress={() => setSelectedOrderId(orderId)}
                    style={[
                      styles.filterChip,
                      isActive
                        ? { backgroundColor: c.brand }
                        : { backgroundColor: c.bgSurface, borderColor: c.borderSubtle, borderWidth: 1 },
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isActive }}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        { color: isActive ? '#fff' : c.textSecondary },
                      ]}
                    >
                      {t('pos.filterOrderN', { n: idx + 1 })}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          {/* ── Order actions (Cancelar / Editar)
               • 1 round  → always shown (actionOrderId auto-set to that round)
               • ≥2 rounds → shown only when a chip is selected              */}
          {actionOrderId !== null && (
            <View
              style={[
                styles.orderActionPanel,
                { backgroundColor: c.bgSurface, borderColor: c.borderSubtle },
              ]}
            >
              {selectedRoundAllPending ? (
                <>
                  {/* Cancelar orden */}
                  <Pressable
                    onPress={() => handleCancelOrderPress(actionOrderId)}
                    disabled={!!voidingOrderId}
                    style={({ pressed }) => [
                      styles.orderActionBtn,
                      { backgroundColor: c.danger },
                      pressed && !voidingOrderId && { opacity: 0.8 },
                      !!voidingOrderId && styles.orderActionBtnDisabled,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={t('pos.voidOrderCancelBtn')}
                    accessibilityState={{ disabled: !!voidingOrderId }}
                  >
                    {voidingOrderId === actionOrderId ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.orderActionBtnText}>
                        {t('pos.voidOrderCancelBtn')}
                      </Text>
                    )}
                  </Pressable>

                  {/* Editar orden */}
                  <Pressable
                    onPress={() => { void handleVoidOrder(actionOrderId, 'edit'); }}
                    disabled={!!voidingOrderId}
                    style={({ pressed }) => [
                      styles.orderActionBtn,
                      { backgroundColor: c.brand },
                      pressed && !voidingOrderId && { opacity: 0.8 },
                      !!voidingOrderId && styles.orderActionBtnDisabled,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={t('pos.voidOrderEditBtn')}
                    accessibilityState={{ disabled: !!voidingOrderId }}
                  >
                    {voidingOrderId === actionOrderId ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.orderActionBtnText}>
                        {t('pos.voidOrderEditBtn')}
                      </Text>
                    )}
                  </Pressable>
                </>
              ) : (
                /* Kitchen has already started this round — lock it */
                <Text style={[styles.orderInPrepText, { color: c.textTertiary }]}>
                  {t('pos.voidOrderInPrep')}
                </Text>
              )}
            </View>
          )}

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
                const seatSent = filteredSentItems.filter((i) => i.seat === seat);
                const seatDraft = showDraft ? tableDraft.filter((d) => d.seat === seat) : [];
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

      {/* ── Combine picker modal ──────────────────────────────────────────────── */}
      <Modal
        visible={showCombinePicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCombinePicker(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setShowCombinePicker(false)}
        />
        <View style={[styles.modalSheet, { backgroundColor: c.bgSurface }]}>
          {/* Sheet header */}
          <View style={[styles.modalHeader, { borderBottomColor: c.borderSubtle }]}>
            <Text style={[styles.modalTitle, { color: c.textPrimary }]}>
              {t('pos.combineChoose')}
            </Text>
            <Pressable
              onPress={() => setShowCombinePicker(false)}
              style={styles.modalClose}
              accessibilityRole="button"
              accessibilityLabel={t('pos.combineCancel')}
            >
              <Text style={[styles.modalCloseText, { color: c.brand }]}>
                {t('pos.combineCancel')}
              </Text>
            </Pressable>
          </View>

          {/* Free table list */}
          <FlatList
            data={freeTables}
            keyExtractor={(t) => t.table_id}
            contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
            ItemSeparatorComponent={() => (
              <View style={[styles.modalSep, { backgroundColor: c.borderSubtle }]} />
            )}
            renderItem={({ item: freeTable }) => (
              <Pressable
                onPress={() => { void handleCombine(freeTable.table_id); }}
                style={({ pressed }) => [
                  styles.modalTableRow,
                  pressed && { backgroundColor: c.brand + '12' },
                ]}
                accessibilityRole="button"
              >
                <Text style={[styles.modalTableLabel, { color: c.textPrimary }]}>
                  {freeTable.label}
                </Text>
                {freeTable.seats != null && (
                  <Text style={[styles.modalTableSeats, { color: c.textTertiary }]}>
                    {freeTable.seats} asientos
                  </Text>
                )}
                <IconPlugConnected size={16} color={c.brand} strokeWidth={1.5} />
              </Pressable>
            )}
          />
        </View>
      </Modal>

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
          accessibilityLabel={t('pos.submitButton')}
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
              {t('pos.hubBtnKitchen')}
            </Text>
          )}
        </Pressable>

        {/* Split Bill — active when sent items exist (C11) */}
        <Pressable
          onPress={hasSent ? handleDividir : undefined}
          disabled={!hasSent}
          style={({ pressed }) => [
            styles.actionBtn,
            { backgroundColor: hasSent ? c.brandPurple : c.borderSubtle },
            pressed && hasSent && { opacity: 0.8 },
          ]}
          accessibilityRole="button"
          accessibilityLabel={t('pos.hubSplitBill')}
          accessibilityState={{ disabled: !hasSent }}
        >
          <Text style={[styles.actionBtnText, { color: hasSent ? '#fff' : c.textTertiary }]}>
            {t('pos.hubBtnSplit')}
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

  // ── Round filter chips ────────────────────────────────────────────────────────
  filterScroll: {
    // Break out of the parent ScrollView's horizontal padding so chips start flush.
    marginHorizontal: -H_PAD,
  },
  filterRow: {
    paddingHorizontal: H_PAD,
    paddingBottom: 4,
    flexDirection: 'row',
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  filterChipText: { fontSize: 13, fontWeight: '600' },

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

  // ── Order action panel (Cancelar / Editar per-round) ─────────────────────
  orderActionPanel: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  orderActionBtn: {
    flex: 1,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderActionBtnDisabled: { opacity: 0.45 },
  orderActionBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  orderInPrepText: { fontSize: 13, fontStyle: 'italic', flex: 1, textAlign: 'center' },

  // ── Action bar ────────────────────────────────────────────────────────────
  actionBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    paddingHorizontal: H_PAD,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnText: { fontSize: 13, fontWeight: '600' },

  // ── Combined tables section ──────────────────────────────────────────────────
  combinedSection: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  combinedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  combinedHeaderText: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
  combinedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 9,
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  combinedRowLabel: { flex: 1, fontSize: 14, fontWeight: '600' },
  combinedRowSeats: { fontSize: 12 },
  uncombineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  uncombineBtnText: { fontSize: 12, fontWeight: '600' },

  // ── Combine picker modal ─────────────────────────────────────────────────────
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  modalSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '60%',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: H_PAD,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalTitle: { flex: 1, fontSize: 16, fontWeight: '600' },
  modalClose: { paddingLeft: 12 },
  modalCloseText: { fontSize: 15, fontWeight: '600' },
  modalSep: { height: StyleSheet.hairlineWidth, marginLeft: H_PAD },
  modalTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: H_PAD,
    paddingVertical: 14,
    gap: 8,
  },
  modalTableLabel: { flex: 1, fontSize: 15, fontWeight: '600' },
  modalTableSeats: { fontSize: 12 },
});
