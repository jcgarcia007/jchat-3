/**
 * JChat 3.0 — OrderTrackingScreen (Task 3.8)
 *
 * Real-time order status tracker shown after a successful checkout.
 *
 * ── Features ──────────────────────────────────────────────────────────────────
 * • 3-step stepper: Confirmed (brand blue) → Preparing (warning amber) → Ready (success green)
 * • ETA countdown in minutes derived from order.eta_minutes
 * • Per-item status list (Cooking / Ready) from getOrderItems
 * • Service call bottom sheet — inserts into service_calls table, guarded by isSupabaseConfigured
 * • Real-time via subscribeOrder — unsubscribes on unmount
 * • RatingPrompt appears after status transitions to "delivered"
 * • "Back to chat" navigates to ChatRoom using roomId from route params
 * // TODO(server): send push notification when status → "ready"
 *
 * Route params: { orderId: string; roomId?: string }
 * Navigator: uses generic useNavigation / useRoute — AppNavigator registers this
 * route independently; do NOT add to MainStackParamList from this file.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  FlatList,
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
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';

import {
  IconCheck,
  IconChefHat,
  IconBellRinging,
  IconArrowLeft,
} from '@tabler/icons-react-native';

import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import { useAuth } from '../../context/AuthContext';
import { supabase, isSupabaseConfigured } from '../../services/supabase';
import {
  getOrder,
  getOrderItems,
  orderBusinessName,
  orderItemName,
  subscribeOrder,
} from '../../services/orders';
import type { OrderRow, OrderItemRow, OrderStatus } from '../../services/orders';
import { formatCents } from '../../utils/currency';
import { RatingPrompt } from '../../components/reviews/RatingPrompt';
import { toUserMessage } from '../../utils/errors';
import { notifyOrderStaff, type OrderNoticeKind } from '../../services/orders';
import { fetchVenueAccess, readVenueCoords } from '../../services/venueAccess';
import { goBackOrHome, resetToTabs } from '../../utils/navFlow';

// ── Route / Navigation types ──────────────────────────────────────────────────

/** Generic param list so we never import AppNavigator types here. */
type AnyStackParamList = {
  OrderTracking: { orderId: string; roomId?: string };
  ChatRoom: { id: string };
  [key: string]: object | undefined;
};

type OrderTrackingRoute = RouteProp<AnyStackParamList, 'OrderTracking'>;
type AnyNav = NativeStackNavigationProp<AnyStackParamList>;

// ── Stepper config ────────────────────────────────────────────────────────────

type StepLabelKey = 'tracking.stepConfirmed' | 'tracking.stepPreparing' | 'tracking.stepReady';

interface StepConfig {
  key: OrderStatus;
  labelKey: StepLabelKey;
  Icon: React.ComponentType<{ size: number; color: string }>;
  /** token color for this step's active state */
  activeColor: string;
}

const STEPS: StepConfig[] = [
  {
    key: 'confirmed',
    labelKey: 'tracking.stepConfirmed',
    Icon: IconCheck,
    activeColor: palette.brand,       // blue
  },
  {
    key: 'preparing',
    labelKey: 'tracking.stepPreparing',
    Icon: IconChefHat,
    activeColor: palette.warning,     // amber
  },
  {
    key: 'ready',
    labelKey: 'tracking.stepReady',
    Icon: IconCheck,
    activeColor: palette.success,     // green
  },
];

/** Index in STEPS for the given status (-1 = before all, 3+ = delivered/cancelled) */
function statusToStepIndex(status: OrderStatus): number {
  switch (status) {
    case 'confirmed':  return 0;
    case 'preparing':  return 1;
    case 'ready':      return 2;
    case 'delivered':  return 3; // all steps complete
    case 'cancelled':  return -1;
    default:           return -1;
  }
}

/** "Large · Bacon, Egg" from the server-verified options snapshot saved on the order item. */
function optionsSummary(options: Record<string, unknown> | null | undefined): string {
  if (!options) return '';
  const parts: string[] = [];
  if (typeof options.size === 'string' && options.size) parts.push(options.size);
  if (Array.isArray(options.extras)) parts.push(...options.extras.filter((x): x is string => typeof x === 'string'));
  if (Array.isArray(options.modifiers)) parts.push(...options.modifiers.filter((x): x is string => typeof x === 'string'));
  return parts.join(', ');
}

// ── ETA countdown ─────────────────────────────────────────────────────────────

/** Returns a formatted remaining minutes string, or null when expired / no ETA. */
function useEtaCountdown(order: OrderRow | null): string | null {
  const { t } = useTranslation('pos');
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!order || order.eta_minutes == null) {
      setRemaining(null);
      return;
    }

    // Derive target timestamp from status_updated_at (or created_at) + eta_minutes
    const baseIso = order.status_updated_at ?? order.created_at;
    const baseMs = new Date(baseIso).getTime();
    const targetMs = baseMs + order.eta_minutes * 60_000;

    function tick() {
      const diff = Math.ceil((targetMs - Date.now()) / 60_000);
      setRemaining(diff > 0 ? diff : 0);
    }

    tick();
    const id = setInterval(tick, 30_000); // refresh every 30 s
    return () => clearInterval(id);
  }, [order]);

  if (remaining === null) return null;
  if (remaining === 0) return t('tracking.anyMoment');
  return t('tracking.etaMinutes', { min: remaining });
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function OrderTrackingScreen(): React.ReactElement {
  const c = useThemeColors();
  const { t } = useTranslation('pos');
  const { user } = useAuth();

  const route = useRoute<OrderTrackingRoute>();
  const navigation = useNavigation<AnyNav>();

  const { orderId, roomId } = route.params ?? {};

  // ── Local state
  const [order, setOrder] = useState<OrderRow | null>(null);
  const [items, setItems] = useState<OrderItemRow[]>([]);
  const [loadingOrder, setLoadingOrder] = useState(true);
  const [showServiceSheet, setShowServiceSheet] = useState(false);
  const [serviceCallLoading, setServiceCallLoading] = useState(false);
  // "Avisar al local" (migration 200): notice about an already paid order.
  const [showNoticeSheet, setShowNoticeSheet] = useState(false);
  const [noticeQuestion, setNoticeQuestion] = useState(false);
  const [noticeText, setNoticeText] = useState('');
  const [noticeSending, setNoticeSending] = useState(false);
  const [ratingDone, setRatingDone] = useState(false);

  const [loadError, setLoadError] = useState(false);

  // Track previous status to detect "delivered" transition
  const prevStatusRef = useRef<OrderStatus | null>(null);
  // Bumped on every realtime update: a slower read that started earlier must not overwrite it.
  const liveVersionRef = useRef(0);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // ── Load (initial, on SUBSCRIBED, and when the app comes back to the foreground) ──
  const load = useCallback(async () => {
    if (!orderId) { setLoadingOrder(false); return; }
    const versionAtStart = liveVersionRef.current;
    try {
      const [orderData, itemsData] = await Promise.all([
        getOrder(orderId),
        getOrderItems(orderId),
      ]);
      if (!mountedRef.current) return;
      setLoadError(false);
      if (orderData && liveVersionRef.current === versionAtStart) {
        prevStatusRef.current = orderData.status;
        setOrder(orderData);
      }
      setItems(itemsData);
    } catch (err) {
      console.warn('[OrderTracking] load error', err);
      if (mountedRef.current) setLoadError(true);
    } finally {
      if (mountedRef.current) setLoadingOrder(false);
    }
  }, [orderId]);

  useEffect(() => { void load(); }, [load]);

  // ── Real-time subscription (refetch once it is live, so nothing between read and subscribe is lost)
  useEffect(() => {
    if (!orderId) return;

    const unsubscribe = subscribeOrder(
      orderId,
      (updated) => {
        // TODO(server): push on ready — handled server-side; client receives the update here
        liveVersionRef.current += 1;
        // The realtime row has no joins: keep the business we already loaded.
        setOrder((previous) => ({ ...(previous ?? updated), ...updated, businesses: previous?.businesses }));
        prevStatusRef.current = updated.status;
      },
      () => { void load(); },
    );

    return unsubscribe;
  }, [orderId, load]);

  // ── Back from the background: the socket may have dropped, so read again
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void load();
    });
    return () => subscription.remove();
  }, [load]);

  // ── Refresh items when order status changes (cooking → ready)
  useEffect(() => {
    if (!orderId || !order) return;
    void getOrderItems(orderId).then(setItems).catch(() => {});
  }, [orderId, order?.status]);

  // ── ETA countdown
  const etaLabel = useEtaCountdown(order);

  // ── Stepper derived values
  const currentStepIdx = useMemo(
    () => (order ? statusToStepIndex(order.status) : -1),
    [order],
  );

  // ── Show rating after delivered
  const isDelivered = order?.status === 'delivered';
  const showRating = isDelivered && !ratingDone;

  // ── Back to chat
  const handleBackToChat = useCallback(() => {
    if (roomId) {
      // Cast navigation to accept ChatRoom with generic id param
      (navigation as NativeStackNavigationProp<{ ChatRoom: { id: string }; [k: string]: object | undefined }>).navigate('ChatRoom', { id: roomId });
    } else {
      resetToTabs(navigation);
    }
  }, [navigation, roomId]);

  // Arrow / Android back: to wherever we came from (My orders, Tabs); never into the order flow or the chat.
  const handleBack = useCallback(() => goBackOrHome(navigation), [navigation]);
  const handleGoHome = useCallback(() => resetToTabs(navigation), [navigation]);

  // "Back to chat" only makes sense if the person is at the venue (server verdict, not a guess).
  const [canReturnToChat, setCanReturnToChat] = useState(false);
  const orderBusinessId = order?.business_id ?? null;
  useEffect(() => {
    if (!orderBusinessId || !roomId) {
      setCanReturnToChat(false);
      return;
    }
    let alive = true;
    void readVenueCoords()
      .then((coords) => fetchVenueAccess(orderBusinessId, coords))
      .then((access) => {
        if (alive) setCanReturnToChat(access.inside);
      });
    return () => {
      alive = false;
    };
  }, [orderBusinessId, roomId]);

  // ── Service call
  const handleServiceCall = useCallback(async () => {
    if (!isSupabaseConfigured) {
      Alert.alert(t('tracking.serviceUnavailableTitle'), t('tracking.serviceUnavailableMessage'));
      return;
    }
    if (!order || !user) return;

    setServiceCallLoading(true);
    try {
      const { error } = await supabase.from('service_calls').insert({
        room_id: order.room_id,
        business_id: order.business_id,
        user_id: user.id,
        status: 'pending',
        type: 'assistance',
      });
      if (error) throw error;
      setShowServiceSheet(false);
      Alert.alert(t('tracking.staffNotifiedTitle'), t('tracking.staffNotifiedMessage'));
    } catch (err) {
      // Golden rule: the waiter call needs the venue presence; outside it is explained, not "generic".
      const outside = /outside_venue/.test(String((err as { message?: unknown } | null)?.message ?? ''));
      const msg = outside ? t('tracking.waiterOutside') : toUserMessage(err, 'pos:tracking.genericError');
      Alert.alert(t('shared.errorTitle'), msg);
    } finally {
      setServiceCallLoading(false);
    }
  }, [order, user, t]);

  const closeNoticeSheet = useCallback(() => {
    setShowNoticeSheet(false);
    setNoticeQuestion(false);
    setNoticeText('');
  }, []);

  const sendNotice = useCallback(
    async (kind: OrderNoticeKind, note?: string) => {
      if (!order || noticeSending) return;
      setNoticeSending(true);
      const result = await notifyOrderStaff(order.id, kind, note);
      setNoticeSending(false);
      if (result.ok) {
        closeNoticeSheet();
        Alert.alert(t('tracking.noticeSent'));
        return;
      }
      Alert.alert(t('shared.errorTitle'), t(`tracking.noticeErr.${result.error}`));
    },
    [order, noticeSending, closeNoticeSheet, t],
  );

  // ── Styles
  const styles = useMemo(() => makeStyles(c), [c]);

  // ── Loading / error states
  if (loadingOrder) {
    return (
      <SafeAreaView style={styles.centerContainer}>
        <ActivityIndicator size="large" color={c.brand} />
      </SafeAreaView>
    );
  }

  if (!order) {
    return (
      <SafeAreaView style={styles.centerContainer}>
        <Text style={styles.errorText}>
          {loadError ? t('tracking.loadError') : t('tracking.orderNotFound')}
        </Text>
        {loadError ? (
          <Pressable onPress={() => { setLoadingOrder(true); void load(); }} style={styles.backBtn}>
            <Text style={styles.backBtnLabel}>{t('tracking.retry')}</Text>
          </Pressable>
        ) : null}
        <Pressable onPress={handleBack} style={styles.backBtn}>
          <Text style={styles.backBtnLabel}>{t('shared.goBack')}</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const isCancelled = order.status === 'cancelled';
  const isAwaitingApproval = order.approval_status === 'awaiting';
  const isRejected = order.approval_status === 'rejected';
  const isDisputed = order.status === 'disputed';
  const isPending = order.status === 'pending' && !isAwaitingApproval && !isRejected;
  // The stepper only makes sense for an order that is moving through the kitchen.
  const showStepper = !isCancelled && !isDisputed && !isAwaitingApproval && !isRejected;
  const businessName = orderBusinessName(order);

  return (
    <SafeAreaView style={styles.root}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <Pressable
          onPress={handleBack}
          style={styles.headerBack}
          accessibilityRole="button"
          accessibilityLabel={t('shared.goBack')}
        >
          <IconArrowLeft size={22} color={c.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('cart.yourOrder')}</Text>
        {/* Spacer to center title */}
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Who and which order ── */}
        {order.order_number != null || businessName ? (
          <Text style={styles.orderHeading}>
            {[
              order.order_number != null ? t('success.orderNumberValue', { number: order.order_number }) : null,
              businessName,
            ].filter(Boolean).join(' · ')}
          </Text>
        ) : null}

        {/* ── Status banners (every state an order can be in) ── */}
        {isCancelled && (
          <View style={[styles.statusBanner, { backgroundColor: c.danger }]}>
            <Text style={styles.statusBannerText}>{t('tracking.orderCancelled')}</Text>
          </View>
        )}
        {isAwaitingApproval && (
          <View style={[styles.statusBanner, { backgroundColor: palette.warning }]}>
            <Text style={styles.statusBannerText}>{t('tracking.awaitingApproval')}</Text>
          </View>
        )}
        {isRejected && (
          <View style={[styles.statusBanner, { backgroundColor: c.danger }]}>
            <Text style={styles.statusBannerText}>
              {order.rejected_reason
                ? t('tracking.rejected', { reason: order.rejected_reason })
                : t('tracking.rejectedNoReason')}
            </Text>
          </View>
        )}
        {isDisputed && (
          <View style={[styles.statusBanner, { backgroundColor: palette.warning }]}>
            <Text style={styles.statusBannerText}>{t('tracking.disputed')}</Text>
          </View>
        )}
        {isPending && (
          <View style={[styles.statusBanner, { backgroundColor: c.brand }]}>
            <Text style={styles.statusBannerText}>{t('tracking.orderPending')}</Text>
          </View>
        )}

        {/* ── ETA Card ── */}
        {showStepper && !isDelivered && etaLabel !== null && (
          <View style={styles.etaCard}>
            <Text style={styles.etaLabel}>{t('tracking.estimatedWait')}</Text>
            <Text style={styles.etaValue}>{etaLabel}</Text>
          </View>
        )}

        {/* ── Stepper ── */}
        {showStepper && (
          <View style={styles.stepperContainer}>
            {STEPS.map((step, idx) => {
              const isActive = idx <= currentStepIdx;
              const isCurrent = idx === currentStepIdx;
              const stepColor = isActive ? step.activeColor : c.borderSubtle;
              const isLast = idx === STEPS.length - 1;

              return (
                <View key={step.key} style={styles.stepRow}>
                  {/* Icon + connector */}
                  <View style={styles.stepIconCol}>
                    <View
                      style={[
                        styles.stepIconCircle,
                        {
                          backgroundColor: isActive ? stepColor : c.bgElevated,
                          borderColor: stepColor,
                        },
                      ]}
                    >
                      <step.Icon
                        size={18}
                        color={isActive ? c.bgSurface : c.textTertiary}
                      />
                    </View>
                    {!isLast && (
                      <View
                        style={[
                          styles.stepConnector,
                          {
                            backgroundColor:
                              idx < currentStepIdx ? step.activeColor : c.borderSubtle,
                          },
                        ]}
                      />
                    )}
                  </View>

                  {/* Label + sublabel */}
                  <View style={styles.stepTextCol}>
                    <Text
                      style={[
                        styles.stepLabel,
                        { color: isActive ? c.textPrimary : c.textTertiary },
                        isCurrent && styles.stepLabelCurrent,
                      ]}
                    >
                      {t(step.labelKey)}
                    </Text>
                    {isCurrent && order.status !== 'delivered' && (
                      <Text style={styles.stepSublabel}>{t('tracking.inProgress')}</Text>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* ── Delivered badge ── */}
        {isDelivered && (
          <View style={[styles.statusBanner, { backgroundColor: c.success }]}>
            <IconCheck size={18} color={c.bgSurface} />
            <Text style={styles.statusBannerText}>{t('tracking.delivered')}</Text>
          </View>
        )}

        {/* ── Rating prompt (after delivery) ── */}
        {showRating && (
          <View style={styles.ratingContainer}>
            <RatingPrompt
              businessId={order.business_id}
              businessName={businessName ?? t('tracking.thisBusiness')}
              onDone={() => setRatingDone(true)}
            />
          </View>
        )}

        {/* ── Per-item list ── */}
        {items.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('tracking.yourItems')}</Text>
            {items.map((item) => (
              <View key={item.id} style={styles.itemRow}>
                <View style={styles.itemLeft}>
                  <Text style={styles.itemQty}>{item.qty}×</Text>
                  <View style={styles.itemNameCol}>
                    <Text style={styles.itemName}>
                      {orderItemName(item) ?? t('tracking.itemUnknown')}
                    </Text>
                    {optionsSummary(item.options) ? (
                      <Text style={styles.itemOptions}>{optionsSummary(item.options)}</Text>
                    ) : null}
                  </View>
                </View>
                <View
                  style={[
                    styles.itemStatusBadge,
                    {
                      backgroundColor:
                        item.item_status === 'ready'
                          ? palette.success + '22'
                          : item.item_status === 'preparing'
                            ? palette.warning + '22'
                            : c.bgElevated,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.itemStatusText,
                      {
                        color:
                          item.item_status === 'ready'
                            ? palette.success
                            : item.item_status === 'preparing'
                              ? palette.warning
                              : c.textSecondary,
                      },
                    ]}
                  >
                    {item.item_status === 'ready'
                      ? t('tracking.statusReady')
                      : item.item_status === 'preparing'
                        ? t('tracking.statusCooking')
                        : t('tracking.statusPending')}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* ── Order summary ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('shared.orderSummary')}</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>{t('cart.subtotal')}</Text>
            <Text style={styles.summaryValue}>
              {formatCents(order.subtotal_cents)}
            </Text>
          </View>
          {order.tax_cents > 0 && (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>{t('tracking.tax')}</Text>
              <Text style={styles.summaryValue}>
                {formatCents(order.tax_cents)}
              </Text>
            </View>
          )}
          {order.tip_cents > 0 && (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>{t('tracking.tip')}</Text>
              <Text style={styles.summaryValue}>
                {formatCents(order.tip_cents)}
              </Text>
            </View>
          )}
          {order.discount_cents > 0 && (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>{t('tracking.discount')}</Text>
              <Text style={[styles.summaryValue, { color: c.success }]}>
                −{formatCents(order.discount_cents)}
              </Text>
            </View>
          )}
          <View style={[styles.summaryRow, styles.summaryTotal]}>
            <Text style={styles.summaryTotalLabel}>{t('cart.total')}</Text>
            <Text style={styles.summaryTotalValue}>
              {formatCents(order.total_cents)}
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* ── Bottom actions ── */}
      <View style={styles.bottomBar}>
        {/* "Avisar al local": notice about a PAID order (replaces the generic staff call) */}
        {showStepper && !isDelivered && (
          <Pressable
            onPress={() => setShowNoticeSheet(true)}
            style={styles.serviceBtn}
            accessibilityRole="button"
            accessibilityLabel={t('tracking.noticeBtn')}
          >
            <IconBellRinging size={20} color={c.bgSurface} />
            <Text style={styles.serviceBtnLabel}>{t('tracking.noticeBtn')}</Text>
          </Pressable>
        )}

        {/* Table orders keep "Call the waiter" apart (golden rule: needs the venue presence) */}
        {showStepper && !isDelivered && order.order_type === 'table' && (
          <Pressable
            onPress={() => setShowServiceSheet(true)}
            style={styles.chatBtn}
            accessibilityRole="button"
            accessibilityLabel={t('tracking.callServiceA11y')}
          >
            <Text style={styles.chatBtnLabel}>{t('tracking.callStaff')}</Text>
          </Pressable>
        )}

        {/* Secondary: back to the chat only with an active venue presence; otherwise home */}
        {canReturnToChat ? (
          <Pressable
            onPress={handleBackToChat}
            style={styles.chatBtn}
            accessibilityRole="button"
            accessibilityLabel={t('tracking.backToChatA11y')}
          >
            <Text style={styles.chatBtnLabel} numberOfLines={1}>{t('tracking.backToChat')}</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={handleGoHome}
            style={styles.chatBtn}
            accessibilityRole="button"
            accessibilityLabel={t('tracking.backToHome')}
          >
            <Text style={styles.chatBtnLabel} numberOfLines={1}>{t('tracking.backToHome')}</Text>
          </Pressable>
        )}
      </View>

      {/* ── "Avisar al local" sheet ── */}
      <Modal visible={showNoticeSheet} transparent animationType="slide" onRequestClose={closeNoticeSheet}>
        <Pressable style={styles.sheetOverlay} onPress={closeNoticeSheet} accessibilityRole="none" />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>{t('tracking.noticeBtn')}</Text>

          {!noticeQuestion ? (
            <>
              {order.order_type === 'counter' && (
                <>
                  <Pressable
                    onPress={() => void sendNotice('on_my_way')}
                    disabled={noticeSending}
                    style={[styles.noticeOption, noticeSending && styles.sheetBtnDisabled]}
                    accessibilityRole="button"
                  >
                    <Text style={styles.noticeOptionLabel}>{t('tracking.noticeOnMyWay')}</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => void sendNotice('arrived')}
                    disabled={noticeSending}
                    style={[styles.noticeOption, noticeSending && styles.sheetBtnDisabled]}
                    accessibilityRole="button"
                  >
                    <Text style={styles.noticeOptionLabel}>{t('tracking.noticeArrived')}</Text>
                  </Pressable>
                </>
              )}
              <Pressable
                onPress={() => setNoticeQuestion(true)}
                disabled={noticeSending}
                style={styles.noticeOption}
                accessibilityRole="button"
              >
                <Text style={styles.noticeOptionLabel}>{t('tracking.noticeQuestion')}</Text>
              </Pressable>
            </>
          ) : (
            <>
              <TextInput
                value={noticeText}
                onChangeText={setNoticeText}
                maxLength={200}
                multiline
                placeholder={t('tracking.noticeQuestionPlaceholder')}
                placeholderTextColor={c.textTertiary}
                style={styles.noticeInput}
                accessibilityLabel={t('tracking.noticeQuestion')}
              />
              <Pressable
                onPress={() => void sendNotice('question', noticeText)}
                disabled={noticeSending || noticeText.trim().length === 0}
                style={[styles.sheetConfirmBtn, (noticeSending || noticeText.trim().length === 0) && styles.sheetBtnDisabled]}
                accessibilityRole="button"
              >
                {noticeSending ? (
                  <ActivityIndicator size="small" color={c.bgSurface} />
                ) : (
                  <Text style={styles.sheetConfirmLabel}>{t('tracking.noticeSend')}</Text>
                )}
              </Pressable>
            </>
          )}

          <Pressable onPress={closeNoticeSheet} style={styles.sheetCancelBtn} accessibilityRole="button">
            <Text style={styles.sheetCancelLabel}>{t('actions.cancel', { ns: 'common' })}</Text>
          </Pressable>
        </View>
      </Modal>

      {/* ── Service call bottom sheet (Modal) ── */}
      <Modal
        visible={showServiceSheet}
        transparent
        animationType="slide"
        onRequestClose={() => setShowServiceSheet(false)}
      >
        <Pressable
          style={styles.sheetOverlay}
          onPress={() => setShowServiceSheet(false)}
          accessibilityRole="none"
        />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />

          <Text style={styles.sheetTitle}>{t('tracking.sheetTitle')}</Text>
          <Text style={styles.sheetBody}>
            {t('tracking.sheetBody')}
          </Text>

          <Pressable
            onPress={() => void handleServiceCall()}
            disabled={serviceCallLoading}
            style={[styles.sheetConfirmBtn, serviceCallLoading && styles.sheetBtnDisabled]}
            accessibilityRole="button"
            accessibilityLabel={t('tracking.confirmServiceA11y')}
            accessibilityState={{ disabled: serviceCallLoading }}
          >
            {serviceCallLoading ? (
              <ActivityIndicator size="small" color={c.bgSurface} />
            ) : (
              <>
                <IconBellRinging size={18} color={c.bgSurface} />
                <Text style={styles.sheetConfirmLabel}>{t('tracking.notifyStaff')}</Text>
              </>
            )}
          </Pressable>

          <Pressable
            onPress={() => setShowServiceSheet(false)}
            style={styles.sheetCancelBtn}
            accessibilityRole="button"
            accessibilityLabel={t('actions.cancel', { ns: 'common' })}
          >
            <Text style={styles.sheetCancelLabel}>{t('actions.cancel', { ns: 'common' })}</Text>
          </Pressable>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function makeStyles(c: ReturnType<typeof useThemeColors>) {
  return StyleSheet.create({
    // ── Layout
    root: {
      flex: 1,
      backgroundColor: c.bgBase,
    },
    centerContainer: {
      flex: 1,
      backgroundColor: c.bgBase,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      padding: 16,
      gap: 16,
      paddingBottom: 32,
    },

    // ── Header
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingTop: 8, // status-bar inset comes from SafeAreaView (safe-area-context)
      paddingBottom: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.borderSubtle,
    },
    headerBack: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: c.bgElevated,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      flex: 1,
      textAlign: 'center',
      fontSize: 17,
      fontWeight: '600',
      color: c.textPrimary,
    },
    headerSpacer: {
      width: 36,
    },

    // ── Error
    errorText: {
      fontSize: 16,
      color: c.textSecondary,
      marginBottom: 16,
      textAlign: 'center',
    },

    // ── ETA
    etaCard: {
      backgroundColor: c.bgSurface,
      borderRadius: 14,
      padding: 18,
      alignItems: 'center',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.borderSubtle,
    },
    etaLabel: {
      fontSize: 13,
      color: c.textSecondary,
      marginBottom: 4,
    },
    etaValue: {
      fontSize: 28,
      fontWeight: '700',
      color: c.textPrimary,
    },

    // ── Status banner (delivered / cancelled)
    statusBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderRadius: 12,
      padding: 14,
    },
    statusBannerText: {
      fontSize: 15,
      fontWeight: '600',
      color: c.bgSurface,
    },

    // ── Stepper
    stepperContainer: {
      backgroundColor: c.bgSurface,
      borderRadius: 14,
      padding: 20,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.borderSubtle,
    },
    stepRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
    },
    stepIconCol: {
      alignItems: 'center',
      width: 40,
    },
    stepIconCircle: {
      width: 36,
      height: 36,
      borderRadius: 18,
      borderWidth: 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepConnector: {
      width: 2,
      height: 28,
      marginVertical: 2,
    },
    stepTextCol: {
      flex: 1,
      paddingLeft: 12,
      paddingBottom: 24,
      justifyContent: 'center',
      minHeight: 36,
    },
    stepLabel: {
      fontSize: 15,
      fontWeight: '500',
    },
    stepLabelCurrent: {
      fontWeight: '700',
    },
    stepSublabel: {
      fontSize: 12,
      color: palette.warning,
      marginTop: 2,
    },

    // ── Items
    section: {
      backgroundColor: c.bgSurface,
      borderRadius: 14,
      padding: 16,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.borderSubtle,
      gap: 10,
    },
    sectionTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: c.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginBottom: 4,
    },
    itemRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    itemLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      gap: 6,
    },
    itemQty: {
      fontSize: 14,
      fontWeight: '600',
      color: c.textSecondary,
      minWidth: 28,
    },
    orderHeading: {
      color: c.textSecondary,
      fontSize: 14,
      fontWeight: '600',
      textAlign: 'center',
    },
    itemNameCol: { flexShrink: 1 },
    itemOptions: { color: c.textTertiary, fontSize: 12, marginTop: 2 },
    itemName: {
      fontSize: 14,
      color: c.textPrimary,
      flex: 1,
    },
    itemStatusBadge: {
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    itemStatusText: {
      fontSize: 12,
      fontWeight: '600',
    },

    // ── Summary
    summaryRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    summaryLabel: {
      fontSize: 14,
      color: c.textSecondary,
    },
    summaryValue: {
      fontSize: 14,
      color: c.textPrimary,
    },
    summaryTotal: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.borderSubtle,
      paddingTop: 10,
      marginTop: 4,
    },
    summaryTotalLabel: {
      fontSize: 15,
      fontWeight: '700',
      color: c.textPrimary,
    },
    summaryTotalValue: {
      fontSize: 15,
      fontWeight: '700',
      color: c.textPrimary,
    },

    // ── Rating
    ratingContainer: {
      borderRadius: 14,
      overflow: 'hidden',
    },

    // ── Bottom bar
    bottomBar: {
      flexDirection: 'column',
      gap: 12,
      padding: 16,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.borderSubtle,
      backgroundColor: c.bgBase,
    },
    serviceBtn: {
      alignSelf: 'stretch',
      minHeight: 52,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: c.brand,
      borderRadius: 12,
      paddingVertical: 14,
    },
    serviceBtnLabel: {
      fontSize: 15,
      fontWeight: '600',
      color: c.bgSurface,
    },
    chatBtn: {
      alignSelf: 'stretch',
      minHeight: 52,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'transparent',
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.borderSubtle,
      paddingHorizontal: 16,
    },
    chatBtnLabel: {
      fontSize: 15,
      fontWeight: '600',
      color: c.textPrimary,
      textAlign: 'center',
    },

    // ── Generic button
    backBtn: {
      marginTop: 12,
      paddingVertical: 10,
      paddingHorizontal: 24,
      backgroundColor: c.bgElevated,
      borderRadius: 10,
    },
    backBtnLabel: {
      fontSize: 15,
      color: c.textPrimary,
    },

    // ── Service call sheet
    sheetOverlay: {
      flex: 1,
      backgroundColor: palette.scrimMedium,
    },
    sheet: {
      backgroundColor: c.bgSurface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      padding: 24,
      paddingBottom: Platform.OS === 'ios' ? 40 : 24,
      gap: 12,
    },
    sheetHandle: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: c.borderSubtle,
      marginBottom: 8,
    },
    sheetTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: c.textPrimary,
      textAlign: 'center',
    },
    sheetBody: {
      fontSize: 14,
      color: c.textSecondary,
      textAlign: 'center',
      lineHeight: 20,
    },
    sheetConfirmBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: c.brand,
      borderRadius: 12,
      paddingVertical: 14,
      marginTop: 4,
    },
    sheetBtnDisabled: {
      opacity: 0.5,
    },
    sheetConfirmLabel: {
      fontSize: 15,
      fontWeight: '600',
      color: c.bgSurface,
    },
    noticeOption: {
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 52,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.borderSubtle,
      paddingHorizontal: 16,
    },
    noticeOptionLabel: {
      fontSize: 16,
      fontWeight: '600',
      color: c.textPrimary,
      textAlign: 'center',
    },
    noticeInput: {
      minHeight: 88,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.borderSubtle,
      padding: 12,
      fontSize: 15,
      color: c.textPrimary,
      textAlignVertical: 'top',
    },
    sheetCancelBtn: {
      alignItems: 'center',
      paddingVertical: 10,
    },
    sheetCancelLabel: {
      fontSize: 15,
      color: c.textSecondary,
    },
  });
}
