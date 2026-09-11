/**
 * JChat 3.0 — POS Checkout Screen (C8)
 *
 * Supports two payment modes controlled by businesses.pos_payment_mode:
 *
 *   'stripe'   — M2 Bluetooth reader (default). Full Stripe Terminal flow.
 *   'external' — Cash or card on an external terminal. Single RPC call to
 *                pos_apply_external_payment; no M2 lifecycle.
 *
 * ── Stripe flow ───────────────────────────────────────────────────────────────
 * 1. Load due_cents preview from posTableBalance().
 * 2. On mount: getOrCreateTerminalLocation → discoverReaders → connectReader.
 * 3. Tap "Cobrar $X.XX" → tip picker → confirm →
 *    createTabPaymentIntent → retrievePI → collectPaymentMethod →
 *    confirmPaymentIntent → markTabPaid.
 * 4. Success → print (fetchAnyPrinter) → auto-navigate.
 *
 * ── External flow ─────────────────────────────────────────────────────────────
 * 1. Load due_cents preview from posTableBalance().
 * 2. No reader lifecycle (usePosReader enabled:false).
 * 3. Tap "Cobrar $X.XX" → tip picker → pick Efectivo or Tarjeta externa →
 *    posApplyExternalPayment(method, tipCents, null).
 * 4. Success → print (fetchStaffPrinters — mesero printer only) → auto-navigate.
 *
 * ── Security ──────────────────────────────────────────────────────────────────
 * • Amount comes exclusively from the server (pos_table_balance RPC).
 * • No Stripe API keys on the client — connection token via Edge Function.
 * • markTabPaid() retrieves the PI directly from Stripe before updating the DB.
 *
 * ── Note (F6 v1) ──────────────────────────────────────────────────────────────
 * get_public_receipt currently does not return payment_method in its result set.
 * External receipts print without the method label for now. Tracked for v2.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  IconCash,
  IconCheck,
  IconChevronLeft,
  IconCreditCard,
  IconPrinter,
  IconRefresh,
  IconWifi,
  IconWifiOff,
} from '@tabler/icons-react-native';
import { isTerminalAvailable } from '../../services/terminalSdk';
import { usePosReader } from '../../hooks/usePosReader';
import { usePosBusinessSettings } from '../../hooks/usePosBusinessSettings';
import PosTipPicker, { TIP_PRESETS } from '../../components/pos/PosTipPicker';

import { palette } from '../../theme/tokens';
import { useThemeColors } from '../../theme/colors';
import { posTableBalance, posApplyExternalPayment } from '../../services/pos';
import {
  createTabPaymentIntent,
  markTabPaid,
} from '../../services/terminal';
import type { PosStackParamList } from '../../navigation/PosNavigator';
import { supabase } from '../../services/supabase';
import { buildReceiptEscPos } from '../../services/escpos';
import type { PublicReceipt } from '../../services/escpos';
import { fetchAnyPrinter, fetchStaffPrinters, printToNetwork } from '../../services/printer';
import type { NetworkPrinter } from '../../services/printer';

// ─── Nav types ────────────────────────────────────────────────────────────────

type PosCheckoutNav = NativeStackNavigationProp<PosStackParamList, 'PosCheckout'>;
type PosCheckoutRoute = RouteProp<PosStackParamList, 'PosCheckout'>;

// ─── Local types ──────────────────────────────────────────────────────────────

type CheckoutPhase =
  | 'idle'        // waiting for employee to tap "Cobrar"
  | 'tip'         // tip picker is open (+ method selection in external mode)
  | 'creating'    // calling createTabPaymentIntent EF  OR  posApplyExternalPayment
  | 'retrieving'  // calling SDK retrievePaymentIntent (stripe only)
  | 'collecting'  // collectPaymentMethod on reader (stripe only)
  | 'confirming'  // confirmPaymentIntent (stripe only)
  | 'marking'     // calling markTabPaid EF (stripe only)
  | 'success'     // done
  | 'error';      // something went wrong

type PrintStatus = 'idle' | 'printing' | 'success' | 'error';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function PosCheckoutScreen() {
  const c = useThemeColors();
  const { t } = useTranslation('settings');
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<PosCheckoutNav>();
  const route = useRoute<PosCheckoutRoute>();
  const { businessId, tableId, tableLabel } = route.params;

  // ── Payment mode (F6) ────────────────────────────────────────────────────────
  // usePosBusinessSettings caches at module scope — nearly always a cache hit
  // by the time the employee navigates here (PosTableHub loads it first).
  const { settings } = usePosBusinessSettings(businessId);
  const isExternal = settings?.posPaymentMode === 'external';

  // ── Reader state + lifecycle (managed by usePosReader) ─────────────────────
  // enabled:false in external mode — no BT scan, no location fetch, no disconnect.
  const {
    readerStatus,
    readerError,
    updateProgress,
    connectedReader,
    retrievePaymentIntent,
    collectPaymentMethod,
    confirmPaymentIntent,
    handleRetryReader,
  } = usePosReader({ businessId, enabled: !isExternal });

  // ── Tab data (preview, display only — authoritative amount comes from EF) ──
  const [tabAmountCents, setTabAmountCents] = useState<number | null>(null);
  const [tabLoading, setTabLoading] = useState(true);

  // paymentId returned by createTabPaymentIntent and consumed by markTabPaid
  const paymentIdRef = useRef<string | null>(null);

  // receipt_code returned by markTabPaid / posApplyExternalPayment
  const receiptCodeRef = useRef<string | null>(null);

  // tabClosed returned by the server (for success banner)
  const [tabClosed, setTabClosed] = useState(false);

  // ── Checkout state ──────────────────────────────────────────────────────────
  const [phase, setPhase] = useState<CheckoutPhase>('idle');
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  // ── Printer state ───────────────────────────────────────────────────────────
  // null = not yet looked up; 'none' = no printer configured
  const [defaultPrinter, setDefaultPrinter] = useState<NetworkPrinter | 'none' | null>(null);
  const [printStatus, setPrintStatus] = useState<PrintStatus>('idle');
  const [printError, setPrintError] = useState<string | null>(null);
  // Auto-navigate timer — cancelled when a printer is available so the employee
  // can print before leaving the screen.
  const autoNavTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Tip picker state ────────────────────────────────────────────────────────
  const [selectedTipOption, setSelectedTipOption] = useState<string>('none');
  const [customTipMode, setCustomTipMode] = useState<'pct' | 'amt'>('pct');
  const [customTipInput, setCustomTipInput] = useState<string>('');

  // ── Cleanup: cancel auto-navigate timer on unmount ──────────────────────────
  useEffect(() => {
    return () => {
      if (autoNavTimerRef.current) clearTimeout(autoNavTimerRef.current);
    };
  }, []);

  // ── Load due_cents from posTableBalance (canonical pending amount) ──────────
  // due_cents = items_unpaid_cents − paid_unallocated_cents (items actually sent
  // to kitchen with "Send"). Draft items (not sent) are NOT counted — if the
  // screen shows $0 / "Nada que cobrar", send the round first.
  useEffect(() => {
    let mounted = true;
    posTableBalance(businessId, tableId)
      .then((res) => {
        if (!mounted) return;
        if (res.ok) {
          const due = res.balance.due_cents;
          setTabAmountCents(due > 0 ? due : null);
        } else {
          setTabAmountCents(null);
        }
      })
      .catch(() => {
        if (mounted) setTabAmountCents(null);
      })
      .finally(() => {
        if (mounted) setTabLoading(false);
      });
    return () => { mounted = false; };
  }, [businessId, tableId]);

  // ── Computed tip in cents ────────────────────────────────────────────────────
  const computedTipCents = useMemo((): number => {
    const base = tabAmountCents ?? 0;
    if (selectedTipOption === 'none' || base === 0) return 0;
    const preset = TIP_PRESETS.find((p) => p.key === selectedTipOption);
    if (preset) return Math.round((base * preset.pct) / 100);
    if (selectedTipOption === 'custom') {
      const raw = parseFloat(customTipInput.replace(',', '.'));
      if (!isFinite(raw) || raw <= 0) return 0;
      if (customTipMode === 'pct') return Math.round((base * raw) / 100);
      return Math.round(raw * 100);
    }
    return 0;
  }, [tabAmountCents, selectedTipOption, customTipMode, customTipInput]);

  // ── Helper: resolve printer after success ────────────────────────────────────
  // External mode uses fetchStaffPrinters (mesero printer only, never kitchen).
  // Stripe mode uses fetchAnyPrinter (legacy — first available role).
  const resolveAndSetPrinter = useCallback((printer: NetworkPrinter | null) => {
    if (printer) {
      setDefaultPrinter(printer);
      // No auto-navigate — employee controls when to leave.
    } else {
      setDefaultPrinter('none');
      autoNavTimerRef.current = setTimeout(() => {
        if (navigation.canGoBack()) navigation.goBack();
      }, 2200);
    }
  }, [navigation]);

  // ── Stripe charge ─────────────────────────────────────────────────────────
  const handleStripeCharge = useCallback(async (tipCents: number) => {
    if (!connectedReader) return;
    setCheckoutError(null);

    setPhase('creating');
    const piResult = await createTabPaymentIntent(businessId, tableId, tipCents);
    if (!piResult.ok) {
      setPhase('error');
      switch (piResult.reason) {
        case 'empty_tab':
          setCheckoutError(t('pos.noOpenOrders'));
          break;
        case 'no_access':
          setCheckoutError(t('pos.errorNoAccess'));
          break;
        default:
          setCheckoutError(piResult.message ?? t('pos.errorPayment'));
      }
      return;
    }

    paymentIdRef.current = piResult.paymentId;
    setTabAmountCents(piResult.baseCents);

    setPhase('retrieving');
    const retrieveResult = await retrievePaymentIntent(piResult.clientSecret);
    if (retrieveResult.error) {
      setPhase('error');
      setCheckoutError(retrieveResult.error.message ?? t('pos.errorPayment'));
      return;
    }

    setPhase('collecting');
    const collectResult = await collectPaymentMethod({
      paymentIntent: retrieveResult.paymentIntent,
    });
    if (collectResult.error) {
      setPhase('error');
      setCheckoutError(collectResult.error.message ?? t('pos.errorPayment'));
      return;
    }

    setPhase('confirming');
    const confirmResult = await confirmPaymentIntent({
      paymentIntent: collectResult.paymentIntent,
    });
    if (confirmResult.error) {
      setPhase('error');
      setCheckoutError(confirmResult.error.message ?? t('pos.errorPayment'));
      return;
    }

    if (!paymentIdRef.current) {
      setPhase('error');
      setCheckoutError(t('pos.errorMarkPaid'));
      return;
    }
    setPhase('marking');
    const markResult = await markTabPaid(paymentIdRef.current);
    if (!markResult.ok) {
      setPhase('error');
      if (markResult.reason === 'not_succeeded') {
        setCheckoutError(t('pos.errorNotSucceeded', { status: markResult.piStatus ?? 'unknown' }));
      } else {
        setCheckoutError(t('pos.errorMarkPaid'));
      }
      return;
    }

    receiptCodeRef.current = markResult.receiptCode ?? null;
    setTabClosed(markResult.tabClosed);
    setPhase('success');

    fetchAnyPrinter(businessId)
      .then((printer) => resolveAndSetPrinter(printer))
      .catch(() => resolveAndSetPrinter(null));
  }, [
    connectedReader, businessId, tableId,
    retrievePaymentIntent, collectPaymentMethod, confirmPaymentIntent,
    resolveAndSetPrinter, t,
  ]);

  // ── External charge (F6) ──────────────────────────────────────────────────
  // p_payment_id = null → "everything due in this session".
  const handleExternalCharge = useCallback(async (
    method: 'cash' | 'card_external',
    tipCents: number,
  ) => {
    setCheckoutError(null);
    setPhase('creating');

    const result = await posApplyExternalPayment(businessId, tableId, method, tipCents, null);
    if (!result.ok) {
      setPhase('error');
      switch (result.reason) {
        case 'mode_not_allowed':
          setCheckoutError(t('pos.externalPayModeNotAllowed'));
          break;
        case 'nothing_due':
          setCheckoutError(t('pos.externalPayNothingDue'));
          break;
        case 'not_assigned':
          setCheckoutError(t('pos.externalPayNotAssigned'));
          break;
        case 'bad_method':
          setCheckoutError(t('pos.externalPayBadMethod'));
          break;
        default:
          setCheckoutError(t('pos.externalPayDbError'));
      }
      return;
    }

    receiptCodeRef.current = result.receiptCode;
    setTabClosed(result.tabClosed);
    setPhase('success');

    // External mode: use staff printers only (mesero role, never kitchen/bar).
    fetchStaffPrinters(businessId)
      .then((printers) => resolveAndSetPrinter(printers[0] ?? null))
      .catch(() => resolveAndSetPrinter(null));
  }, [businessId, tableId, resolveAndSetPrinter, t]);

  // ─── Print handler ──────────────────────────────────────────────────────────
  const handlePrint = useCallback(async () => {
    if (!defaultPrinter || defaultPrinter === 'none') return;
    if (!receiptCodeRef.current) return;
    if (printStatus === 'printing') return;

    setPrintStatus('printing');
    setPrintError(null);

    try {
      const { data: receipt, error: rpcError } = await supabase.rpc(
        'get_public_receipt',
        { p_code: receiptCodeRef.current },
      );
      if (rpcError || !receipt) throw new Error(t('pos.printError'));

      const escposBytes = buildReceiptEscPos(
        receipt as PublicReceipt,
        receiptCodeRef.current,
        defaultPrinter.width_mm,
      );

      await printToNetwork(defaultPrinter.host, defaultPrinter.port, escposBytes);
      setPrintStatus('success');
    } catch (err) {
      setPrintStatus('error');
      setPrintError(
        err instanceof Error && err.message ? err.message : t('pos.printError'),
      );
    }
  }, [defaultPrinter, printStatus, t]);

  // ─── Derived state ──────────────────────────────────────────────────────────
  const isProcessing =
    phase === 'creating' ||
    phase === 'retrieving' ||
    phase === 'collecting' ||
    phase === 'confirming' ||
    phase === 'marking';

  const hasTab = tabAmountCents !== null && tabAmountCents > 0;

  // canCharge: external mode doesn't need readerStatus === 'ready'
  const canCharge = isExternal
    ? hasTab && !isProcessing && phase !== 'success' && phase !== 'error' && phase !== 'tip'
    : readerStatus === 'ready' && hasTab && !isProcessing && phase !== 'success' && phase !== 'error' && phase !== 'tip';

  // ── Phase label ──────────────────────────────────────────────────────────────
  const phaseLabel = (() => {
    switch (phase) {
      case 'creating':
      case 'retrieving':
        return isExternal ? t('pos.externalPayProcessing') : t('pos.collecting');
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

  // ── Terminal unavailable (simulator / Expo Go — no native build) ──────────
  // External mode bypasses this check — no reader needed.
  if (!isExternal && !isTerminalAvailable) {
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
              {t('pos.checkoutTitle')}
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
            accessibilityLabel={t('workMode.pinCancel')}
          >
            <Text style={styles.unavailableBackText}>{t('workMode.pinCancel')}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

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
        {/* ── Reader status banner (stripe mode only) ── */}
        {!isExternal ? (
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
        ) : null}

        {/* ── Tab total preview ── */}
        {tabLoading ? (
          <View style={styles.ordersLoading}>
            <ActivityIndicator color={c.brand} />
          </View>
        ) : !hasTab ? (
          <View style={[styles.emptyOrders, { borderColor: c.borderSubtle }]}>
            <Text style={[styles.emptyOrdersText, { color: c.textTertiary }]}>
              {t('pos.nadaQueCobrar')}
            </Text>
          </View>
        ) : (
          <View
            style={[
              styles.tabAmountCard,
              { backgroundColor: c.bgSurface, borderColor: c.borderSubtle },
            ]}
          >
            <Text style={[styles.tabAmountLabel, { color: c.textSecondary }]}>
              {t('pos.pendienteLabel')} — {tableLabel}
            </Text>
            <Text style={[styles.tabAmountValue, { color: c.textPrimary }]}>
              {formatCents(tabAmountCents!)}
            </Text>
          </View>
        )}

        {/* ── Tip picker ─────────────────────────────────────────────────────── */}
        {phase === 'tip' && hasTab ? (
          <PosTipPicker
            baseCents={tabAmountCents!}
            selectedOption={selectedTipOption}
            onSelectOption={setSelectedTipOption}
            customMode={customTipMode}
            onCustomModeChange={setCustomTipMode}
            customInput={customTipInput}
            onCustomInputChange={setCustomTipInput}
            computedTipCents={computedTipCents}
          />
        ) : null}

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
                  {tabClosed ? ' ✓' : null}
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

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <View
        style={[
          styles.footer,
          { paddingBottom: insets.bottom + 16, borderTopColor: c.borderSubtle, backgroundColor: c.bgBase },
        ]}
      >
        {/* Normal state: "Cobrar $X.XX" opens the tip picker (both modes) */}
        {phase !== 'tip' && phase !== 'success' ? (
          <Pressable
            onPress={() => {
              if (canCharge) {
                setSelectedTipOption('none');
                setCustomTipInput('');
                setCustomTipMode('pct');
                setPhase('tip');
              }
            }}
            disabled={!canCharge}
            style={({ pressed }) => [
              styles.chargeBtn,
              { backgroundColor: canCharge ? c.brand : c.borderSubtle },
              pressed && canCharge && { opacity: 0.82 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={
              hasTab
                ? t('pos.chargeButton', { amount: formatCents(tabAmountCents!) })
                : t('pos.cobrar')
            }
          >
            <IconCreditCard size={20} color="#fff" strokeWidth={2} />
            <Text style={styles.chargeBtnText}>
              {hasTab
                ? t('pos.chargeButton', { amount: formatCents(tabAmountCents!) })
                : t('pos.cobrar')}
            </Text>
          </Pressable>
        ) : null}

        {/* Success phase: print + close (both modes) */}
        {phase === 'success' ? (
          <View style={styles.successFooter}>
            {defaultPrinter && defaultPrinter !== 'none' ? (
              <>
                <Pressable
                  onPress={handlePrint}
                  disabled={printStatus === 'printing'}
                  style={({ pressed }) => [
                    styles.printBtn,
                    {
                      backgroundColor:
                        printStatus === 'success' ? c.success : c.brand,
                      opacity: printStatus === 'printing' ? 0.6 : pressed ? 0.82 : 1,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={t('pos.printBtn')}
                >
                  {printStatus === 'printing' ? (
                    <ActivityIndicator color="#fff" size="small" style={{ marginRight: 8 }} />
                  ) : (
                    <IconPrinter size={20} color="#fff" strokeWidth={2} style={{ marginRight: 8 }} />
                  )}
                  <Text style={styles.printBtnText}>
                    {printStatus === 'printing'
                      ? t('pos.printingTitle')
                      : printStatus === 'success'
                      ? t('pos.printSuccess')
                      : t('pos.printBtn')}
                  </Text>
                </Pressable>

                {printStatus === 'error' && printError ? (
                  <Text style={[styles.printErrorText, { color: c.danger }]}>
                    {printError}
                  </Text>
                ) : null}
              </>
            ) : null}

            <Pressable
              onPress={() => {
                if (autoNavTimerRef.current) clearTimeout(autoNavTimerRef.current);
                if (navigation.canGoBack()) navigation.goBack();
              }}
              style={[styles.closeBtn, { borderColor: c.borderSubtle }]}
              accessibilityRole="button"
              accessibilityLabel={t('pos.printClose')}
            >
              <Text style={[styles.closeBtnText, { color: c.textSecondary }]}>
                {t('pos.printClose')}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {/* ── Tip phase footer ─────────────────────────────────────────────── */}

        {/* External mode: back + Efectivo + Tarjeta externa (stacked) */}
        {phase === 'tip' && isExternal ? (
          <View style={styles.extTipFooter}>
            <Pressable
              onPress={() => void handleExternalCharge('cash', computedTipCents)}
              style={({ pressed }) => [
                styles.extMethodBtn,
                { backgroundColor: c.success },
                pressed && { opacity: 0.82 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={t('pos.externalPayCash')}
            >
              <IconCash size={20} color="#fff" strokeWidth={2} />
              <View style={styles.extMethodBtnLabels}>
                <Text style={styles.extMethodBtnText}>{t('pos.externalPayCash')}</Text>
                <Text style={styles.extMethodBtnSub}>
                  {formatCents((tabAmountCents ?? 0) + computedTipCents)}
                  {computedTipCents > 0
                    ? `  (+${formatCents(computedTipCents)} tip)`
                    : ''}
                </Text>
              </View>
            </Pressable>

            <Pressable
              onPress={() => void handleExternalCharge('card_external', computedTipCents)}
              style={({ pressed }) => [
                styles.extMethodBtn,
                { backgroundColor: c.brand },
                pressed && { opacity: 0.82 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={t('pos.externalPayCard')}
            >
              <IconCreditCard size={20} color="#fff" strokeWidth={2} />
              <View style={styles.extMethodBtnLabels}>
                <Text style={styles.extMethodBtnText}>{t('pos.externalPayCard')}</Text>
                <Text style={styles.extMethodBtnSub}>
                  {formatCents((tabAmountCents ?? 0) + computedTipCents)}
                  {computedTipCents > 0
                    ? `  (+${formatCents(computedTipCents)} tip)`
                    : ''}
                </Text>
              </View>
            </Pressable>

            <Pressable
              onPress={() => setPhase('idle')}
              style={[styles.tipBackBtn, { borderColor: c.borderSubtle }]}
              accessibilityRole="button"
              accessibilityLabel={t('pos.tipBack')}
            >
              <Text style={[styles.tipBackBtnText, { color: c.textSecondary }]}>
                {t('pos.tipBack')}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {/* Stripe mode: back + M2 confirm button */}
        {phase === 'tip' && !isExternal ? (
          <View style={styles.tipFooterRow}>
            <Pressable
              onPress={() => setPhase('idle')}
              style={[styles.tipBackBtn, { borderColor: c.borderSubtle }]}
              accessibilityRole="button"
              accessibilityLabel={t('pos.tipBack')}
            >
              <Text style={[styles.tipBackBtnText, { color: c.textSecondary }]}>
                {t('pos.tipBack')}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => void handleStripeCharge(computedTipCents)}
              style={({ pressed }) => [
                styles.tipConfirmBtn,
                { backgroundColor: c.brand },
                pressed && { opacity: 0.82 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={t('pos.tipChargeBtn', {
                total: formatCents((tabAmountCents ?? 0) + computedTipCents),
              })}
            >
              <Text style={styles.tipConfirmBtnText}>
                {t('pos.tipChargeBtn', {
                  total: formatCents((tabAmountCents ?? 0) + computedTipCents),
                })}
              </Text>
              {computedTipCents > 0 ? (
                <Text style={styles.tipConfirmBtnSub}>
                  {t('pos.tipTipLabel', { tip: formatCents(computedTipCents) })}
                </Text>
              ) : (
                <Text style={styles.tipConfirmBtnSub}>{t('pos.tipNone')}</Text>
              )}
            </Pressable>
          </View>
        ) : null}
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

  // ── Tab total ─────────────────────────────────────────────────────────────────
  ordersLoading: { height: 80, alignItems: 'center', justifyContent: 'center' },

  emptyOrders: {
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    paddingVertical: 24,
    alignItems: 'center',
  },
  emptyOrdersText: { fontSize: 14 },

  tabAmountCard: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingVertical: 18,
    gap: 6,
  },
  tabAmountLabel: { fontSize: 13, fontWeight: '500' },
  tabAmountValue: { fontSize: 36, fontWeight: '800', letterSpacing: -1 },

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

  // ── Unavailable (simulator / no EAS build) ────────────────────────────────────
  unavailableBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 14,
  },
  unavailableTitle: { fontSize: 17, fontWeight: '700', textAlign: 'center' },
  unavailableSub: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  unavailableBack: {
    marginTop: 8,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 28,
  },
  unavailableBackText: { color: '#fff', fontSize: 15, fontWeight: '600' },

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

  // Stripe tip footer: back + confirm
  tipFooterRow: {
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

  // External mode tip footer: stacked method buttons + back
  extTipFooter: {
    gap: 10,
  },
  extMethodBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 18,
    gap: 12,
  },
  extMethodBtnLabels: { flex: 1 },
  extMethodBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  extMethodBtnSub: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 1,
  },

  // ── Success-phase print footer ────────────────────────────────────────────
  successFooter: {
    gap: 10,
  },
  printBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    paddingVertical: 15,
    paddingHorizontal: 20,
  },
  printBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  printErrorText: {
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 4,
  },
  closeBtn: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: { fontSize: 15, fontWeight: '600' },
});
