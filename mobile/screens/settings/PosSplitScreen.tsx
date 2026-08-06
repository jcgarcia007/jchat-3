/**
 * JChat 3.0 — POS Split Screen (C11)
 *
 * Splits the open tab of a table into N equal parts and charges each one
 * individually via Stripe Terminal.
 *
 * ── Flow ──────────────────────────────────────────────────────────────────────
 * 1. Load tab total preview (display-only) from posTableItems().
 * 2. Employee sets N (default = partySize param or 2, range 2–20).
 * 3. "Crear división" → posCreateSplit(businessId, tableId, 'even', N)
 *    → server creates N pos_payments rows, each with amount_cents computed
 *    server-side. Client receives PosSplitCheckRow[].
 * 4. For each part:
 *    a. chargeSplitCheck(payment_id)  — creates PI on connected Stripe account
 *    b. retrievePaymentIntent(secret) — SDK needs the full PI object
 *    c. collectPaymentMethod(pi)      — simulated reader auto-collects
 *    d. confirmPaymentIntent(pi)      — confirms the payment
 *    e. markTabPaid(payment_id)       — server verifies PI at Stripe; marks
 *       orders as paid, returns tabClosed when all parts are settled
 * 5. When markTabPaid returns tabClosed:true → alert + navigate back.
 *
 * ── Security ──────────────────────────────────────────────────────────────────
 * • Amount comes exclusively from pos_payments.amount_cents (server-side).
 * • Client sends only method + N — no amounts ever travel from the client.
 * • markTabPaid() retrieves the PI directly from Stripe before updating the DB.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { useStripeTerminal, isTerminalAvailable } from '../../services/terminalSdk';

import { palette } from '../../theme/tokens';
import { useThemeColors } from '../../theme/colors';
import { posTableItems, posCreateSplit } from '../../services/pos';
import type { PosSplitCheckRow } from '../../services/pos';
import { chargeSplitCheck, markTabPaid } from '../../services/terminal';
import type { PosStackParamList } from '../../navigation/PosNavigator';

// ─── Nav types ────────────────────────────────────────────────────────────────

type PosSplitNav = NativeStackNavigationProp<PosStackParamList, 'PosSplit'>;
type PosSplitRoute = RouteProp<PosStackParamList, 'PosSplit'>;

// ─── Local types ──────────────────────────────────────────────────────────────

/** Outer phase: setup = N stepper + create button; split_created = charge list. */
type SplitPhase = 'setup' | 'split_created';

/**
 * Inner per-payment phase while charging a single part.
 * Resets to 'idle' after each successful payment so the next part can be charged.
 */
type CheckoutPhase =
  | 'idle'       // waiting for employee to tap "Cobrar"
  | 'creating'   // calling chargeSplitCheck EF
  | 'retrieving' // calling SDK retrievePaymentIntent
  | 'collecting' // collectPaymentMethod on reader
  | 'confirming' // confirmPaymentIntent
  | 'marking'    // calling markTabPaid EF
  | 'error';     // something went wrong — employee can retry

type ReaderStatus = 'discovering' | 'connecting' | 'ready' | 'error';

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

  // ── Stripe Terminal ─────────────────────────────────────────────────────────
  // All hooks called unconditionally (Rules of Hooks). Stub values returned by
  // terminalSdk when !isTerminalAvailable are safe (no-ops / empty arrays).
  const {
    discoverReaders,
    cancelDiscovering,
    connectReader,
    retrievePaymentIntent,
    collectPaymentMethod,
    confirmPaymentIntent,
    disconnectReader,
    discoveredReaders,
    connectedReader,
  } = useStripeTerminal();

  // ── Reader state ────────────────────────────────────────────────────────────
  const [readerStatus, setReaderStatus] = useState<ReaderStatus>('discovering');
  const [readerError, setReaderError] = useState<string | null>(null);
  // Guard against double-connect race when discoveredReaders fires multiple times
  const isConnectingRef = useRef(false);

  // ── Tab total (preview — display only; authoritative amount from server) ────
  const [tabAmountCents, setTabAmountCents] = useState<number | null>(null);
  const [tabLoading, setTabLoading] = useState(true);

  // ── Split setup ─────────────────────────────────────────────────────────────
  const defaultWays = Math.max(MIN_WAYS, Math.min(MAX_WAYS, partySizeHint ?? MIN_WAYS));
  const [ways, setWays] = useState<number>(defaultWays);
  const [splitPhase, setSplitPhase] = useState<SplitPhase>('setup');
  const [splitting, setSplitting] = useState(false);
  const [splitError, setSplitError] = useState<string | null>(null);
  const [checks, setChecks] = useState<PosSplitCheckRow[]>([]);

  // ── Per-part payment state ──────────────────────────────────────────────────
  /** Set of payment_ids that have been successfully charged. */
  const [paidIds, setPaidIds] = useState<Set<string>>(new Set());
  /** payment_id currently being charged (null = none). */
  const [activePaymentId, setActivePaymentId] = useState<string | null>(null);
  const [checkoutPhase, setCheckoutPhase] = useState<CheckoutPhase>('idle');
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  // ── Load tab total preview on mount ────────────────────────────────────────
  useEffect(() => {
    let mounted = true;
    posTableItems(businessId, tableId)
      .then((rows) => {
        if (!mounted) return;
        const total = rows.reduce((sum, r) => sum + r.price_cents * r.qty, 0);
        setTabAmountCents(total > 0 ? total : null);
      })
      .catch(() => { if (mounted) setTabAmountCents(null); })
      .finally(() => { if (mounted) setTabLoading(false); });
    return () => { mounted = false; };
  }, [businessId, tableId]);

  // ── Start reader discovery on mount ────────────────────────────────────────
  // Starting early so the reader is ready by the time the employee creates the split.
  useEffect(() => {
    setReaderStatus('discovering');
    discoverReaders({ discoveryMethod: 'bluetoothScan', simulated: true }).then(
      (res: { error?: { message: string } | null }) => {
        if (res.error) {
          setReaderStatus((prev) =>
            prev === 'connecting' || prev === 'ready' ? prev : 'error',
          );
          setReaderError(res.error.message ?? t('pos.readerError'));
        }
      },
    );
    return () => { cancelDiscovering(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally empty — runs only on mount

  // ── Auto-connect when first reader appears ─────────────────────────────────
  useEffect(() => {
    if (
      discoveredReaders.length === 0 ||
      connectedReader ||
      isConnectingRef.current ||
      readerStatus === 'ready'
    ) {
      return;
    }

    isConnectingRef.current = true;
    setReaderStatus('connecting');
    const reader = discoveredReaders[0];

    cancelDiscovering()
      .then(() =>
        connectReader({
          discoveryMethod: 'bluetoothScan',
          reader,
          locationId: reader.locationId ?? reader.location?.id ?? '',
        }),
      )
      .then((result: { error?: { message: string } | null }) => {
        if (result.error) {
          setReaderStatus('error');
          setReaderError(result.error.message ?? t('pos.readerError'));
          isConnectingRef.current = false;
        } else {
          setReaderStatus('ready');
          // isConnectingRef stays true (we're connected — prevents re-connect)
        }
      })
      .catch((err: unknown) => {
        setReaderStatus('error');
        setReaderError(err instanceof Error ? err.message : t('pos.readerError'));
        isConnectingRef.current = false;
      });
  }, [discoveredReaders, connectedReader, readerStatus, cancelDiscovering, connectReader, t]);

  // ── Disconnect reader when leaving the screen ───────────────────────────────
  useEffect(() => {
    return () => { disconnectReader().catch(() => {}); };
  }, [disconnectReader]);

  // ── Retry reader connection ─────────────────────────────────────────────────
  const handleRetryReader = useCallback(() => {
    isConnectingRef.current = false;
    setReaderStatus('discovering');
    setReaderError(null);
    discoverReaders({ discoveryMethod: 'bluetoothScan', simulated: true });
  }, [discoverReaders]);

  // ── N stepper ────────────────────────────────────────────────────────────────
  const handleDecrement = useCallback(
    () => setWays((w) => Math.max(MIN_WAYS, w - 1)),
    [],
  );
  const handleIncrement = useCallback(
    () => setWays((w) => Math.min(MAX_WAYS, w + 1)),
    [],
  );

  // ── Create split ──────────────────────────────────────────────────────────────
  const handleCreateSplit = useCallback(async () => {
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

  // ── Charge a single part ──────────────────────────────────────────────────────
  const handleChargeCheck = useCallback(
    async (paymentId: string) => {
      // Guard: only one payment at a time, reader must be connected
      if (!connectedReader || activePaymentId) return;

      setActivePaymentId(paymentId);
      setCheckoutPhase('creating');
      setCheckoutError(null);

      // ── Step 1: Create PI for this check (amount from server) ──
      const piResult = await chargeSplitCheck(paymentId);
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

      // ── Step 2: Retrieve PI (SDK needs the full object) ──
      setCheckoutPhase('retrieving');
      const retrieveResult = await retrievePaymentIntent(piResult.clientSecret);
      if (retrieveResult.error) {
        setCheckoutPhase('error');
        setActivePaymentId(null);
        setCheckoutError(retrieveResult.error.message ?? t('pos.errorPayment'));
        return;
      }

      // ── Step 3: Collect payment from reader ──
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

      // ── Step 4: Confirm payment ──
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

      // ── Step 5: markTabPaid — server verifies PI at Stripe, marks orders ──
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

      // When all parts are settled, server closes the tab → inform + go back
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

  // ── Terminal unavailable guard ────────────────────────────────────────────────
  // All hooks run unconditionally above (Rules of Hooks). Stub values are safe:
  // discoveredReaders=[] → auto-connect never fires; disconnect → no-op.
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
        {/* ── Reader status banner (always shown so employee knows reader state) ── */}
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
            SETUP PHASE — N stepper + "Crear división" button
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

            {/* Error from posCreateSplit */}
            {splitError !== null && (
              <Text style={[styles.splitError, { color: c.danger }]}>{splitError}</Text>
            )}

            {/* Create split button */}
            <Pressable
              onPress={() => void handleCreateSplit()}
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
            SPLIT CREATED PHASE — paid counter + list of checks
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
                        /* ── Paid badge ── */
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
                        /* ── Pending + charge button ── */
                        <View style={styles.checkActions}>
                          <View
                            style={[
                              styles.pendingBadge,
                              { backgroundColor: c.textTertiary + '22' },
                            ]}
                          >
                            <Text
                              style={[
                                styles.pendingBadgeText,
                                { color: c.textTertiary },
                              ]}
                            >
                              {t('pos.splitPending')}
                            </Text>
                          </View>
                          <Pressable
                            onPress={() => void handleChargeCheck(check.payment_id)}
                            disabled={!canCharge}
                            style={({ pressed }) => [
                              styles.chargeBtn,
                              {
                                backgroundColor: canCharge ? c.gold : c.borderSubtle,
                              },
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

            {/* ── Payment in-progress banner ── */}
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

            {/* ── Payment error banner ── */}
            {checkoutPhase === 'error' && checkoutError !== null && (
              <View
                style={[
                  styles.errorBanner,
                  // eslint-disable-next-line react-native/no-inline-styles
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

  // ── Tab total card ───────────────────────────────────────────────────────────
  totalCard: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 18,
    paddingVertical: 14,
    alignItems: 'center',
  },
  totalCardLabel: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6 },
  totalCardAmount: { fontSize: 32, fontWeight: '700', marginTop: 4 },

  // ── N stepper card ───────────────────────────────────────────────────────────
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

  // ── Split error ───────────────────────────────────────────────────────────────
  splitError: { fontSize: 14, textAlign: 'center' },

  // ── Create button ─────────────────────────────────────────────────────────────
  createBtn: { borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  createBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },

  // ── Paid counter banner ────────────────────────────────────────────────────────
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
});
