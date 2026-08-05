/**
 * JChat 3.0 — POS Checkout Screen (C2b)
 *
 * In-person card payment via Stripe Terminal (simulated reader for dev builds).
 * Rendered inside PosNavigator → inside StripeTerminalProvider.
 *
 * ── Flow ──────────────────────────────────────────────────────────────────────
 * 1. Load open orders for the table via posOpenOrders().
 * 2. Auto-discover + auto-connect to the first simulated reader on mount.
 * 3. Employee selects the order to charge (auto-selected when only one exists).
 * 4. Tap "Cobrar $X.XX":
 *    a. createPaymentIntent(orderId)   — amount server-side, never from client
 *    b. retrievePaymentIntent(secret)  — SDK needs the full PI object
 *    c. collectPaymentMethod(pi)       — simulated reader auto-collects
 *    d. confirmPaymentIntent(pi)       — confirms the payment
 *    e. markPaid(orderId)              — server verifies PI at Stripe, marks paid
 * 5. Success banner → auto-navigate back to PosHome (which refreshes badges).
 *
 * ── Security ──────────────────────────────────────────────────────────────────
 * • The charge amount comes exclusively from the server (orders.total_cents).
 * • No Stripe API keys on the client — connection token via Edge Function.
 * • markPaid() retrieves the PI directly from Stripe before updating the DB.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
  IconCreditCard,
  IconRefresh,
  IconWifi,
  IconWifiOff,
} from '@tabler/icons-react-native';
import { useStripeTerminal } from '@stripe/stripe-terminal-react-native';

import { palette } from '../../theme/tokens';
import { useThemeColors } from '../../theme/colors';
import { posOpenOrders, type PosOpenOrder } from '../../services/pos';
import { createPaymentIntent, markPaid } from '../../services/terminal';
import type { PosStackParamList } from '../../navigation/PosNavigator';

// ─── Nav types ────────────────────────────────────────────────────────────────

type PosCheckoutNav = NativeStackNavigationProp<PosStackParamList, 'PosCheckout'>;
type PosCheckoutRoute = RouteProp<PosStackParamList, 'PosCheckout'>;

// ─── Local types ──────────────────────────────────────────────────────────────

type ReaderStatus = 'discovering' | 'connecting' | 'ready' | 'error';

type CheckoutPhase =
  | 'idle'        // waiting for employee to tap "Cobrar"
  | 'creating'    // calling createPaymentIntent EF
  | 'retrieving'  // calling SDK retrievePaymentIntent
  | 'collecting'  // collectPaymentMethod on reader
  | 'confirming'  // confirmPaymentIntent
  | 'marking'     // calling markPaid EF
  | 'success'     // done
  | 'error';      // something went wrong

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function PosCheckoutScreen() {
  const c = useThemeColors();
  const { t } = useTranslation('settings');
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<PosCheckoutNav>();
  const route = useRoute<PosCheckoutRoute>();
  const { businessId, tableId, tableLabel } = route.params;

  // ── Stripe Terminal ─────────────────────────────────────────────────────────
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

  // ── Order data ──────────────────────────────────────────────────────────────
  const [orders, setOrders] = useState<PosOpenOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  // ── Checkout state ──────────────────────────────────────────────────────────
  const [phase, setPhase] = useState<CheckoutPhase>('idle');
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  // ── Load open orders on mount ───────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;
    posOpenOrders(businessId, tableId)
      .then((rows) => {
        if (!mounted) return;
        setOrders(rows);
        // Auto-select when there's only one order
        if (rows.length === 1) setSelectedOrderId(rows[0].id);
      })
      .catch(() => {
        if (mounted) setOrders([]);
      })
      .finally(() => {
        if (mounted) setOrdersLoading(false);
      });
    return () => { mounted = false; };
  }, [businessId, tableId]);

  // ── Start reader discovery on mount ────────────────────────────────────────
  useEffect(() => {
    setReaderStatus('discovering');
    discoverReaders({ discoveryMethod: 'bluetoothScan', simulated: true }).then((res) => {
      // discoverReaders resolves when scanning ends (cancelled or error).
      // If it ended with an error AND we're not already connecting/connected,
      // surface it as a reader error.
      if (res.error) {
        setReaderStatus((prev) =>
          prev === 'connecting' || prev === 'ready' ? prev : 'error',
        );
        setReaderError(res.error.message ?? t('pos.readerError'));
      }
    });

    return () => {
      // Cancel the ongoing scan when leaving this screen
      cancelDiscovering();
    };
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
      .then((result) => {
        if (result.error) {
          setReaderStatus('error');
          setReaderError(result.error.message ?? t('pos.readerError'));
          isConnectingRef.current = false;
        } else {
          setReaderStatus('ready');
          // isConnectingRef.current stays true (we're connected)
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
    return () => {
      disconnectReader().catch(() => {});
    };
  }, [disconnectReader]);

  // ── Retry reader connection ─────────────────────────────────────────────────
  const handleRetryReader = useCallback(() => {
    isConnectingRef.current = false;
    setReaderStatus('discovering');
    setReaderError(null);
    discoverReaders({ discoveryMethod: 'bluetoothScan', simulated: true });
  }, [discoverReaders]);

  // ── Charge ─────────────────────────────────────────────────────────────────
  const handleCharge = useCallback(async () => {
    const order = orders.find((o) => o.id === selectedOrderId);
    if (!order || !connectedReader) return;

    setCheckoutError(null);

    // ── Step 1: Create PaymentIntent server-side ──
    setPhase('creating');
    const piResult = await createPaymentIntent(order.id);
    if (!piResult.ok) {
      setPhase('error');
      switch (piResult.reason) {
        case 'already_paid':
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

    // ── Step 2: Retrieve PaymentIntent (SDK needs the full object) ──
    setPhase('retrieving');
    const retrieveResult = await retrievePaymentIntent(piResult.clientSecret);
    if (retrieveResult.error) {
      setPhase('error');
      setCheckoutError(retrieveResult.error.message ?? t('pos.errorPayment'));
      return;
    }

    // ── Step 3: Collect payment from reader (simulated: auto-collects) ──
    setPhase('collecting');
    const collectResult = await collectPaymentMethod({
      paymentIntent: retrieveResult.paymentIntent,
    });
    if (collectResult.error) {
      setPhase('error');
      setCheckoutError(collectResult.error.message ?? t('pos.errorPayment'));
      return;
    }

    // ── Step 4: Confirm payment ──
    setPhase('confirming');
    const confirmResult = await confirmPaymentIntent({
      paymentIntent: collectResult.paymentIntent,
    });
    if (confirmResult.error) {
      setPhase('error');
      setCheckoutError(confirmResult.error.message ?? t('pos.errorPayment'));
      return;
    }

    // ── Step 5: Mark paid server-side (server verifies at Stripe first) ──
    setPhase('marking');
    const markResult = await markPaid(order.id);
    if (!markResult.ok) {
      setPhase('error');
      if (markResult.reason === 'not_succeeded') {
        setCheckoutError(t('pos.errorNotSucceeded', { status: markResult.piStatus ?? 'unknown' }));
      } else if (markResult.reason === 'already_paid') {
        setCheckoutError(t('pos.errorAlreadyPaid'));
      } else {
        setCheckoutError(t('pos.errorMarkPaid'));
      }
      return;
    }

    // ── Success ──
    setPhase('success');
    // Navigate back after a short celebration pause so the employee sees the ✓
    setTimeout(() => {
      if (navigation.canGoBack()) navigation.goBack();
    }, 2200);
  }, [
    orders,
    selectedOrderId,
    connectedReader,
    retrievePaymentIntent,
    collectPaymentMethod,
    confirmPaymentIntent,
    navigation,
    t,
  ]);

  // ─── Derived state ──────────────────────────────────────────────────────────
  const selectedOrder = orders.find((o) => o.id === selectedOrderId) ?? null;
  const isProcessing =
    phase === 'creating' ||
    phase === 'retrieving' ||
    phase === 'collecting' ||
    phase === 'confirming' ||
    phase === 'marking';

  const canCharge =
    readerStatus === 'ready' &&
    selectedOrderId !== null &&
    !isProcessing &&
    phase !== 'success';

  // ── Phase label for the progress indicator ──────────────────────────────────
  const phaseLabel = (() => {
    switch (phase) {
      case 'creating':
      case 'retrieving':
        return t('pos.collecting'); // "Recolectando pago…" while creating
      case 'collecting':
        return t('pos.collecting');
      case 'confirming':
        return t('pos.confirming');
      case 'marking':
        return t('pos.markingPaid');
      case 'success':
        return t('pos.paymentSuccess');
      default:
        return null;
    }
  })();

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.screen, { backgroundColor: c.bgBase }]}>
      <StatusBar
        barStyle={c.bgBase === palette.bgBase ? 'light-content' : 'dark-content'}
      />

      {/* ── Header ── */}
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
          disabled={isProcessing || phase === 'success'}
        >
          <IconChevronLeft
            size={24}
            color={isProcessing || phase === 'success' ? c.textTertiary : c.brand}
            strokeWidth={2}
          />
        </Pressable>
        <View style={styles.headerTitles}>
          <Text style={[styles.headerTitle, { color: c.textPrimary }]} numberOfLines={1}>
            {t('pos.checkoutTitle')}
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
        {/* ── Reader status banner ── */}
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
              : readerStatus === 'connecting'
              ? t('pos.readerConnecting')
              : t('pos.readerConnecting')}
          </Text>

          {readerStatus === 'error' ? (
            <Pressable
              onPress={handleRetryReader}
              style={styles.retryBtn}
              accessibilityRole="button"
              accessibilityLabel={t('pos.readerRetry')}
            >
              <IconRefresh size={16} color={c.danger} strokeWidth={2} />
            </Pressable>
          ) : null}
        </View>

        {/* ── Orders section ── */}
        {ordersLoading ? (
          <View style={styles.ordersLoading}>
            <ActivityIndicator color={c.brand} />
          </View>
        ) : orders.length === 0 ? (
          <View style={[styles.emptyOrders, { borderColor: c.borderSubtle }]}>
            <Text style={[styles.emptyOrdersText, { color: c.textTertiary }]}>
              {t('pos.noOpenOrders')}
            </Text>
          </View>
        ) : (
          <View style={styles.ordersSection}>
            {orders.length > 1 ? (
              <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>
                {t('pos.selectOrder')}
              </Text>
            ) : null}

            {orders.map((order) => {
              const isSelected = order.id === selectedOrderId;
              return (
                <Pressable
                  key={order.id}
                  onPress={() => setSelectedOrderId(order.id)}
                  style={({ pressed }) => [
                    styles.orderCard,
                    {
                      backgroundColor: isSelected ? c.brandLight : c.bgSurface,
                      borderColor: isSelected ? c.brand : c.borderSubtle,
                    },
                    pressed && !isSelected && { opacity: 0.72 },
                  ]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected }}
                >
                  <View style={styles.orderCardMain}>
                    <Text style={[styles.orderAmount, { color: c.textPrimary }]}>
                      {formatCents(order.total_cents)}
                    </Text>
                    <Text style={[styles.orderMeta, { color: c.textTertiary }]}>
                      {formatDate(order.created_at)}
                      {order.status ? ` · ${order.status}` : ''}
                    </Text>
                  </View>
                  {isSelected ? (
                    <View style={[styles.orderCheck, { backgroundColor: c.brand }]}>
                      <IconCheck size={14} color="#fff" strokeWidth={3} />
                    </View>
                  ) : (
                    <View style={[styles.orderCheckEmpty, { borderColor: c.borderSubtle }]} />
                  )}
                </Pressable>
              );
            })}
          </View>
        )}

        {/* ── Payment progress / success ── */}
        {(isProcessing || phase === 'success') && phaseLabel ? (
          <View
            style={[
              styles.progressBanner,
              {
                backgroundColor: c.brandLight,
                borderColor: phase === 'success' ? c.success : c.brand,
              },
            ]}
          >
            {phase === 'success' ? (
              <View style={[styles.successIcon, { backgroundColor: c.success }]}>
                <IconCheck size={20} color="#fff" strokeWidth={3} />
              </View>
            ) : (
              <ActivityIndicator color={c.brand} style={{ marginRight: 10 }} />
            )}
            <View>
              <Text
                style={[
                  styles.progressLabel,
                  { color: phase === 'success' ? c.success : c.brand },
                ]}
              >
                {phaseLabel}
              </Text>
              {phase === 'success' ? (
                <Text style={[styles.progressSub, { color: c.success }]}>
                  {t('pos.paymentSuccessMsg')}
                </Text>
              ) : null}
            </View>
          </View>
        ) : null}

        {/* ── Checkout error ── */}
        {phase === 'error' && checkoutError ? (
          <View style={[styles.errorBanner, { backgroundColor: c.brandLight, borderColor: c.danger }]}>
            <Text style={[styles.errorText, { color: c.danger }]}>{checkoutError}</Text>
            <Pressable
              onPress={() => { setPhase('idle'); setCheckoutError(null); }}
              style={[styles.errorRetry, { borderColor: c.danger }]}
              accessibilityRole="button"
              accessibilityLabel={t('pos.readerRetry')}
            >
              <Text style={[styles.errorRetryText, { color: c.danger }]}>
                {t('pos.readerRetry')}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>

      {/* ── Charge button (pinned to bottom) ── */}
      <View
        style={[
          styles.footer,
          { paddingBottom: insets.bottom + 16, borderTopColor: c.borderSubtle, backgroundColor: c.bgBase },
        ]}
      >
        <Pressable
          onPress={handleCharge}
          disabled={!canCharge}
          style={({ pressed }) => [
            styles.chargeBtn,
            { backgroundColor: canCharge ? c.brand : c.borderSubtle },
            pressed && canCharge && { opacity: 0.82 },
          ]}
          accessibilityRole="button"
          accessibilityLabel={
            selectedOrder
              ? t('pos.chargeButton', { amount: formatCents(selectedOrder.total_cents) })
              : t('pos.cobrar')
          }
        >
          <IconCreditCard size={20} color="#fff" strokeWidth={2} />
          <Text style={styles.chargeBtnText}>
            {selectedOrder
              ? t('pos.chargeButton', { amount: formatCents(selectedOrder.total_cents) })
              : t('pos.cobrar')}
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
    alignItems: 'center',
    paddingHorizontal: H_PAD,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { marginRight: 10, padding: 4 },
  headerTitles: { flex: 1 },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  headerSub: { fontSize: 13, marginTop: 1 },

  // ── Scroll ───────────────────────────────────────────────────────────────────
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: H_PAD, paddingTop: 16, gap: 16 },

  // ── Reader banner ────────────────────────────────────────────────────────────
  readerBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  readerBannerIcon: { width: 22, alignItems: 'center' },
  readerBannerText: { flex: 1, fontSize: 14, fontWeight: '500' },
  retryBtn: { padding: 4 },

  // ── Orders ────────────────────────────────────────────────────────────────────
  ordersLoading: { height: 80, alignItems: 'center', justifyContent: 'center' },

  emptyOrders: {
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    paddingVertical: 24,
    alignItems: 'center',
  },
  emptyOrdersText: { fontSize: 14 },

  ordersSection: { gap: 10 },
  sectionLabel: { fontSize: 13, fontWeight: '600', marginBottom: 2 },

  orderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 16,
    gap: 12,
  },
  orderCardMain: { flex: 1, gap: 4 },
  orderAmount: { fontSize: 26, fontWeight: '700', letterSpacing: -0.5 },
  orderMeta: { fontSize: 13 },

  orderCheck: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderCheckEmpty: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
  },

  // ── Progress banner ────────────────────────────────────────────────────────────
  progressBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  successIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressLabel: { fontSize: 15, fontWeight: '700' },
  progressSub: { fontSize: 13, marginTop: 2 },

  // ── Error banner ────────────────────────────────────────────────────────────────
  errorBanner: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  errorText: { fontSize: 14, fontWeight: '500', lineHeight: 20 },
  errorRetry: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  errorRetryText: { fontSize: 13, fontWeight: '600' },

  // ── Footer ─────────────────────────────────────────────────────────────────────
  footer: {
    paddingHorizontal: H_PAD,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  chargeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  chargeBtnText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
});
