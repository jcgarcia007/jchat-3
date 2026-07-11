/**
 * JChat 3.0 — CheckoutScreen (Task 3.5)
 *
 * Single-scroll express checkout. Arrived at from CartScreen via
 * CommonActions.navigate({ name: 'Checkout' }).
 *
 * ── Sections ──────────────────────────────────────────────────────────────────
 * 1. Header — back button + "Checkout"
 * 2. Order summary — collapsed line list + edit shortcut (→ Cart)
 * 3. Tip selector — 10 / 15 / 20 / Custom (number input)
 * 4. Payment method — saved card · Apple Pay · Google Pay · PayPal (radio)
 * 5. Total breakdown — subtotal · tax (~8%) · tip · grand total
 * 6. Pay button — "Pay $XX.XX with Face ID" → authenticateAsync → payment sheet
 * 7. "Secured by Stripe" footer with IconLock
 *
 * ── Payment flow ──────────────────────────────────────────────────────────────
 * a. Tap "Pay" → Face ID / biometrics via expo-local-authentication.
 * b. On biometric success → initAndPresentPaymentSheet(orderPayload).
 *    (In demo mode: skip both and simulate success.)
 * c. On StripeResult.ok → inline Processing overlay → navigate PaymentSuccess.
 * d. On StripeResult.error → error bottom sheet with retry button.
 *
 * ── Guards ────────────────────────────────────────────────────────────────────
 * - If cart is empty, shows an empty state and a "Back to menu" button.
 * - isSupabaseConfigured guard: demo mode simulates success.
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
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { authenticateAsync } from 'expo-local-authentication';

import {
  IconArrowLeft,
  IconBrandApple,
  IconBrandGoogle,
  IconBrandPaypal,
  IconCheck,
  IconCreditCard,
  IconEdit,
  IconLock,
  IconShoppingBag,
} from '@tabler/icons-react-native';

import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import { useCart } from '../../context/CartContext';
import { useAuth } from '../../context/AuthContext';
import { initAndPresentPaymentSheet } from '../../services/stripe';
import type { OrderPayload } from '../../services/stripe';
import { createOrderRecord } from '../../services/orders';
import { isSupabaseConfigured } from '../../services/supabase';
import { getTaxRateForBusiness, DEFAULT_TAX_RATE } from '../../services/tax';
import type { MainStackParamList } from '../../navigation/AppNavigator';

// ── Types ──────────────────────────────────────────────────────────────────────

type CheckoutNav = NativeStackNavigationProp<MainStackParamList>;

type TipPreset = 10 | 15 | 20 | 'custom';

type PaymentMethod = 'card' | 'apple' | 'google' | 'paypal';

type PaymentLabelKey = 'checkout.payCard' | 'checkout.payApple' | 'checkout.payGoogle' | 'checkout.payPaypal';
type PaymentSubKey = 'checkout.cardMasked' | 'checkout.payAppleSub' | 'checkout.payGoogleSub' | 'checkout.payPaypalSub';

interface PaymentMethodOption {
  id: PaymentMethod;
  labelKey: PaymentLabelKey;
  sublabelKey: PaymentSubKey;
  Icon: React.ComponentType<{ size: number; color: string; strokeWidth: number }>;
}

// ── Constants ─────────────────────────────────────────────────────────────────

// Tax rate is resolved per business via getTaxRateForBusiness (localized).

const TIP_PRESETS: TipPreset[] = [10, 15, 20, 'custom'];

const PAYMENT_OPTIONS: PaymentMethodOption[] = [
  {
    id: 'card',
    labelKey: 'checkout.payCard',
    sublabelKey: 'checkout.cardMasked',
    Icon: IconCreditCard,
  },
  {
    id: 'apple',
    labelKey: 'checkout.payApple',
    sublabelKey: 'checkout.payAppleSub',
    Icon: IconBrandApple,
  },
  {
    id: 'google',
    labelKey: 'checkout.payGoogle',
    sublabelKey: 'checkout.payGoogleSub',
    Icon: IconBrandGoogle,
  },
  {
    id: 'paypal',
    labelKey: 'checkout.payPaypal',
    // TODO(paypal): enable via Stripe PayPal integration
    sublabelKey: 'checkout.payPaypalSub',
    Icon: IconBrandPaypal,
  },
];

// Show Apple Pay only on iOS, Google Pay only on Android.
function filteredPaymentOptions(): PaymentMethodOption[] {
  return PAYMENT_OPTIONS.filter((opt) => {
    if (opt.id === 'apple') return Platform.OS === 'ios';
    if (opt.id === 'google') return Platform.OS === 'android';
    return true;
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function generateDemoOrderNumber(): string {
  const n = Math.floor(Math.random() * 99999) + 1;
  return `#J-${String(n).padStart(5, '0')}`;
}

/** Fresh key per payment attempt — see payments EF: a cart-derived key collides
 *  when the customer repeats an identical order. */
function makeIdempotencyKey(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`;
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
    backgroundColor: 'rgba(0,0,0,0.55)',
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
    backgroundColor: 'rgba(0,0,0,0.4)',
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
    color: '#ffffff',
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
    promoCode,
    subtotalCents,
    businessId,
    roomId,
    clear,
  } = cart;

  // ── Local state ──────────────────────────────────────────────────────────────

  const [tipPreset, setTipPreset] = useState<TipPreset>(15);
  const [customTipInput, setCustomTipInput] = useState('');
  const [selectedPayment, setSelectedPayment] = useState<PaymentMethod>('card');
  const [processing, setProcessing] = useState(false);
  const [errorVisible, setErrorVisible] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Localized tax rate, resolved from the business (Stage 3 cleanup).
  const [taxRate, setTaxRate] = useState<number>(DEFAULT_TAX_RATE);
  useEffect(() => {
    let cancelled = false;
    getTaxRateForBusiness(businessId).then((rate) => {
      if (!cancelled) setTaxRate(rate);
    });
    return () => { cancelled = true; };
  }, [businessId]);

  // Animated scale for pay button press
  const payBtnScale = useRef(new Animated.Value(1)).current;

  // ── Tip calculation ──────────────────────────────────────────────────────────

  const tipCents = useMemo<number>(() => {
    if (tipPreset === 'custom') {
      const parsed = parseFloat(customTipInput.replace(/[^0-9.]/g, ''));
      if (!isNaN(parsed) && parsed >= 0) {
        return Math.round(parsed * 100);
      }
      return 0;
    }
    return Math.round(subtotalCents * (tipPreset / 100));
  }, [tipPreset, customTipInput, subtotalCents]);

  // ── Total breakdown ──────────────────────────────────────────────────────────

  // Localized tax rate (from business.tax_rate or address).
  const taxCents = Math.round(subtotalCents * taxRate);
  const totalCents = subtotalCents + taxCents + tipCents;

  // ── Payment options (platform-filtered) ──────────────────────────────────────

  const paymentOptions = useMemo(() => filteredPaymentOptions(), []);

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

  const handlePay = useCallback(async () => {
    if (processing) return;

    const userId = user?.id ?? 'demo-user';

    // ── Demo mode ────────────────────────────────────────────────────────────
    if (!isSupabaseConfigured) {
      setProcessing(true);
      // Simulate a brief processing delay
      await new Promise<void>((resolve) => setTimeout(resolve, 1200));

      // Create a demo order record (not server-side — demo only)
      try {
        await createOrderRecord({
          businessId: businessId ?? 'demo-biz',
          userId,
          roomId: roomId ?? null,
          orderType,
          giftRecipientId,
          tableLabel,
          subtotalCents,
          taxCents,
          tipCents,
          discountCents: 0,
          totalCents,
          promoCode,
          items: lines.map((l) => ({
            menuItemId: l.item.id,
            qty: l.qty,
            priceCents: l.unitPriceCents,
            // Fix #6: forward selected modifier LABELS only; server prices them.
            options: { size: l.size?.label ?? null, extras: (l.extras ?? []).map((e) => e.label) },
            specialInstructions: l.specialInstructions ?? null,
          })),
        });
      } catch {
        // In demo mode swallow create errors — the order number is mocked anyway
      }

      setProcessing(false);
      clear();

      navigation.navigate('PaymentSuccess', {
        orderNumber: generateDemoOrderNumber(),
        businessName: 'The Rooftop Bar',
        orderType,
        roomId: roomId ?? undefined,
        cardAlreadySaved: false,
      });
      return;
    }

    // ── Biometric authentication ──────────────────────────────────────────────
    let bioResult;
    try {
      bioResult = await authenticateAsync({
        promptMessage: t('checkout.bioPrompt', { amount: formatCents(totalCents) }),
        fallbackLabel: t('checkout.bioFallback'),
        cancelLabel: t('actions.cancel', { ns: 'common' }),
        disableDeviceFallback: false,
      });
    } catch {
      // Device doesn't support biometrics — skip and go straight to Stripe
      bioResult = { success: true } as const;
    }

    if (!bioResult.success) {
      // User cancelled biometrics — don't show an error, just stop
      return;
    }

    // ── Present Stripe PaymentSheet ───────────────────────────────────────────
    setProcessing(true);

    const orderPayload: OrderPayload = {
      businessId: businessId ?? '',
      userId,
      roomId: roomId ?? null,
      orderType,
      giftRecipientId,
      tableLabel,
      idempotencyKey: makeIdempotencyKey(),
      subtotalCents,
      taxCents,
      tipCents,
      discountCents: 0,
      totalCents,
      promoCode,
      items: lines.map((l) => ({
        menuItemId: l.item.id,
        name: l.item.name,
        qty: l.qty,
        priceCents: l.unitPriceCents,
        // Fix #6: forward selected modifier LABELS only; the server resolves their
        // price from menu_items.options server-side (never trust client prices).
        options: { size: l.size?.label ?? null, extras: (l.extras ?? []).map((e) => e.label) },
        specialInstructions: l.specialInstructions ?? null,
      })),
    };

    const result = await initAndPresentPaymentSheet(orderPayload);

    setProcessing(false);

    if (result.ok) {
      clear();
      // Order is created server-side by the Stripe webhook — generate a
      // placeholder order number; the real one arrives via Realtime on the
      // OrderTracking screen.
      navigation.navigate('PaymentSuccess', {
        orderNumber: generateDemoOrderNumber(),
        businessName: 'The Rooftop Bar', // TODO: pass real businessName from route params once registered
        orderType,
        roomId: roomId ?? undefined,
        cardAlreadySaved: selectedPayment === 'card',
      });
    } else {
      // Don't show an error sheet for user-initiated cancels
      if (result.code !== 'Canceled') {
        setErrorMessage(result.message);
        setErrorVisible(true);
      }
    }
  }, [
    processing,
    user?.id,
    businessId,
    roomId,
    orderType,
    giftRecipientId,
    tableLabel,
    subtotalCents,
    taxCents,
    tipCents,
    totalCents,
    promoCode,
    lines,
    clear,
    selectedPayment,
    navigation,
    t,
  ]);

  const handleRetry = useCallback(() => {
    setErrorVisible(false);
    // Small delay so the sheet dismisses before re-triggering
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

          {/* ── Order Summary ── */}
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

            {lines.map((line, idx) => (
              <View
                key={line.lineId}
                style={[
                  styles.summaryRow,
                  idx < lines.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.borderSubtle },
                ]}
              >
                <View style={[styles.qtyBadge, { backgroundColor: palette.brandLight }]}>
                  <Text style={[styles.qtyBadgeText, { color: palette.brand }]}>
                    {line.qty}
                  </Text>
                </View>
                <Text style={[styles.summaryItemName, { color: c.textPrimary }]} numberOfLines={1}>
                  {line.item.name}
                </Text>
                <Text style={[styles.summaryItemPrice, { color: c.textSecondary }]}>
                  {formatCents(line.unitPriceCents * line.qty)}
                </Text>
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
                        {formatCents(Math.round(subtotalCents * (preset / 100)))}
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

          {/* ── Payment Method ── */}
          <View style={[styles.section, { backgroundColor: c.bgSurface }]}>
            <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>{t('checkout.paymentMethod')}</Text>

            {paymentOptions.map((opt) => {
              const isSelected = selectedPayment === opt.id;
              const label = t(opt.labelKey);
              const sublabel = t(opt.sublabelKey);
              return (
                <Pressable
                  key={opt.id}
                  onPress={() => setSelectedPayment(opt.id)}
                  style={({ pressed }) => [
                    styles.paymentRow,
                    {
                      borderBottomColor: c.borderSubtle,
                      opacity: pressed ? 0.7 : 1,
                    },
                  ]}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: isSelected }}
                  accessibilityLabel={t('checkout.paymentOptionA11y', { label, sublabel })}
                >
                  {/* Icon */}
                  <View style={[styles.paymentIconWrap, { backgroundColor: c.bgElevated }]}>
                    <opt.Icon size={20} color={isSelected ? palette.brand : c.textSecondary} strokeWidth={2} />
                  </View>

                  {/* Label */}
                  <View style={styles.paymentLabelWrap}>
                    <Text style={[styles.paymentLabel, { color: c.textPrimary }]}>
                      {label}
                    </Text>
                    <Text style={[styles.paymentSublabel, { color: c.textTertiary }]}>
                      {sublabel}
                    </Text>
                  </View>

                  {/* Radio indicator */}
                  <View
                    style={[
                      styles.radioOuter,
                      {
                        borderColor: isSelected ? palette.brand : c.borderSubtle,
                        backgroundColor: isSelected ? palette.brand : 'transparent',
                      },
                    ]}
                  >
                    {isSelected && (
                      <IconCheck size={12} color="#ffffff" strokeWidth={3} />
                    )}
                  </View>
                </Pressable>
              );
            })}
          </View>

          {/* ── Total Breakdown ── */}
          <View style={[styles.section, styles.totalsSection, { backgroundColor: c.bgSurface }]}>
            <View style={styles.totalRow}>
              <Text style={[styles.totalLabel, { color: c.textSecondary }]}>{t('cart.subtotal')}</Text>
              <Text style={[styles.totalValue, { color: c.textPrimary }]}>
                {formatCents(subtotalCents)}
              </Text>
            </View>

            {/* TODO: tax from business location */}
            <View style={styles.totalRow}>
              <Text style={[styles.totalLabel, { color: c.textSecondary }]}>{t('cart.taxLabel')}</Text>
              <Text style={[styles.totalValue, { color: c.textPrimary }]}>
                {formatCents(taxCents)}
              </Text>
            </View>

            <View style={styles.totalRow}>
              <Text style={[styles.totalLabel, { color: c.textSecondary }]}>
                {tipPreset === 'custom' ? t('checkout.tipLabelCustom') : t('checkout.tipLabelPercent', { value: tipPreset })}
              </Text>
              <Text style={[styles.totalValue, { color: c.textPrimary }]}>
                {formatCents(tipCents)}
              </Text>
            </View>

            <View style={[styles.totalDivider, { backgroundColor: c.borderSubtle }]} />

            <View style={styles.totalRow}>
              <Text style={[styles.totalLabelBold, { color: c.textPrimary }]}>{t('cart.total')}</Text>
              <Text style={[styles.totalValueBold, { color: c.textPrimary }]}>
                {formatCents(totalCents)}
              </Text>
            </View>
          </View>

          {/* Bottom spacing so the sticky bar doesn't obscure content */}
          <View style={{ height: 24 }} />
        </ScrollView>

        {/* ── Pay Button Bar (sticky) ── */}
        <View style={[styles.payBar, { backgroundColor: c.bgSurface, borderTopColor: c.borderSubtle }]}>
          <Animated.View style={{ transform: [{ scale: payBtnScale }], width: '100%' }}>
            <Pressable
              onPress={() => { void handlePay(); }}
              disabled={processing}
              onPressIn={() => animatePayBtn(0.97)}
              onPressOut={() => animatePayBtn(1)}
              style={({ pressed }) => [
                styles.payButton,
                {
                  backgroundColor: palette.brand,
                  opacity: processing ? 0.7 : pressed ? 0.9 : 1,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={t('checkout.payA11y', { amount: formatCents(totalCents) })}
              accessibilityState={{ disabled: processing }}
            >
              {processing ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <Text style={styles.payButtonText}>
                  {t('checkout.payButton', { amount: formatCents(totalCents) })}
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
    color: '#ffffff',
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
    color: '#ffffff',
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
