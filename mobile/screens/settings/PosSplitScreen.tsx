/**
 * JChat 3.0 — POS Split Screen (C11)
 *
 * Splits the open tab of a table using one of two methods:
 *
 *   • Partes iguales (even)  — N equal parts
 *   • Por silla / artículo (items) — sub-account builder where each item
 *     is manually assigned to a seat-based or custom check
 *
 * ── Flow ──────────────────────────────────────────────────────────────────────
 * 1. Employee selects method (even vs items).
 *
 * Even path:
 *   a. N stepper (2–20).
 *   b. "Crear división" → posCreateSplit(…, 'even', N, null).
 *   c. Charge list (split_created phase).
 *
 * Items path:
 *   a. posTableItems() loaded on mount; builder groups them by seat.
 *   b. Employee reassigns items between sub-accounts via "Mover".
 *   c. Validation: "Sin asignar" must be empty + ≥2 non-empty sub-accounts.
 *   d. "Crear división" → posCreateSplit(…, 'items', null, checks[]).
 *      checks[] = [{ seat, order_item_ids }] — no amounts from client.
 *   e. Charge list (same split_created phase as even).
 *
 * ── Security ──────────────────────────────────────────────────────────────────
 * • Client never sends amounts — posCreateSplit sends only method + N (even)
 *   or order_item_id groups (items); the server validates + computes amounts.
 * • markTabPaid() retrieves the PI directly from Stripe before updating the DB.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  IconCheck,
  IconChevronLeft,
  IconMinus,
  IconPlus,
  IconRefresh,
  IconWifi,
  IconWifiOff,
} from '@tabler/icons-react-native';
import { isTerminalAvailable } from '../../services/terminalSdk';
import { usePosReader } from '../../hooks/usePosReader';
import PosTipPicker, { TIP_PRESETS } from '../../components/pos/PosTipPicker';

import { palette } from '../../theme/tokens';
import { useThemeColors } from '../../theme/colors';
import { posTableItems, posCreateSplit, posCreateCheck } from '../../services/pos';
import type { PosSplitCheckRow, PosTableItemRow, PosCheckItem } from '../../services/pos';
import { chargeSplitCheck, markTabPaid } from '../../services/terminal';
import type { PosStackParamList } from '../../navigation/PosNavigator';

// ─── Nav types ────────────────────────────────────────────────────────────────

type PosSplitNav = NativeStackNavigationProp<PosStackParamList, 'PosSplit'>;
type PosSplitRoute = RouteProp<PosStackParamList, 'PosSplit'>;

// ─── Local types ──────────────────────────────────────────────────────────────

/** The split method the employee selected. */
type SplitMethod = 'even' | 'items';

/**
 * Outer phase.
 *   method_select — entry: employee picks even vs items
 *   setup         — even: N stepper
 *   building      — items: sub-account editor
 *   split_created — charging checks (shared by both methods)
 */
type SplitPhase = 'method_select' | 'setup' | 'building' | 'split_created';

/**
 * Inner per-payment phase while charging a single part.
 * Resets to 'idle' after each successful charge so the next part can proceed.
 */
type CheckoutPhase =
  | 'idle'       // waiting for employee to tap "Cobrar"
  | 'creating'   // calling chargeSplitCheck EF
  | 'retrieving' // calling SDK retrievePaymentIntent
  | 'collecting' // collectPaymentMethod on reader
  | 'confirming' // confirmPaymentIntent
  | 'marking'    // calling markTabPaid EF
  | 'error';     // something went wrong — employee can retry

/** A sub-account in the items-split builder. */
interface SubAccount {
  /** Stable local key (React key + mutation target). */
  id: string;
  /** Display label shown in cards and the move picker. */
  label: string;
  /**
   * Physical seat this account corresponds to; null for mixed or custom accounts.
   * Sent as-is to the server in the checks array.
   */
  seat: number | null;
  /** Items currently assigned to this account. */
  items: PosTableItemRow[];
}

/**
 * Context for the tip picker overlay.
 * Shown before starting a charge — the employee picks a tip, then the charge
 * flow runs. Dismissed on back (no server calls have been made yet).
 */
type TipPickerCtx =
  | { kind: 'even'; check: PosSplitCheckRow; baseCents: number }
  | { kind: 'items'; account: SubAccount; baseCents: number };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

const MIN_WAYS = 2;
const MAX_WAYS = 20;

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function PosSplitScreen(): React.ReactElement {
  const c = useThemeColors();
  const { t } = useTranslation('settings');
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<PosSplitNav>();
  const route = useRoute<PosSplitRoute>();
  const { businessId, tableId, tableLabel, partySize: partySizeHint } = route.params;

  // ── Reader state + lifecycle (managed by usePosReader) ─────────────────────
  // All hooks called unconditionally (Rules of Hooks). terminalSdk stubs are
  // safe when !isTerminalAvailable: no-ops / empty arrays / disconnected.
  const {
    readerStatus,
    readerError,
    updateProgress,
    connectedReader,
    retrievePaymentIntent,
    collectPaymentMethod,
    confirmPaymentIntent,
    handleRetryReader,
  } = usePosReader({ businessId });

  // ── Tab total (preview — display only; authoritative amount from server) ────
  const [tabAmountCents, setTabAmountCents] = useState<number | null>(null);
  const [tabItems, setTabItems] = useState<PosTableItemRow[]>([]);
  const [tabLoading, setTabLoading] = useState(true);

  // ── Method + outer phase ────────────────────────────────────────────────────
  const [splitPhase, setSplitPhase] = useState<SplitPhase>('method_select');

  // ── Even-split setup ────────────────────────────────────────────────────────
  const defaultWays = Math.max(MIN_WAYS, Math.min(MAX_WAYS, partySizeHint ?? MIN_WAYS));
  const [ways, setWays] = useState<number>(defaultWays);

  // ── Items-split builder ─────────────────────────────────────────────────────
  const [subAccounts, setSubAccounts] = useState<SubAccount[]>([]);
  /** Increments each time a custom account is created; gives stable labels. */
  const newAccountCounterRef = useRef(0);

  // ── Shared split state (used by both methods) ───────────────────────────────
  const [splitting, setSplitting] = useState(false);
  const [splitError, setSplitError] = useState<string | null>(null);
  const [checks, setChecks] = useState<PosSplitCheckRow[]>([]);

  // ── Per-part payment state ──────────────────────────────────────────────────
  /** Set of payment_ids that have been successfully charged. */
  const [paidIds, setPaidIds] = useState<Set<string>>(new Set());
  /** payment_id currently being charged (null = none). */
  const [activePaymentId, setActivePaymentId] = useState<string | null>(null);
  /**
   * sub-account id currently being charged in the 'building' phase (null = none).
   * Used to show a spinner on the correct Pay button while the reader flow runs.
   */
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
  const [checkoutPhase, setCheckoutPhase] = useState<CheckoutPhase>('idle');
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  // ── Tip picker state ────────────────────────────────────────────────────────
  // When tipPickerCtx is non-null the tip "screen" is shown (early return below).
  // All tip-picker state is reset when tipPickerCtx is set.
  const [tipPickerCtx, setTipPickerCtx] = useState<TipPickerCtx | null>(null);
  const [tipOption, setTipOption] = useState<string>('none');
  const [tipCustomMode, setTipCustomMode] = useState<'pct' | 'amt'>('pct');
  const [tipCustomInput, setTipCustomInput] = useState<string>('');

  // ── Load tab items + total preview on mount ─────────────────────────────────
  useEffect(() => {
    let mounted = true;
    posTableItems(businessId, tableId)
      .then((rows) => {
        if (!mounted) return;
        setTabItems(rows);
        const total = rows.reduce((sum, r) => sum + r.price_cents * r.qty, 0);
        setTabAmountCents(total > 0 ? total : null);
      })
      .catch(() => { if (mounted) { setTabItems([]); setTabAmountCents(null); } })
      .finally(() => { if (mounted) setTabLoading(false); });
    return () => { mounted = false; };
  }, [businessId, tableId]);

  // ── Even method — N stepper ───────────────────────────────────────────────
  const handleDecrement = useCallback(
    () => setWays((w) => Math.max(MIN_WAYS, w - 1)),
    [],
  );
  const handleIncrement = useCallback(
    () => setWays((w) => Math.min(MAX_WAYS, w + 1)),
    [],
  );

  // ── Items method — init builder ────────────────────────────────────────────
  /**
   * Group tabItems by seat into initial sub-accounts.
   * Items with seat=null go into "Sin asignar" (always last).
   * Called when employee selects the 'items' method.
   */
  const initBuilder = useCallback(() => {
    const seatMap = new Map<number, PosTableItemRow[]>();
    const unassignedItems: PosTableItemRow[] = [];

    for (const item of tabItems) {
      if (item.seat === null) {
        unassignedItems.push(item);
      } else {
        const existing = seatMap.get(item.seat);
        if (existing) {
          existing.push(item);
        } else {
          seatMap.set(item.seat, [item]);
        }
      }
    }

    const accounts: SubAccount[] = [];

    // Seat-based accounts sorted ascending
    for (const seat of [...seatMap.keys()].sort((a, b) => a - b)) {
      accounts.push({
        id: `seat-${seat}`,
        label: t('pos.hubSeatLabel', { n: seat }),
        seat,
        items: seatMap.get(seat)!,
      });
    }

    // "Sin asignar" — always last
    accounts.push({
      id: 'unassigned',
      label: t('pos.splitUnassigned'),
      seat: null,
      items: unassignedItems,
    });

    newAccountCounterRef.current = 0;
    setSplitError(null);
    setSubAccounts(accounts);
    setSplitPhase('building');
  }, [tabItems, t]);

  // ── Items method — move item between accounts ──────────────────────────────
  const moveItemBetweenAccounts = useCallback(
    (orderItemId: string, fromId: string, toId: string) => {
      setSubAccounts((prev) => {
        const fromAcc = prev.find((a) => a.id === fromId);
        const itemToMove = fromAcc?.items.find((i) => i.order_item_id === orderItemId);
        if (!itemToMove) return prev;
        return prev.map((a) => {
          if (a.id === fromId) {
            return { ...a, items: a.items.filter((i) => i.order_item_id !== orderItemId) };
          }
          if (a.id === toId) {
            return { ...a, items: [...a.items, itemToMove] };
          }
          return a;
        });
      });
    },
    [],
  );

  /** Create a new custom sub-account and move one item into it. */
  const createAccountWithItem = useCallback(
    (item: PosTableItemRow, fromId: string) => {
      newAccountCounterRef.current += 1;
      const n = newAccountCounterRef.current;
      const newId = `custom-${n}`;
      const newLabel = t('pos.splitAccountN', { n });

      setSubAccounts((prev) => {
        const without = prev.map((a) =>
          a.id === fromId
            ? { ...a, items: a.items.filter((i) => i.order_item_id !== item.order_item_id) }
            : a,
        );
        // Insert before "Sin asignar"
        const unassignedIdx = without.findIndex((a) => a.id === 'unassigned');
        const newAcc: SubAccount = { id: newId, label: newLabel, seat: null, items: [item] };
        if (unassignedIdx >= 0) {
          const next = [...without];
          next.splice(unassignedIdx, 0, newAcc);
          return next;
        }
        return [...without, newAcc];
      });
    },
    [t],
  );

  /** Show an Alert to let the employee choose where to move an item. */
  const handleMoveItem = useCallback(
    (item: PosTableItemRow, fromId: string) => {
      const targets = subAccounts.filter((a) => a.id !== fromId);
      Alert.alert(
        t('pos.splitMoveTitle'),
        undefined,
        [
          ...targets.map((acc) => ({
            text: acc.label,
            onPress: () => moveItemBetweenAccounts(item.order_item_id, fromId, acc.id),
          })),
          {
            text: t('pos.splitNewAccount'),
            onPress: () => createAccountWithItem(item, fromId),
          },
          { text: t('pos.splitMoveCancel'), style: 'cancel' as const },
        ],
      );
    },
    [subAccounts, t, moveItemBetweenAccounts, createAccountWithItem],
  );

  /** Create an empty custom sub-account (via "+ Agregar cuenta"). */
  const handleAddAccount = useCallback(() => {
    newAccountCounterRef.current += 1;
    const n = newAccountCounterRef.current;
    const newId = `custom-${n}`;
    const newLabel = t('pos.splitAccountN', { n });

    setSubAccounts((prev) => {
      const newAcc: SubAccount = { id: newId, label: newLabel, seat: null, items: [] };
      const unassignedIdx = prev.findIndex((a) => a.id === 'unassigned');
      if (unassignedIdx >= 0) {
        const next = [...prev];
        next.splice(unassignedIdx, 0, newAcc);
        return next;
      }
      return [...prev, newAcc];
    });
  }, [t]);

  // ── Even method — create split ────────────────────────────────────────────
  const handleCreateEvenSplit = useCallback(async () => {
    if (splitting) return;
    setSplitting(true);
    setSplitError(null);

    const result = await posCreateSplit(businessId, tableId, 'even', ways, null);
    setSplitting(false);

    if (!result.ok) {
      switch (result.reason) {
        case 'empty_tab':
          setSplitError(t('pos.noOpenOrders'));
          break;
        case 'no_access':
          setSplitError(t('pos.errorNoAccess'));
          break;
        default:
          setSplitError(t('pos.splitErrorCreate'));
      }
      return;
    }

    setChecks(result.checks);
    setSplitPhase('split_created');
  }, [splitting, businessId, tableId, ways, t]);

  // ── Items method — pay one sub-account ───────────────────────────────────
  /**
   * Charge a single sub-account directly without creating a full split.
   * Called by handleTipConfirm after the employee selects a tip amount.
   *
   * Flow:
   *   1. posCreateCheck    — server creates payment record, returns payment_id
   *   2. chargeSplitCheck  — server creates Stripe PI (base + tip), returns clientSecret
   *   3. retrievePI        — SDK loads PI object
   *   4. collectPayment    — reader collects card
   *   5. confirmPI         — SDK confirms
   *   6. markTabPaid       — server verifies Stripe, marks order_items paid,
   *                          closes orders if all items covered
   *   7. Refresh items     — reload posTableItems; paid items disappear
   */
  const doPayAccount = useCallback(
    async (account: SubAccount, tipCents: number) => {
      if (activePaymentId || account.items.length === 0 || readerStatus !== 'ready') return;

      const orderItemIds = account.items.map((i) => i.order_item_id);

      // ── Step 1: posCreateCheck ────────────────────────────────────────────
      setActivePaymentId('__creating__');
      setActiveAccountId(account.id);
      setCheckoutPhase('creating');
      setCheckoutError(null);

      const checkResult = await posCreateCheck(businessId, tableId, orderItemIds);
      if (!checkResult.ok) {
        setCheckoutPhase('error');
        setActivePaymentId(null);
        setActiveAccountId(null);
        switch (checkResult.reason) {
          case 'invalid_item':
            setCheckoutError(t('pos.splitCheckInvalidItem'));
            break;
          case 'no_items':
            setCheckoutError(t('pos.splitCheckNoItems'));
            break;
          case 'no_access':
            setCheckoutError(t('pos.errorNoAccess'));
            break;
          default:
            setCheckoutError(t('pos.errorPayment'));
        }
        return;
      }

      const paymentId = checkResult.payment_id;
      setActivePaymentId(paymentId);

      // ── Step 2: chargeSplitCheck (base from server + waiter-selected tip) ──
      const piResult = await chargeSplitCheck(paymentId, tipCents);
      if (!piResult.ok) {
        setCheckoutPhase('error');
        setActivePaymentId(null);
        setActiveAccountId(null);
        switch (piResult.reason) {
          case 'not_pending':
            setCheckoutError(t('pos.errorAlreadyPaid'));
            break;
          case 'no_access':
            setCheckoutError(t('pos.errorNoAccess'));
            break;
          default:
            setCheckoutError(piResult.message ?? t('pos.errorPayment'));
        }
        return;
      }

      // ── Step 3: retrievePaymentIntent ─────────────────────────────────────
      setCheckoutPhase('retrieving');
      const retrieveResult = await retrievePaymentIntent(piResult.clientSecret);
      if (retrieveResult.error) {
        setCheckoutPhase('error');
        setActivePaymentId(null);
        setActiveAccountId(null);
        setCheckoutError(retrieveResult.error.message ?? t('pos.errorPayment'));
        return;
      }

      // ── Step 4: collectPaymentMethod ──────────────────────────────────────
      setCheckoutPhase('collecting');
      const collectResult = await collectPaymentMethod({
        paymentIntent: retrieveResult.paymentIntent,
      });
      if (collectResult.error) {
        setCheckoutPhase('error');
        setActivePaymentId(null);
        setActiveAccountId(null);
        setCheckoutError(collectResult.error.message ?? t('pos.errorPayment'));
        return;
      }

      // ── Step 5: confirmPaymentIntent ──────────────────────────────────────
      setCheckoutPhase('confirming');
      const confirmResult = await confirmPaymentIntent({
        paymentIntent: collectResult.paymentIntent,
      });
      if (confirmResult.error) {
        setCheckoutPhase('error');
        setActivePaymentId(null);
        setActiveAccountId(null);
        setCheckoutError(confirmResult.error.message ?? t('pos.errorPayment'));
        return;
      }

      // ── Step 6: markTabPaid ───────────────────────────────────────────────
      setCheckoutPhase('marking');
      const markResult = await markTabPaid(paymentId);
      if (!markResult.ok) {
        setCheckoutPhase('error');
        setActivePaymentId(null);
        setActiveAccountId(null);
        if (markResult.reason === 'not_succeeded') {
          setCheckoutError(
            t('pos.errorNotSucceeded', { status: markResult.piStatus ?? 'unknown' }),
          );
        } else {
          setCheckoutError(t('pos.errorMarkPaid'));
        }
        return;
      }

      // ── Step 7: refresh items — paid items disappear ──────────────────────
      setCheckoutPhase('idle');
      setActivePaymentId(null);
      setActiveAccountId(null);
      setCheckoutError(null);

      try {
        const freshItems = await posTableItems(businessId, tableId);
        const validIds = new Set(freshItems.map((i) => i.order_item_id));
        const newTotal = freshItems.reduce((s, i) => s + i.price_cents * i.qty, 0);
        setTabAmountCents(newTotal > 0 ? newTotal : null);
        setSubAccounts((prev) =>
          prev.map((acc) => ({
            ...acc,
            items: acc.items.filter((i) => validIds.has(i.order_item_id)),
          })),
        );
      } catch {
        // Non-fatal: items may be stale but the payment went through
      }

      if (markResult.tabClosed) {
        Alert.alert(
          t('pos.splitAllPaid'),
          t('pos.splitAllPaidMsg'),
          [{ text: t('pos.submitOk'), onPress: () => navigation.goBack() }],
        );
      }
    },
    [
      activePaymentId,
      connectedReader,
      businessId,
      tableId,
      retrievePaymentIntent,
      collectPaymentMethod,
      confirmPaymentIntent,
      navigation,
      t,
    ],
  );

  // ── Charge a single part — even split (called by handleTipConfirm) ────────
  const doChargeCheck = useCallback(
    async (paymentId: string, tipCents: number) => {
      if (readerStatus !== 'ready' || activePaymentId) return;

      setActivePaymentId(paymentId);
      setCheckoutPhase('creating');
      setCheckoutError(null);

      // Step 1: Create PI for this check (base from server + waiter-selected tip)
      const piResult = await chargeSplitCheck(paymentId, tipCents);
      if (!piResult.ok) {
        setCheckoutPhase('error');
        setActivePaymentId(null);
        switch (piResult.reason) {
          case 'not_pending':
            setCheckoutError(t('pos.errorAlreadyPaid'));
            break;
          case 'no_access':
            setCheckoutError(t('pos.errorNoAccess'));
            break;
          default:
            setCheckoutError(piResult.message ?? t('pos.errorPayment'));
        }
        return;
      }

      // Step 2: Retrieve PI (SDK needs the full object)
      setCheckoutPhase('retrieving');
      const retrieveResult = await retrievePaymentIntent(piResult.clientSecret);
      if (retrieveResult.error) {
        setCheckoutPhase('error');
        setActivePaymentId(null);
        setCheckoutError(retrieveResult.error.message ?? t('pos.errorPayment'));
        return;
      }

      // Step 3: Collect payment from reader
      setCheckoutPhase('collecting');
      const collectResult = await collectPaymentMethod({
        paymentIntent: retrieveResult.paymentIntent,
      });
      if (collectResult.error) {
        setCheckoutPhase('error');
        setActivePaymentId(null);
        setCheckoutError(collectResult.error.message ?? t('pos.errorPayment'));
        return;
      }

      // Step 4: Confirm payment
      setCheckoutPhase('confirming');
      const confirmResult = await confirmPaymentIntent({
        paymentIntent: collectResult.paymentIntent,
      });
      if (confirmResult.error) {
        setCheckoutPhase('error');
        setActivePaymentId(null);
        setCheckoutError(confirmResult.error.message ?? t('pos.errorPayment'));
        return;
      }

      // Step 5: markTabPaid — server verifies PI at Stripe, marks orders paid
      setCheckoutPhase('marking');
      const markResult = await markTabPaid(paymentId);
      if (!markResult.ok) {
        setCheckoutPhase('error');
        setActivePaymentId(null);
        if (markResult.reason === 'not_succeeded') {
          setCheckoutError(
            t('pos.errorNotSucceeded', { status: markResult.piStatus ?? 'unknown' }),
          );
        } else {
          setCheckoutError(t('pos.errorMarkPaid'));
        }
        return;
      }

      // ── Part paid — update local state ──
      setPaidIds((prev) => {
        const next = new Set(prev);
        next.add(paymentId);
        return next;
      });
      setCheckoutPhase('idle');
      setActivePaymentId(null);
      setCheckoutError(null);

      if (markResult.tabClosed) {
        Alert.alert(
          t('pos.splitAllPaid'),
          t('pos.splitAllPaidMsg'),
          [{ text: t('pos.submitOk'), onPress: () => navigation.goBack() }],
        );
      }
    },
    [
      connectedReader,
      activePaymentId,
      retrievePaymentIntent,
      collectPaymentMethod,
      confirmPaymentIntent,
      navigation,
      t,
    ],
  );

  // ── Tip picker helpers ────────────────────────────────────────────────────────

  /** Tip in cents derived from the current picker state, for the active check. */
  const computedSplitTipCents = useMemo((): number => {
    const base = tipPickerCtx?.baseCents ?? 0;
    if (tipOption === 'none' || base === 0) return 0;
    const preset = TIP_PRESETS.find((p) => p.key === tipOption);
    if (preset) return Math.round((base * preset.pct) / 100);
    if (tipOption === 'custom') {
      const raw = parseFloat(tipCustomInput.replace(',', '.'));
      if (!isFinite(raw) || raw <= 0) return 0;
      if (tipCustomMode === 'pct') return Math.round((base * raw) / 100);
      return Math.round(raw * 100); // fixed dollar amount → cents
    }
    return 0;
  }, [tipPickerCtx, tipOption, tipCustomMode, tipCustomInput]);

  /** Open the tip picker for an even-split check. */
  const handleTapChargeCheck = useCallback(
    (check: PosSplitCheckRow) => {
      if (readerStatus !== 'ready' || activePaymentId) return;
      setTipOption('none');
      setTipCustomInput('');
      setTipCustomMode('pct');
      setTipPickerCtx({ kind: 'even', check, baseCents: check.amount_cents });
    },
    [readerStatus, activePaymentId],
  );

  /** Open the tip picker for an items-split sub-account. */
  const handleTapPayAccount = useCallback(
    (account: SubAccount) => {
      if (activePaymentId || account.items.length === 0 || readerStatus !== 'ready') return;
      const subtotal = account.items.reduce((sum, i) => sum + i.price_cents * i.qty, 0);
      setTipOption('none');
      setTipCustomInput('');
      setTipCustomMode('pct');
      setTipPickerCtx({ kind: 'items', account, baseCents: subtotal });
    },
    [activePaymentId, readerStatus],
  );

  /** Confirm the current tip selection and run the charge flow. */
  const handleTipConfirm = useCallback(() => {
    if (!tipPickerCtx) return;
    const ctx = tipPickerCtx;
    const tip = computedSplitTipCents;
    setTipPickerCtx(null); // close picker before async work starts
    if (ctx.kind === 'even') {
      void doChargeCheck(ctx.check.payment_id, tip);
    } else {
      void doPayAccount(ctx.account, tip);
    }
  }, [tipPickerCtx, computedSplitTipCents, doChargeCheck, doPayAccount]);

  // ── Derived ──────────────────────────────────────────────────────────────────
  const isProcessing =
    checkoutPhase === 'creating' ||
    checkoutPhase === 'retrieving' ||
    checkoutPhase === 'collecting' ||
    checkoutPhase === 'confirming' ||
    checkoutPhase === 'marking';

  const paidCount = paidIds.size;
  const totalCount = checks.length;

  const checkoutPhaseLabel = (() => {
    switch (checkoutPhase) {
      case 'creating':
      case 'retrieving': return t('pos.collecting');
      case 'collecting':  return t('pos.collecting');
      case 'confirming':  return t('pos.confirming');
      case 'marking':     return t('pos.markingPaid');
      default:            return null;
    }
  })();

  // Unassigned account reference (used for warning border in building phase)
  const unassignedAccount = subAccounts.find((a) => a.id === 'unassigned');

  // ── Terminal unavailable guard ────────────────────────────────────────────────
  if (!isTerminalAvailable) {
    return (
      <View style={[styles.screen, { backgroundColor: c.bgBase }]}>
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
            style={styles.backBtn}
            accessibilityRole="button"
            accessibilityLabel={t('workMode.pinCancel')}
          >
            <IconChevronLeft size={24} color={c.brand} strokeWidth={2} />
          </Pressable>
          <View style={styles.headerTitles}>
            <Text style={[styles.headerTitle, { color: c.textPrimary }]} numberOfLines={1}>
              {t('pos.splitTitle')}
            </Text>
            <Text style={[styles.headerSub, { color: c.textTertiary }]} numberOfLines={1}>
              {tableLabel}
            </Text>
          </View>
        </View>
        <View style={styles.unavailableBody}>
          <IconWifiOff size={44} color={c.textTertiary} strokeWidth={1.5} />
          <Text style={[styles.unavailableTitle, { color: c.textPrimary }]}>
            {t('pos.terminalUnavailableTitle')}
          </Text>
          <Text style={[styles.unavailableSub, { color: c.textTertiary }]}>
            {t('pos.terminalUnavailableSub')}
          </Text>
          <Pressable
            onPress={() => navigation.goBack()}
            style={({ pressed }) => [
              styles.unavailableBack,
              { backgroundColor: c.brand },
              pressed && { opacity: 0.8 },
            ]}
            accessibilityRole="button"
          >
            <Text style={styles.unavailableBackText}>{t('workMode.pinCancel')}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ─── Tip picker view (shown when employee taps "Cobrar" on any check) ────────
  // Replaces the split screen content. Back → dismiss (no server calls made yet).
  // Confirm → runs the charge flow (doChargeCheck or doPayAccount).
  if (tipPickerCtx !== null) {
    return (
      <View style={[styles.screen, { backgroundColor: c.bgBase }]}>
        <StatusBar
          barStyle={c.bgBase === palette.bgBase ? 'light-content' : 'dark-content'}
        />
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
            onPress={() => setTipPickerCtx(null)}
            style={styles.backBtn}
            accessibilityRole="button"
            accessibilityLabel={t('pos.tipBack')}
          >
            <IconChevronLeft size={24} color={c.brand} strokeWidth={2} />
          </Pressable>
          <View style={styles.headerTitles}>
            <Text style={[styles.headerTitle, { color: c.textPrimary }]} numberOfLines={1}>
              {t('pos.tipTitle')}
            </Text>
          </View>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: insets.bottom + 120 },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <PosTipPicker
            baseCents={tipPickerCtx.baseCents}
            selectedOption={tipOption}
            onSelectOption={setTipOption}
            customMode={tipCustomMode}
            onCustomModeChange={setTipCustomMode}
            customInput={tipCustomInput}
            onCustomInputChange={setTipCustomInput}
            computedTipCents={computedSplitTipCents}
          />
        </ScrollView>

        {/* Footer: back + charge */}
        <View
          style={[
            styles.tipFooter,
            {
              paddingBottom: insets.bottom + 16,
              borderTopColor: c.borderSubtle,
              backgroundColor: c.bgBase,
            },
          ]}
        >
          <Pressable
            onPress={() => setTipPickerCtx(null)}
            style={[styles.tipBackBtn, { borderColor: c.borderSubtle }]}
            accessibilityRole="button"
            accessibilityLabel={t('pos.tipBack')}
          >
            <Text style={[styles.tipBackBtnText, { color: c.textSecondary }]}>
              {t('pos.tipBack')}
            </Text>
          </Pressable>

          <Pressable
            onPress={handleTipConfirm}
            style={({ pressed }) => [
              styles.tipConfirmBtn,
              { backgroundColor: c.brand },
              pressed && { opacity: 0.82 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={t('pos.tipChargeBtn', {
              total: `$${((tipPickerCtx.baseCents + computedSplitTipCents) / 100).toFixed(2)}`,
            })}
          >
            <Text style={styles.tipConfirmBtnText}>
              {t('pos.tipChargeBtn', {
                total: `$${((tipPickerCtx.baseCents + computedSplitTipCents) / 100).toFixed(2)}`,
              })}
            </Text>
            {computedSplitTipCents > 0 ? (
              <Text style={styles.tipConfirmBtnSub}>
                {t('pos.tipTipLabel', {
                  tip: `$${(computedSplitTipCents / 100).toFixed(2)}`,
                })}
              </Text>
            ) : (
              <Text style={styles.tipConfirmBtnSub}>{t('pos.tipNone')}</Text>
            )}
          </Pressable>
        </View>
      </View>
    );
  }

  // ─── Render ──────────────────────────────────────────────────────────────────
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
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel={t('workMode.pinCancel')}
          disabled={isProcessing}
        >
          <IconChevronLeft
            size={24}
            color={isProcessing ? c.textTertiary : c.brand}
            strokeWidth={2}
          />
        </Pressable>
        <View style={styles.headerTitles}>
          <Text style={[styles.headerTitle, { color: c.textPrimary }]} numberOfLines={1}>
            {t('pos.splitTitle')}
          </Text>
          <Text style={[styles.headerSub, { color: c.textTertiary }]} numberOfLines={1}>
            {tableLabel}
          </Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Reader status banner (always shown) ─────────────────────────── */}
        <View
          style={[
            styles.readerBanner,
            {
              backgroundColor: c.brandLight,
              borderColor:
                readerStatus === 'ready' ? c.success :
                readerStatus === 'error' ? c.danger :
                c.brand,
            },
          ]}
        >
          <View style={styles.readerBannerIcon}>
            {readerStatus === 'ready' ? (
              <IconWifi size={18} color={c.success} strokeWidth={2} />
            ) : readerStatus === 'error' ? (
              <IconWifiOff size={18} color={c.danger} strokeWidth={2} />
            ) : (
              <ActivityIndicator size="small" color={c.brand} />
            )}
          </View>
          <Text
            style={[
              styles.readerBannerText,
              {
                color:
                  readerStatus === 'ready' ? c.success :
                  readerStatus === 'error' ? c.danger :
                  c.brand,
              },
            ]}
          >
            {readerStatus === 'ready'
              ? t('pos.readerReady')
              : readerStatus === 'error'
              ? (readerError ?? t('pos.readerError'))
              : readerStatus === 'updating'
              ? t('pos.readerUpdating', { pct: updateProgress ?? 0 })
              : readerStatus === 'locating'
              ? t('pos.readerLocating')
              : t('pos.readerConnecting')}
          </Text>
          {readerStatus === 'error' && (
            <Pressable
              onPress={handleRetryReader}
              style={styles.retryBtn}
              accessibilityRole="button"
              accessibilityLabel={t('pos.readerRetry')}
            >
              <IconRefresh size={16} color={c.danger} strokeWidth={2} />
            </Pressable>
          )}
        </View>

        {/* ── Tab total preview ─────────────────────────────────────────────── */}
        <View
          style={[
            styles.totalCard,
            { backgroundColor: c.bgSurface, borderColor: c.borderSubtle },
          ]}
        >
          <Text style={[styles.totalCardLabel, { color: c.textTertiary }]}>
            {t('pos.splitTabTotal')}
          </Text>
          {tabLoading ? (
            <ActivityIndicator color={c.brand} style={{ marginTop: 6 }} />
          ) : (
            <Text style={[styles.totalCardAmount, { color: c.textPrimary }]}>
              {tabAmountCents !== null ? formatCents(tabAmountCents) : '—'}
            </Text>
          )}
        </View>

        {/* ══════════════════════════════════════════════════════════════════════
            METHOD SELECT — employee picks even vs items
            ══════════════════════════════════════════════════════════════════ */}
        {splitPhase === 'method_select' && (
          <>
            <Text style={[styles.methodSectionTitle, { color: c.textSecondary }]}>
              {t('pos.splitMethodTitle')}
            </Text>

            {/* Even method card */}
            <Pressable
              onPress={() => setSplitPhase('setup')}
              style={({ pressed }) => [
                styles.methodCard,
                { backgroundColor: c.bgSurface, borderColor: c.borderSubtle },
                pressed && { opacity: 0.8 },
              ]}
              accessibilityRole="button"
            >
              <Text style={[styles.methodCardTitle, { color: c.textPrimary }]}>
                {t('pos.splitMethodEven')}
              </Text>
              <Text style={[styles.methodCardSub, { color: c.textSecondary }]}>
                {t('pos.splitMethodEvenSub')}
              </Text>
            </Pressable>

            {/* Items method card */}
            <Pressable
              onPress={() => { if (!tabLoading && tabItems.length > 0) initBuilder(); }}
              disabled={tabLoading || tabItems.length === 0}
              style={({ pressed }) => [
                styles.methodCard,
                {
                  backgroundColor: c.bgSurface,
                  borderColor: c.borderSubtle,
                  opacity: tabLoading || tabItems.length === 0 ? 0.45 : 1,
                },
                pressed && !tabLoading && tabItems.length > 0 && { opacity: 0.8 },
              ]}
              accessibilityRole="button"
            >
              <Text style={[styles.methodCardTitle, { color: c.textPrimary }]}>
                {t('pos.splitMethodItems')}
              </Text>
              <Text style={[styles.methodCardSub, { color: c.textSecondary }]}>
                {t('pos.splitMethodItemsSub')}
              </Text>
            </Pressable>
          </>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            SETUP (EVEN) — N stepper + "Crear división" button
            ══════════════════════════════════════════════════════════════════ */}
        {splitPhase === 'setup' && (
          <>
            {/* N stepper */}
            <View
              style={[
                styles.stepperCard,
                { backgroundColor: c.bgSurface, borderColor: c.borderSubtle },
              ]}
            >
              <Text style={[styles.stepperQuestion, { color: c.textSecondary }]}>
                {t('pos.splitPartyQuestion')}
              </Text>
              <View style={styles.stepperRow}>
                <Pressable
                  onPress={handleDecrement}
                  disabled={ways <= MIN_WAYS}
                  style={[
                    styles.stepperBtn,
                    { backgroundColor: c.bgBase, borderColor: c.borderSubtle },
                  ]}
                  accessibilityRole="button"
                >
                  <IconMinus
                    size={16}
                    color={ways > MIN_WAYS ? c.textSecondary : c.textTertiary}
                    strokeWidth={2}
                  />
                </Pressable>
                <Text style={[styles.stepperCount, { color: c.textPrimary }]}>
                  {ways}
                </Text>
                <Pressable
                  onPress={handleIncrement}
                  disabled={ways >= MAX_WAYS}
                  style={[
                    styles.stepperBtn,
                    { backgroundColor: c.bgBase, borderColor: c.borderSubtle },
                  ]}
                  accessibilityRole="button"
                >
                  <IconPlus
                    size={16}
                    color={ways < MAX_WAYS ? c.textSecondary : c.textTertiary}
                    strokeWidth={2}
                  />
                </Pressable>
              </View>
              {tabAmountCents !== null && (
                <Text style={[styles.stepperHint, { color: c.textTertiary }]}>
                  ≈ {formatCents(Math.ceil(tabAmountCents / ways))} {t('pos.splitEach')}
                </Text>
              )}
            </View>

            {splitError !== null && (
              <Text style={[styles.splitError, { color: c.danger }]}>{splitError}</Text>
            )}

            <Pressable
              onPress={() => void handleCreateEvenSplit()}
              disabled={splitting}
              style={({ pressed }) => [
                styles.createBtn,
                { backgroundColor: splitting ? c.borderSubtle : c.brandPurple },
                pressed && !splitting && { opacity: 0.85 },
              ]}
              accessibilityRole="button"
            >
              {splitting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.createBtnText}>{t('pos.splitCreateBtn')}</Text>
              )}
            </Pressable>
          </>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            BUILDING (ITEMS) — sub-account editor with per-account Pay buttons
            Each non-unassigned account with items shows a green "Cobrar" button
            that runs posCreateCheck → chargeSplitCheck → reader → markTabPaid.
            Paid items disappear after each successful charge; tab total updates.
            ══════════════════════════════════════════════════════════════════ */}
        {splitPhase === 'building' && (
          <>
            {/* Sub-account cards */}
            {subAccounts.map((account) => {
              const isUnassigned = account.id === 'unassigned';
              const hasItems = account.items.length > 0;
              const subtotal = account.items.reduce(
                (sum, i) => sum + i.price_cents * i.qty,
                0,
              );
              // "Sin asignar" with items → warning border; empty/assigned → subtle
              const borderColor =
                isUnassigned && hasItems ? c.warning : c.borderSubtle;
              const labelColor =
                isUnassigned && hasItems ? c.warning : c.textPrimary;

              // Per-account Pay button state
              const isThisPaying = activeAccountId === account.id;
              const canPay =
                !isUnassigned &&
                hasItems &&
                !activePaymentId &&
                readerStatus === 'ready';

              return (
                <View
                  key={account.id}
                  style={[
                    styles.subAccountCard,
                    { backgroundColor: c.bgSurface, borderColor },
                  ]}
                >
                  {/* Card header: label + subtotal + Pay button */}
                  <View style={styles.subAccountHeader}>
                    <Text
                      style={[styles.subAccountLabel, { color: labelColor }]}
                      numberOfLines={1}
                    >
                      {account.label}
                    </Text>
                    <View style={styles.subAccountHeaderRight}>
                      <Text style={[styles.subAccountSubtotal, { color: c.textSecondary }]}>
                        {formatCents(subtotal)}
                      </Text>
                      {!isUnassigned && hasItems && (
                        <Pressable
                          onPress={() => handleTapPayAccount(account)}
                          disabled={!canPay}
                          style={({ pressed }) => [
                            styles.accountPayBtn,
                            { backgroundColor: canPay ? c.success : c.borderSubtle },
                            pressed && canPay && { opacity: 0.8 },
                          ]}
                          accessibilityRole="button"
                          accessibilityState={{ disabled: !canPay }}
                        >
                          {isThisPaying && isProcessing ? (
                            <ActivityIndicator color="#fff" size="small" />
                          ) : (
                            <Text
                              style={[
                                styles.accountPayBtnText,
                                { color: canPay ? '#fff' : c.textTertiary },
                              ]}
                            >
                              {t('pos.splitCharge')}
                            </Text>
                          )}
                        </Pressable>
                      )}
                    </View>
                  </View>

                  {/* Items list */}
                  {!hasItems ? (
                    <Text style={[styles.subAccountEmpty, { color: c.textTertiary }]}>
                      {t('pos.splitAccountEmpty')}
                    </Text>
                  ) : (
                    account.items.map((item) => (
                      <View
                        key={item.order_item_id}
                        style={[
                          styles.builderItemRow,
                          { borderTopColor: c.borderSubtle },
                        ]}
                      >
                        <View style={styles.builderItemInfo}>
                          <Text
                            style={[styles.builderItemName, { color: c.textPrimary }]}
                            numberOfLines={1}
                          >
                            {item.qty}× {item.item_name}
                          </Text>
                          <Text style={[styles.builderItemPrice, { color: c.textTertiary }]}>
                            {formatCents(item.price_cents * item.qty)}
                          </Text>
                        </View>
                        <Pressable
                          onPress={() => handleMoveItem(item, account.id)}
                          disabled={!!activePaymentId}
                          style={({ pressed }) => [
                            styles.moveBtn,
                            { backgroundColor: c.bgBase, borderColor: c.borderSubtle },
                            pressed && !activePaymentId && { opacity: 0.7 },
                          ]}
                          accessibilityRole="button"
                          accessibilityLabel={t('pos.splitMove')}
                        >
                          <Text
                            style={[
                              styles.moveBtnText,
                              { color: activePaymentId ? c.textTertiary : c.brand },
                            ]}
                          >
                            {t('pos.splitMove')}
                          </Text>
                        </Pressable>
                      </View>
                    ))
                  )}
                </View>
              );
            })}

            {/* + Agregar cuenta */}
            <Pressable
              onPress={handleAddAccount}
              disabled={!!activePaymentId}
              style={({ pressed }) => [
                styles.addAccountBtn,
                { borderColor: c.borderSubtle },
                pressed && !activePaymentId && { opacity: 0.7 },
              ]}
              accessibilityRole="button"
            >
              <Text
                style={[
                  styles.addAccountBtnText,
                  { color: activePaymentId ? c.textTertiary : c.brand },
                ]}
              >
                {t('pos.splitAddAccount')}
              </Text>
            </Pressable>

            {/* Payment in-progress banner */}
            {isProcessing && checkoutPhaseLabel !== null && (
              <View
                style={[
                  styles.progressBanner,
                  { backgroundColor: c.brandLight, borderColor: c.brand },
                ]}
              >
                <ActivityIndicator color={c.brand} style={{ marginRight: 10 }} />
                <Text style={[styles.progressLabel, { color: c.brand }]}>
                  {checkoutPhaseLabel}
                </Text>
              </View>
            )}

            {/* Payment error banner */}
            {checkoutPhase === 'error' && checkoutError !== null && (
              <View
                style={[
                  styles.errorBanner,
                  { backgroundColor: c.danger + '18', borderColor: c.danger },
                ]}
              >
                <Text style={[styles.errorText, { color: c.danger }]}>
                  {checkoutError}
                </Text>
              </View>
            )}
          </>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            SPLIT CREATED — paid counter + list of checks (shared by both methods)
            ══════════════════════════════════════════════════════════════════ */}
        {splitPhase === 'split_created' && (
          <>
            {/* Paid counter */}
            <View
              style={[
                styles.counterBanner,
                {
                  backgroundColor: c.bgSurface,
                  borderColor: paidCount === totalCount ? c.success : c.borderSubtle,
                },
              ]}
            >
              <Text
                style={[
                  styles.counterText,
                  { color: paidCount === totalCount ? c.success : c.textSecondary },
                ]}
              >
                {t('pos.splitPaidOf', { paid: paidCount, total: totalCount })}
              </Text>
            </View>

            {/* Check list */}
            <View
              style={[
                styles.checkList,
                { backgroundColor: c.bgSurface, borderColor: c.borderSubtle },
              ]}
            >
              {checks.map((check, idx) => {
                const isPaid = paidIds.has(check.payment_id);
                const isCharging = activePaymentId === check.payment_id;
                const canCharge = !isPaid && !activePaymentId && readerStatus === 'ready';

                return (
                  <View key={check.payment_id}>
                    {idx > 0 && (
                      <View
                        style={[
                          styles.checkDivider,
                          { backgroundColor: c.borderSubtle },
                        ]}
                      />
                    )}
                    <View style={styles.checkRow}>
                      <View style={styles.checkInfo}>
                        <Text style={[styles.checkLabel, { color: c.textPrimary }]}>
                          {t('pos.splitPartN', { n: idx + 1 })}
                        </Text>
                        <Text style={[styles.checkAmount, { color: c.textSecondary }]}>
                          {formatCents(check.amount_cents)}
                        </Text>
                      </View>

                      {isPaid ? (
                        <View
                          style={[
                            styles.paidBadge,
                            { backgroundColor: c.success + '22' },
                          ]}
                        >
                          <IconCheck size={12} color={c.success} strokeWidth={2.5} />
                          <Text style={[styles.paidBadgeText, { color: c.success }]}>
                            {t('pos.splitPaid')}
                          </Text>
                        </View>
                      ) : (
                        <View style={styles.checkActions}>
                          <View
                            style={[
                              styles.pendingBadge,
                              { backgroundColor: c.textTertiary + '22' },
                            ]}
                          >
                            <Text
                              style={[styles.pendingBadgeText, { color: c.textTertiary }]}
                            >
                              {t('pos.splitPending')}
                            </Text>
                          </View>
                          <Pressable
                            onPress={() => handleTapChargeCheck(check)}
                            disabled={!canCharge}
                            style={({ pressed }) => [
                              styles.chargeBtn,
                              { backgroundColor: canCharge ? c.gold : c.borderSubtle },
                              pressed && canCharge && { opacity: 0.8 },
                            ]}
                            accessibilityRole="button"
                            accessibilityState={{ disabled: !canCharge }}
                          >
                            {isCharging ? (
                              <ActivityIndicator color="#fff" size="small" />
                            ) : (
                              <Text
                                style={[
                                  styles.chargeBtnText,
                                  { color: canCharge ? '#fff' : c.textTertiary },
                                ]}
                              >
                                {t('pos.splitCharge')}
                              </Text>
                            )}
                          </Pressable>
                        </View>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>

            {/* Payment in-progress banner */}
            {isProcessing && checkoutPhaseLabel !== null && (
              <View
                style={[
                  styles.progressBanner,
                  { backgroundColor: c.brandLight, borderColor: c.brand },
                ]}
              >
                <ActivityIndicator color={c.brand} style={{ marginRight: 10 }} />
                <Text style={[styles.progressLabel, { color: c.brand }]}>
                  {checkoutPhaseLabel}
                </Text>
              </View>
            )}

            {/* Payment error banner */}
            {checkoutPhase === 'error' && checkoutError !== null && (
              <View
                style={[
                  styles.errorBanner,
                  { backgroundColor: c.danger + '18', borderColor: c.danger },
                ]}
              >
                <Text style={[styles.errorText, { color: c.danger }]}>
                  {checkoutError}
                </Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1 },

  // ── Header ──────────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { padding: 4, marginRight: 8 },
  headerTitles: { flex: 1 },
  headerTitle: { fontSize: 18, fontWeight: '600' },
  headerSub: { fontSize: 13, marginTop: 1 },

  // ── Body ────────────────────────────────────────────────────────────────────
  scroll: { flex: 1 },
  scrollContent: { paddingTop: 20, paddingHorizontal: 16, gap: 14 },

  // ── Unavailable ─────────────────────────────────────────────────────────────
  unavailableBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  unavailableTitle: { fontSize: 17, fontWeight: '600', textAlign: 'center' },
  unavailableSub: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  unavailableBack: {
    marginTop: 8,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 32,
  },
  unavailableBackText: { color: '#fff', fontSize: 16, fontWeight: '600' },

  // ── Reader banner ────────────────────────────────────────────────────────────
  readerBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
  },
  readerBannerIcon: { width: 24, alignItems: 'center' },
  readerBannerText: { flex: 1, fontSize: 13, fontWeight: '500' },
  retryBtn: { padding: 6 },

  // ── Tab total card ────────────────────────────────────────────────────────────
  totalCard: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 18,
    paddingVertical: 14,
    alignItems: 'center',
  },
  totalCardLabel: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6 },
  totalCardAmount: { fontSize: 32, fontWeight: '700', marginTop: 4 },

  // ── Method selector ──────────────────────────────────────────────────────────
  methodSectionTitle: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    textAlign: 'center',
    marginBottom: 2,
  },
  methodCard: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 18,
    paddingVertical: 16,
    gap: 4,
  },
  methodCardTitle: { fontSize: 16, fontWeight: '600' },
  methodCardSub: { fontSize: 13, lineHeight: 18 },

  // ── Even method stepper ───────────────────────────────────────────────────────
  stepperCard: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 18,
    paddingVertical: 18,
    alignItems: 'center',
    gap: 14,
  },
  stepperQuestion: { fontSize: 14, fontWeight: '500', textAlign: 'center' },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 24 },
  stepperBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperCount: { fontSize: 34, fontWeight: '700', minWidth: 44, textAlign: 'center' },
  stepperHint: { fontSize: 12 },

  // ── Shared: split error + create button ──────────────────────────────────────
  splitError: { fontSize: 14, textAlign: 'center' },
  createBtn: { borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  createBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },

  // ── Items method builder ──────────────────────────────────────────────────────
  subAccountCard: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  subAccountHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  subAccountLabel: { fontSize: 14, fontWeight: '600', flex: 1, marginRight: 8 },
  subAccountHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  subAccountSubtotal: { fontSize: 13 },
  accountPayBtn: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    minWidth: 60,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 28,
  },
  accountPayBtnText: { fontSize: 12, fontWeight: '600' },
  subAccountEmpty: { fontSize: 13, paddingHorizontal: 14, paddingBottom: 10 },

  builderItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  builderItemInfo: { flex: 1 },
  builderItemName: { fontSize: 13 },
  builderItemPrice: { fontSize: 12, marginTop: 2 },

  moveBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  moveBtnText: { fontSize: 12, fontWeight: '500' },

  addAccountBtn: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  addAccountBtnText: { fontSize: 14, fontWeight: '500' },

  // ── Paid counter banner ───────────────────────────────────────────────────────
  counterBanner: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
  },
  counterText: { fontSize: 15, fontWeight: '600' },

  // ── Check list ────────────────────────────────────────────────────────────────
  checkList: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  checkDivider: { height: StyleSheet.hairlineWidth },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  checkInfo: { flex: 1 },
  checkLabel: { fontSize: 15, fontWeight: '600' },
  checkAmount: { fontSize: 13, marginTop: 2 },
  checkActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },

  paidBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  paidBadgeText: { fontSize: 12, fontWeight: '600' },

  pendingBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  pendingBadgeText: { fontSize: 12 },

  chargeBtn: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
    minWidth: 68,
    alignItems: 'center',
  },
  chargeBtnText: { fontSize: 14, fontWeight: '600' },

  // ── Progress / error banners ───────────────────────────────────────────────────
  progressBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  progressLabel: { fontSize: 14, fontWeight: '500' },

  errorBanner: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  errorText: { fontSize: 14 },

  // ── Tip picker footer (shared with the tip view early return) ─────────────────
  tipFooter: {
    paddingHorizontal: 16,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 10,
  },
  tipBackBtn: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tipBackBtnText: { fontSize: 15, fontWeight: '600' },
  tipConfirmBtn: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    gap: 2,
  },
  tipConfirmBtnText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  tipConfirmBtnSub: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    fontWeight: '500',
  },
});
