/**
 * JChat 3.0 — CheckoutScreen (Task 3.5, reworked for the server quote)
 *
 * Single-scroll express checkout. Arrived at from CartScreen via
 * CommonActions.navigate({ name: 'Checkout' }).
 *
 * The app does NOT compute money. On entry, and whenever the cart or the tip changes
 * (debounced 400 ms), it asks the server for a quote (payments / quote_order) and shows
 * EXACTLY what comes back: lines with the server's names and prices, subtotal, tax with its
 * rate, tip and total. Pay stays disabled while a quote is loading or failed.
 *
 * ── Payment flow ──────────────────────────────────────────────────────────────
 * a. Tap "Pay" → processing starts at once (no double taps) → Face ID / biometrics.
 *    A failed verification asks "Try again / Cancel" and never pays; a device without
 *    biometrics goes straight on.
 * b. initAndPresentPaymentSheet with ONE idempotency key per quote and visit (q_<quote_hash>_<nonce>) and
 *    expected_total_cents = the total shown. If the server says TOTAL_CHANGED, nothing is
 *    charged: the new breakdown is shown and the screen re-quotes.
 * c. On success the app polls orders.stripe_pi_id (the webhook creates the order) for up to
 *    15 s, then opens PaymentSuccess with the real order number, or in "processing" mode.
 *
 * Colors: useThemeColors() + palette — NO hardcoded hex.
 * Icons: @tabler/icons-react-native.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { authenticateAsync } from 'expo-local-authentication';

import {
  IconArrowLeft,
  IconEdit,
  IconLock,
  IconShoppingBag,
} from '@tabler/icons-react-native';

import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import { useCart } from '../../context/CartContext';
import { useAuth } from '../../context/AuthContext';
import { initAndPresentPaymentSheet, quoteOrder, QuoteError } from '../../services/stripe';
import { fetchVenueAccess, readVenueCoords } from '../../services/venueAccess';
import { supabase, isSupabaseConfigured } from '../../services/supabase';
import type { OrderItemInput, OrderQuote, OrderRequest } from '../../services/stripe';
import { getOrderByPaymentIntent } from '../../services/orders';
import type { PaidOrderSummary } from '../../services/orders';
import { formatCents } from '../../utils/currency';
import type { MainStackParamList } from '../../navigation/AppNavigator';
import { toUserMessage } from '../../utils/errors';

// ── Types ──────────────────────────────────────────────────────────────────────

type CheckoutNav = NativeStackNavigationProp<MainStackParamList>;

type TipPreset = 10 | 15 | 20 | 'custom';

type QuoteState =
  | { status: 'loading'; quote: OrderQuote | null }
  | { status: 'ready'; quote: OrderQuote }
  | { status: 'error'; message: string; quote: OrderQuote | null }
  // Golden rule: the server says this order type isn't allowed from where the person is.
  | { status: 'venue'; quote: null; pickupAvailable: boolean };

// ── Constants ─────────────────────────────────────────────────────────────────

/** outside_venue / pickup_disabled from the quote or payment call (code or message, any case). */
function isVenueRefusal(error: unknown): boolean {
  const e = error as { code?: unknown; message?: unknown } | null;
  return [e?.code, e?.message].some((v) => typeof v === 'string' && /^(outside_venue|pickup_disabled)$/i.test(v));
}

const TIP_PRESETS: TipPreset[] = [10, 15, 20, 'custom'];

/** How long the cart/tip must stay still before asking the server for a new quote. */
const QUOTE_DEBOUNCE_MS = 400;
/** After paying, how long we wait for the webhook to create the order. */
const ORDER_POLL_ATTEMPTS = 15;
const ORDER_POLL_INTERVAL_MS = 1000;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** 0.07 → "7", 0.0725 → "7.25": the rate exactly as the server returned it. */
function formatTaxRate(rate: number): string {
  return String(parseFloat((rate * 100).toFixed(3)));
}

/**
 * Idempotency key for ONE payment attempt of ONE quote: `q_<quote_hash>_<nonce>`.
 * The hash makes it change with the quote; the nonce (random per checkout visit, rotated when
 * the table/room/gift/order type change or a server error leaves the PaymentIntent unusable)
 * stops a later identical order from replaying an old, already-paid PaymentIntent. A retry of
 * the same quote in the same visit reuses the key.
 */
function makeAttemptNonce(): string {
  return Math.random().toString(36).slice(2, 10).padEnd(8, '0');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Sub-component: Processing Overlay ─────────────────────────────────────────

interface ProcessingOverlayProps {
  visible: boolean;
  colors: ReturnType<typeof useThemeColors>;
}

function ProcessingOverlay({ visible, colors: c }: ProcessingOverlayProps) {
  const { t } = useTranslation('pos');
  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      statusBarTranslucent
    >
      <View style={overlayStyles.backdrop}>
        <View style={[overlayStyles.card, { backgroundColor: c.bgElevated }]}>
          <ActivityIndicator size="large" color={palette.brand} />
          <Text style={[overlayStyles.text, { color: c.textPrimary }]}>
            {t('checkout.processing')}
          </Text>
          <Text style={[overlayStyles.sub, { color: c.textSecondary }]}>
            {t('checkout.processingSub')}
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const overlayStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: palette.scrim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    borderRadius: 20,
    paddingHorizontal: 40,
    paddingVertical: 36,
    alignItems: 'center',
    gap: 14,
    minWidth: 240,
  },
  text: {
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  sub: {
    fontSize: 13,
    textAlign: 'center',
  },
});

// ── Sub-component: Error Bottom Sheet ─────────────────────────────────────────

interface ErrorSheetProps {
  visible: boolean;
  errorMessage: string;
  onRetry: () => void;
  onDismiss: () => void;
  colors: ReturnType<typeof useThemeColors>;
}

function ErrorSheet({ visible, errorMessage, onRetry, onDismiss, colors: c }: ErrorSheetProps) {
  const { t } = useTranslation('pos');
  return (
    <Modal
      transparent
      animationType="slide"
      visible={visible}
      statusBarTranslucent
      onRequestClose={onDismiss}
    >
      <Pressable
        style={sheetStyles.scrim}
        onPress={onDismiss}
        accessible={false}
      />
      <View style={[sheetStyles.sheet, { backgroundColor: c.bgElevated }]}>
        {/* Drag handle */}
        <View style={[sheetStyles.handle, { backgroundColor: c.borderSubtle }]} />

        {/* Icon */}
        <View style={[sheetStyles.iconCircle, { backgroundColor: `${palette.danger}1f` }]}>
          <IconLock size={32} color={palette.danger} strokeWidth={2} />
        </View>

        <Text style={[sheetStyles.title, { color: c.textPrimary }]}>
          {t('checkout.paymentFailed')}
        </Text>
        <Text style={[sheetStyles.message, { color: c.textSecondary }]}>
          {errorMessage || t('checkout.paymentError')}
        </Text>

        {/* Actions */}
        <View style={sheetStyles.actions}>
          <Pressable
            onPress={onRetry}
            style={({ pressed }) => [
              sheetStyles.retryBtn,
              { backgroundColor: palette.brand, opacity: pressed ? 0.85 : 1 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={t('checkout.retryA11y')}
          >
            <Text style={sheetStyles.retryBtnText}>{t('checkout.tryAgain')}</Text>
          </Pressable>

          <Pressable
            onPress={onDismiss}
            style={({ pressed }) => [
              sheetStyles.cancelBtn,
              { borderColor: c.borderSubtle, opacity: pressed ? 0.7 : 1 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={t('actions.cancel', { ns: 'common' })}
          >
            <Text style={[sheetStyles.cancelBtnText, { color: c.textSecondary }]}>
              {t('actions.cancel', { ns: 'common' })}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const sheetStyles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: palette.scrim,
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingHorizontal: 24,
    paddingBottom: 40,
    alignItems: 'center',
    gap: 12,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: 8,
  },
  iconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 8,
  },
  actions: {
    width: '100%',
    gap: 10,
    marginTop: 8,
  },
  retryBtn: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  retryBtnText: {
    color: palette.bgSurfaceLight,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  cancelBtn: {
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
});

// ── Main Component ─────────────────────────────────────────────────────────────

export default function CheckoutScreen() {
  const c = useThemeColors();
  const { t } = useTranslation('pos');
  const navigation = useNavigation<CheckoutNav>();
  const { user } = useAuth();
  const cart = useCart();

  const {
    lines,
    orderType,
    giftRecipientId,
    tableLabel,
    subtotalCents,
    businessId,
    roomId,
    clear,
    setOrderType,
  } = cart;

  // ── Local state ──────────────────────────────────────────────────────────────

  const [tipPreset, setTipPreset] = useState<TipPreset>(15);
  const [customTipInput, setCustomTipInput] = useState('');
  const [processing, setProcessing] = useState(false);
  const [errorVisible, setErrorVisible] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [quoteState, setQuoteState] = useState<QuoteState>({ status: 'loading', quote: null });
  /** Bumped to force a new quote (Retry, or after the server said the total changed). */
  const [quoteNonce, setQuoteNonce] = useState(0);

  // Synchronous guards: state updates are too late to stop a fast double tap, and effects
  // must ignore answers that belong to an older cart.
  const processingRef = useRef(false);
  const attemptRef = useRef<{ paramKey: string; nonce: string } | null>(null);
  const quoteSeqRef = useRef(0);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Animated scale for pay button press
  const payBtnScale = useRef(new Animated.Value(1)).current;

  const quote = quoteState.quote;

  // ── Tip ──────────────────────────────────────────────────────────────────────
  // Presets are a percentage of the SERVER subtotal once there is a quote (the cart's own
  // number only until then). The tip is the one amount the server accepts from the app.

  const tipBaseCents = quote?.subtotal_cents ?? subtotalCents;
  const tipCents = useMemo<number>(() => {
    if (tipPreset === 'custom') {
      const parsed = parseFloat(customTipInput.replace(/[^0-9.]/g, ''));
      if (!isNaN(parsed) && parsed >= 0) {
        return Math.round(parsed * 100);
      }
      return 0;
    }
    return Math.round(tipBaseCents * (tipPreset / 100));
  }, [tipPreset, customTipInput, tipBaseCents]);

  // ── What the server is asked to price (ids, quantities and selected option labels only) ──

  const orderItems = useMemo<OrderItemInput[]>(
    () => lines.map((l) => ({
      menuItemId: l.item.id,
      qty: l.qty,
      // Labels only: the server resolves every price (and checks required groups) from the DB.
      options: {
        size: l.size?.label ?? null,
        extras: (l.extras ?? []).map((e) => e.label),
        modifiers: (l.modifierSelections ?? []).map((g) => ({
          g: g.groupId,
          c: g.choices.map((ch) => ch.label),
        })),
      },
      specialInstructions: l.specialInstructions ?? null,
    })),
    [lines],
  );
  const itemsKey = useMemo(() => JSON.stringify(orderItems), [orderItems]);

  const buildRequest = useCallback((): OrderRequest => ({
    businessId: businessId ?? '',
    roomId: roomId ?? null,
    orderType,
    giftRecipientId,
    tableLabel,
    tipCents,
    items: orderItems,
  }), [businessId, roomId, orderType, giftRecipientId, tableLabel, tipCents, orderItems]);

  // ── Quote: on entry and whenever the cart or the tip changes (debounced) ─────

  useEffect(() => {
    if (!businessId || lines.length === 0) return;
    const quoteId = ++quoteSeqRef.current;
    const stale = () => quoteId !== quoteSeqRef.current || !mountedRef.current;
    setQuoteState((previous) => (previous.status === 'venue' ? { status: 'loading', quote: null } : { status: 'loading', quote: previous.quote }));
    const timer = setTimeout(() => {
      void (async () => {
        // Golden rule, client side: ask the server first what this person may order from here, so the
        // refusal is shown as such (never as a "check your connection" error). A failed check is not a
        // verdict: we go on and the quote (which applies the same gate) decides.
        try {
          const access = await fetchVenueAccess(businessId, await readVenueCoords());
          if (stale()) return;
          if (!access.failed && !access.allowedTypes.includes(orderType)) {
            setQuoteState({ status: 'venue', quote: null, pickupAvailable: access.allowedTypes.includes('counter') });
            return;
          }
        } catch {
          // fall through to the quote
        }
        try {
          const fresh = await quoteOrder(buildRequest());
          if (!stale()) setQuoteState({ status: 'ready', quote: fresh });
        } catch (error: unknown) {
          if (stale()) return;
          console.warn('[checkout] quote failed:', error);
          if (isVenueRefusal(error)) {
            // The quote's own gate refused: re-read what is allowed to know if pick-up exists.
            const access = await fetchVenueAccess(businessId, await readVenueCoords()).catch(() => null);
            if (stale()) return;
            setQuoteState({ status: 'venue', quote: null, pickupAvailable: access?.allowedTypes.includes('counter') === true });
            return;
          }
          const message = toUserMessage(error, 'pos:checkout.quoteError');
          setQuoteState((previous) => ({ status: 'error', message, quote: previous.quote }));
        }
      })();
    }, QUOTE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // buildRequest already depends on every input of the request; itemsKey/nonce re-trigger it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId, lines.length, itemsKey, tipCents, orderType, giftRecipientId, tableLabel, roomId, quoteNonce]);

  // Business name for the golden-rule copy ("To order you need to be at {business}").
  const [businessName, setBusinessName] = useState('');
  useEffect(() => {
    if (!businessId || !isSupabaseConfigured) return;
    let alive = true;
    void supabase
      .from('businesses')
      .select('name')
      .eq('id', businessId)
      .maybeSingle()
      .then(({ data }) => {
        if (alive && data?.name) setBusinessName(data.name);
      });
    return () => {
      alive = false;
    };
  }, [businessId]);

  /** "Allow location / Retry": re-reads the location (prompting if needed) and asks the server again. */
  const handleVenueRetry = useCallback(() => {
    void readVenueCoords(true).then(() => setQuoteNonce((n) => n + 1));
  }, []);

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleBack = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const handleEditOrder = useCallback(() => {
    // Go back to cart; goBack() works if Cart is directly behind Checkout.
    navigation.goBack();
  }, [navigation]);

  const handleTipPreset = useCallback((preset: TipPreset) => {
    setTipPreset(preset);
    if (preset !== 'custom') {
      setCustomTipInput('');
    }
  }, []);

  const handleRetryQuote = useCallback(() => setQuoteNonce((n) => n + 1), []);

  // ── Animate pay button ────────────────────────────────────────────────────────

  const animatePayBtn = useCallback((toValue: number) => {
    Animated.spring(payBtnScale, {
      toValue,
      useNativeDriver: true,
      tension: 200,
      friction: 10,
    }).start();
  }, [payBtnScale]);

  // ── Core payment flow ─────────────────────────────────────────────────────────

  /** The webhook creates the order a moment after the payment: look for it for up to 15 s. */
  const waitForPaidOrder = useCallback(async (paymentIntentId: string): Promise<PaidOrderSummary | null> => {
    for (let attempt = 0; attempt < ORDER_POLL_ATTEMPTS; attempt += 1) {
      if (!mountedRef.current) return null;
      try {
        const found = await getOrderByPaymentIntent(paymentIntentId);
        if (found) return found;
      } catch (error) {
        console.warn('[checkout] order lookup failed (will retry):', error);
      }
      await sleep(ORDER_POLL_INTERVAL_MS);
    }
    return null;
  }, []);

  const handlePay = useCallback(async () => {
    if (processingRef.current) return; // synchronous double-tap guard
    const current = quoteState.status === 'ready' ? quoteState.quote : null;
    if (!current) return; // the button is disabled without a ready quote

    if (!user?.id) {
      Alert.alert(t('checkout.signInRequired'));
      return;
    }

    // Processing starts BEFORE the biometric prompt, so a second tap can't start another flow.
    processingRef.current = true;
    setProcessing(true);
    try {
      // ── Biometric authentication ────────────────────────────────────────────
      let bioResult: { success: boolean };
      try {
        bioResult = await authenticateAsync({
          promptMessage: t('checkout.bioPrompt', { amount: formatCents(current.total_cents) }),
          fallbackLabel: t('checkout.bioFallback'),
          cancelLabel: t('actions.cancel', { ns: 'common' }),
          disableDeviceFallback: false,
        });
      } catch {
        // Device doesn't support biometrics — go straight to Stripe
        bioResult = { success: true };
      }

      if (!bioResult.success) {
        // Cancelled, locked out, not enrolled…: never pay, and say so (no silent exit).
        Alert.alert(t('checkout.bioFailedTitle'), t('checkout.bioFailedMessage'), [
          { text: t('actions.cancel', { ns: 'common' }), style: 'cancel' },
          { text: t('checkout.tryAgain'), onPress: () => { void handlePay(); } },
        ]);
        return;
      }

      // ── Present Stripe PaymentSheet ─────────────────────────────────────────
      // These fields travel in the PaymentIntent metadata but not in the quote hash: if they
      // change, the key must change too (Stripe rejects the same key with different params).
      const paramKey = JSON.stringify([orderType, giftRecipientId, tableLabel, roomId ?? null]);
      if (!attemptRef.current || attemptRef.current.paramKey !== paramKey) {
        attemptRef.current = { paramKey, nonce: makeAttemptNonce() };
      }
      const attemptNonce = attemptRef.current.nonce;
      const result = await initAndPresentPaymentSheet({
        ...buildRequest(),
        userId: user.id,
        // ONE key per quote and visit: a retry of the same quote reuses the same PaymentIntent.
        idempotencyKey: `q_${current.quote_hash}_${attemptNonce}`,
        expectedTotalCents: current.total_cents,
      });

      if (!result.ok) {
        if (result.code === 'Canceled') return; // user closed the sheet — not an error
        if (isVenueRefusal({ code: result.code, message: result.message })) {
          // Golden rule at payment time: nothing was charged; show the venue state instead of an error.
          attemptRef.current = null;
          setQuoteNonce((n) => n + 1);
          return;
        }
        if (result.code === 'TotalChanged') {
          const b = result.breakdown;
          Alert.alert(
            t('checkout.totalChangedTitle'),
            b
              ? t('checkout.totalChangedMessage', {
                  total: formatCents(b.totalCents),
                  subtotal: formatCents(b.subtotalCents),
                  tax: formatCents(b.taxCents),
                  tip: formatCents(b.tipCents),
                })
              : t('checkout.totalChangedGeneric'),
          );
          setQuoteNonce((n) => n + 1); // re-quote; nothing was charged
          return;
        }
        // A server-side failure may leave that PaymentIntent unusable (e.g. cancelled when its
        // cart could not be saved): the next attempt must get a new key.
        attemptRef.current = null;
        setErrorMessage(result.message);
        setErrorVisible(true);
        return;
      }

      // ── Paid: find the order the webhook creates ────────────────────────────
      const order = await waitForPaidOrder(result.paymentIntentId);
      clear();
      if (!mountedRef.current) return;
      if (order) {
        navigation.replace('PaymentSuccess', {
          orderId: order.id,
          orderNumber: order.order_number ?? undefined,
          businessName: order.business_name ?? undefined,
          orderType: order.order_type,
          roomId: order.room_id ?? roomId ?? undefined,
        });
      } else {
        // Paid but the order isn't visible yet: say so honestly, with a way to find it later.
        navigation.replace('PaymentSuccess', {
          orderType,
          roomId: roomId ?? undefined,
          processing: true,
        });
      }
    } finally {
      processingRef.current = false;
      if (mountedRef.current) setProcessing(false);
    }
  }, [quoteState, user?.id, t, buildRequest, waitForPaidOrder, clear, navigation, orderType, roomId, giftRecipientId, tableLabel]);

  const handleRetry = useCallback(() => {
    setErrorVisible(false);
    // Small delay so the sheet dismisses before re-triggering. Same quote → same key.
    setTimeout(() => { void handlePay(); }, 300);
  }, [handlePay]);

  const handleDismissError = useCallback(() => {
    setErrorVisible(false);
  }, []);

  // ── Empty guard ───────────────────────────────────────────────────────────────

  if (lines.length === 0) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: c.bgBase }]}>
        {/* Header */}
        <View style={[styles.header, { backgroundColor: c.bgSurface, borderBottomColor: c.borderSubtle }]}>
          <Pressable
            onPress={handleBack}
            style={({ pressed }) => [styles.headerBtn, { opacity: pressed ? 0.6 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel={t('shared.goBack')}
            hitSlop={8}
          >
            <IconArrowLeft size={24} color={c.textPrimary} strokeWidth={2} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: c.textPrimary }]}>{t('checkout.title')}</Text>
          <View style={styles.headerBtn} />
        </View>

        {/* Empty state */}
        <View style={styles.emptyContainer}>
          <IconShoppingBag size={56} color={c.textTertiary} strokeWidth={1.5} />
          <Text style={[styles.emptyTitle, { color: c.textPrimary }]}>
            {t('checkout.emptyTitle')}
          </Text>
          <Text style={[styles.emptySub, { color: c.textSecondary }]}>
            {t('checkout.emptySub')}
          </Text>
          <Pressable
            onPress={handleBack}
            style={({ pressed }) => [
              styles.backMenuBtn,
              { backgroundColor: palette.brand, opacity: pressed ? 0.85 : 1 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={t('checkout.backToMenuA11y')}
          >
            <Text style={styles.backMenuBtnText}>{t('checkout.backToMenu')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // ── Tip label helper ──────────────────────────────────────────────────────────

  function tipPresetLabel(p: TipPreset): string {
    return p === 'custom' ? t('checkout.tipCustom') : t('checkout.tipPercent', { value: p });
  }

  const quoteLoading = quoteState.status === 'loading';
  // The item summary never depends on the quote: server prices when we have them, the cart otherwise.
  const summaryRows = quote
    ? quote.lines.map((l, idx) => ({ key: `${l.menu_item_id}:${idx}`, qty: l.qty, name: l.name, cents: l.line_cents }))
    : lines.map((l) => ({ key: l.lineId, qty: l.qty, name: l.item.name, cents: l.unitPriceCents * l.qty }));
  const venueBlocked = quoteState.status === 'venue';
  const payDisabled = processing || quoteState.status !== 'ready';

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.bgBase }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {/* ── Header ── */}
        <View style={[styles.header, { backgroundColor: c.bgSurface, borderBottomColor: c.borderSubtle }]}>
          <Pressable
            onPress={handleBack}
            style={({ pressed }) => [styles.headerBtn, { opacity: pressed ? 0.6 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel={t('shared.goBack')}
            hitSlop={8}
          >
            <IconArrowLeft size={24} color={c.textPrimary} strokeWidth={2} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: c.textPrimary }]}>{t('checkout.title')}</Text>
          <View style={styles.headerBtn} />
        </View>

        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >

          {/* ── Order Summary (the server's lines) ── */}
          <View style={[styles.section, { backgroundColor: c.bgSurface }]}>
            <View style={styles.sectionTitleRow}>
              <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>
                {t('shared.orderSummary')}
              </Text>
              <Pressable
                onPress={handleEditOrder}
                style={({ pressed }) => [styles.editBtn, { opacity: pressed ? 0.6 : 1 }]}
                accessibilityRole="button"
                accessibilityLabel={t('checkout.editOrderA11y')}
                hitSlop={8}
              >
                <IconEdit size={16} color={palette.brand} strokeWidth={2} />
                <Text style={[styles.editBtnText, { color: palette.brand }]}>{t('checkout.edit')}</Text>
              </Pressable>
            </View>

            {summaryRows.map((row, idx) => (
              <View
                key={row.key}
                style={[
                  styles.summaryRow,
                  idx < summaryRows.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.borderSubtle },
                  quoteLoading && { opacity: 0.5 },
                ]}
              >
                <View style={[styles.qtyBadge, { backgroundColor: palette.brandLight }]}>
                  <Text style={[styles.qtyBadgeText, { color: palette.brand }]}>{row.qty}</Text>
                </View>
                <Text style={[styles.summaryItemName, { color: c.textPrimary }]} numberOfLines={1}>
                  {row.name}
                </Text>
                <Text style={[styles.summaryItemPrice, { color: c.textSecondary }]}>{formatCents(row.cents)}</Text>
              </View>
            ))}

            {/* Order type badge */}
            <View style={[styles.orderTypeBadge, { backgroundColor: c.bgElevated }]}>
              <Text style={[styles.orderTypeBadgeText, { color: c.textSecondary }]}>
                {orderType === 'table' ? t('checkout.orderTable') : orderType === 'counter' ? t('checkout.orderCounter') : t('checkout.orderGift')}
              </Text>
            </View>
          </View>

          {/* ── Tip Selector ── */}
          <View style={[styles.section, { backgroundColor: c.bgSurface }]}>
            <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>{t('checkout.addTip')}</Text>

            <View style={styles.tipRow}>
              {TIP_PRESETS.map((preset) => {
                const isSelected = tipPreset === preset;
                return (
                  <Pressable
                    key={String(preset)}
                    onPress={() => handleTipPreset(preset)}
                    style={({ pressed }) => [
                      styles.tipChip,
                      {
                        borderColor: isSelected ? palette.brand : c.borderSubtle,
                        backgroundColor: isSelected ? palette.brandLight : c.bgElevated,
                        opacity: pressed ? 0.8 : 1,
                      },
                    ]}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: isSelected }}
                    accessibilityLabel={tipPresetLabel(preset)}
                  >
                    <Text
                      style={[
                        styles.tipChipText,
                        { color: isSelected ? palette.brand : c.textSecondary },
                      ]}
                    >
                      {tipPresetLabel(preset)}
                    </Text>
                    {preset !== 'custom' && (
                      <Text
                        style={[
                          styles.tipChipAmount,
                          { color: isSelected ? palette.brandDark : c.textTertiary },
                        ]}
                      >
                        {formatCents(Math.round(tipBaseCents * (preset / 100)))}
                      </Text>
                    )}
                  </Pressable>
                );
              })}
            </View>

            {tipPreset === 'custom' && (
              <View style={[styles.customTipWrapper, { borderColor: c.borderSubtle }]}>
                <Text style={[styles.customTipDollar, { color: c.textPrimary }]}>$</Text>
                <TextInput
                  style={[styles.customTipInput, { color: c.textPrimary }]}
                  placeholder="0.00"
                  placeholderTextColor={c.textTertiary}
                  value={customTipInput}
                  onChangeText={setCustomTipInput}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                  autoFocus
                  accessibilityLabel={t('checkout.customTipA11y')}
                />
              </View>
            )}
          </View>

          {/* ── Total Breakdown (exactly what the server returned) ── */}
          <View style={[styles.section, styles.totalsSection, { backgroundColor: c.bgSurface }]}>
            {quote ? (
              <View style={quoteLoading ? { opacity: 0.5 } : undefined}>
                <View style={styles.totalRow}>
                  <Text style={[styles.totalLabel, { color: c.textSecondary }]}>{t('cart.subtotal')}</Text>
                  <Text style={[styles.totalValue, { color: c.textPrimary }]}>
                    {formatCents(quote.subtotal_cents)}
                  </Text>
                </View>

                <View style={styles.totalRow}>
                  <Text style={[styles.totalLabel, { color: c.textSecondary }]}>
                    {quote.tax_source === 'none'
                      ? t('cart.taxLabel')
                      : t('checkout.taxLabelRate', { rate: formatTaxRate(quote.tax_rate) })}
                  </Text>
                  <Text style={[styles.totalValue, { color: c.textPrimary }]}>
                    {formatCents(quote.tax_cents)}
                  </Text>
                </View>
                {quote.tax_source === 'none' ? (
                  <Text style={[styles.quoteNote, { color: c.textTertiary }]}>
                    {t('checkout.taxNotConfigured')}
                  </Text>
                ) : null}

                <View style={styles.totalRow}>
                  <Text style={[styles.totalLabel, { color: c.textSecondary }]}>
                    {tipPreset === 'custom' ? t('checkout.tipLabelCustom') : t('checkout.tipLabelPercent', { value: tipPreset })}
                  </Text>
                  <Text style={[styles.totalValue, { color: c.textPrimary }]}>
                    {formatCents(quote.tip_cents)}
                  </Text>
                </View>

                <View style={[styles.totalDivider, { backgroundColor: c.borderSubtle }]} />

                <View style={styles.totalRow}>
                  <Text style={[styles.totalLabelBold, { color: c.textPrimary }]}>{t('cart.total')}</Text>
                  <Text style={[styles.totalValueBold, { color: c.textPrimary }]}>
                    {formatCents(quote.total_cents)}
                  </Text>
                </View>
              </View>
            ) : quoteState.status === 'loading' ? (
              <View style={styles.quotePlaceholder}>
                <ActivityIndicator color={palette.brand} />
              </View>
            ) : null}

            {quoteState.status === 'error' ? (
              <View style={styles.quoteErrorBox}>
                <Text style={[styles.quoteErrorText, { color: palette.danger }]}>{quoteState.message}</Text>
                <Pressable
                  onPress={handleRetryQuote}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.quoteRetryBtn, { backgroundColor: palette.brand, opacity: pressed ? 0.85 : 1 }]}
                >
                  <Text style={styles.quoteRetryText}>{t('checkout.quoteRetry')}</Text>
                </Pressable>
              </View>
            ) : null}

            {quoteState.status === 'venue' ? (
              <View style={styles.quoteErrorBox} accessibilityRole="alert">
                <Text style={[styles.quoteErrorText, { color: c.textPrimary, fontWeight: '700' }]}>
                  {t('checkout.venueTitle', { business: businessName || t('checkout.venueFallback') })}
                </Text>
                <Pressable
                  onPress={handleVenueRetry}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.quoteRetryBtn, { backgroundColor: palette.brand, opacity: pressed ? 0.85 : 1 }]}
                >
                  <Text style={styles.quoteRetryText}>{t('checkout.venueRetry')}</Text>
                </Pressable>
                {quoteState.pickupAvailable && orderType !== 'counter' ? (
                  <Pressable
                    onPress={() => setOrderType('counter')}
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.quoteRetryBtn, { backgroundColor: c.bgElevated, opacity: pressed ? 0.85 : 1 }]}
                  >
                    <Text style={[styles.quoteRetryText, { color: c.textPrimary }]}>{t('checkout.orderPickup')}</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </View>

          {/* Bottom spacing so the sticky bar doesn't obscure content */}
          <View style={{ height: 24 }} />
        </ScrollView>

        {/* ── Pay Button Bar (sticky) ── */}
        <View style={[styles.payBar, { backgroundColor: c.bgSurface, borderTopColor: c.borderSubtle }]}>
          <Animated.View style={{ transform: [{ scale: payBtnScale }], width: '100%' }}>
            <Pressable
              onPress={() => { void handlePay(); }}
              disabled={payDisabled}
              onPressIn={() => animatePayBtn(0.97)}
              onPressOut={() => animatePayBtn(1)}
              style={({ pressed }) => [
                styles.payButton,
                {
                  backgroundColor: palette.brand,
                  opacity: payDisabled ? 0.5 : pressed ? 0.9 : 1,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={quote ? t('checkout.payA11y', { amount: formatCents(quote.total_cents) }) : t('checkout.payWaitingA11y')}
              accessibilityState={{ disabled: payDisabled }}
            >
              {processing || quoteLoading ? (
                <ActivityIndicator color={palette.bgSurfaceLight} size="small" />
              ) : (
                <Text style={styles.payButtonText}>
                  {quote ? t('checkout.payButton', { amount: formatCents(quote.total_cents) }) : venueBlocked ? t('checkout.venueTitle', { business: businessName || t('checkout.venueFallback') }) : t('checkout.payWaiting')}
                </Text>
              )}
            </Pressable>
          </Animated.View>

          {/* "Secured by Stripe" */}
          <View style={styles.secureRow}>
            <IconLock size={13} color={c.textTertiary} strokeWidth={2} />
            <Text style={[styles.secureText, { color: c.textTertiary }]}>
              {t('checkout.securedByStripe')}
            </Text>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* ── Processing overlay ── */}
      <ProcessingOverlay visible={processing} colors={c} />

      {/* ── Error bottom sheet ── */}
      <ErrorSheet
        visible={errorVisible}
        errorMessage={errorMessage}
        onRetry={handleRetry}
        onDismiss={handleDismissError}
        colors={c}
      />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  quotePlaceholder: { alignItems: 'center', justifyContent: 'center', paddingVertical: 20 },
  quoteNote: { fontSize: 12, lineHeight: 17, marginTop: -4, marginBottom: 8 },
  quoteErrorBox: { alignItems: 'center', gap: 10, paddingVertical: 8 },
  quoteErrorText: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  quoteRetryBtn: { borderRadius: 12, paddingHorizontal: 18, paddingVertical: 10 },
  quoteRetryText: { color: palette.bgSurfaceLight, fontSize: 14, fontWeight: '700' },
  root: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 8,
  },

  // ── Header ────────────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: {
    padding: 8,
    minWidth: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.1,
  },

  // ── Empty state ───────────────────────────────────────────────────────────────
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptySub: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  backMenuBtn: {
    marginTop: 8,
    borderRadius: 12,
    paddingHorizontal: 28,
    paddingVertical: 14,
  },
  backMenuBtnText: {
    color: palette.bgSurfaceLight,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },

  // ── Sections ──────────────────────────────────────────────────────────────────
  section: {
    marginTop: 8,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  editBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },

  // ── Order summary ─────────────────────────────────────────────────────────────
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 10,
  },
  qtyBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  qtyBadgeText: {
    fontSize: 12,
    fontWeight: '800',
  },
  summaryItemName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
  },
  summaryItemPrice: {
    fontSize: 14,
    fontWeight: '600',
    flexShrink: 0,
  },
  orderTypeBadge: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 10,
  },
  orderTypeBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },

  // ── Tip ───────────────────────────────────────────────────────────────────────
  tipRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  tipChip: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    gap: 2,
  },
  tipChipText: {
    fontSize: 13,
    fontWeight: '700',
  },
  tipChipAmount: {
    fontSize: 11,
  },
  customTipWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 4,
  },
  customTipDollar: {
    fontSize: 18,
    fontWeight: '600',
  },
  customTipInput: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    padding: 0,
    margin: 0,
  },

  // ── Payment method ────────────────────────────────────────────────────────────
  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  paymentIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  paymentLabelWrap: {
    flex: 1,
    gap: 2,
  },
  paymentLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  paymentSublabel: {
    fontSize: 12,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  // ── Totals ────────────────────────────────────────────────────────────────────
  totalsSection: {
    gap: 10,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 14,
  },
  totalValue: {
    fontSize: 14,
    fontWeight: '500',
  },
  totalLabelBold: {
    fontSize: 17,
    fontWeight: '700',
  },
  totalValueBold: {
    fontSize: 17,
    fontWeight: '700',
  },
  totalDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 2,
  },

  // ── Pay bar ───────────────────────────────────────────────────────────────────
  payBar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    gap: 10,
  },
  payButton: {
    width: '100%',
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 58,
  },
  payButtonText: {
    color: palette.bgSurfaceLight,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  secureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  secureText: {
    fontSize: 12,
    fontWeight: '500',
  },
});
