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
  FlatList,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
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
  subscribeOrder,
} from '../../services/orders';
import type { OrderRow, OrderItemRow, OrderStatus } from '../../services/orders';
import { RatingPrompt } from '../../components/reviews/RatingPrompt';

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
  const [ratingDone, setRatingDone] = useState(false);

  // Track previous status to detect "delivered" transition
  const prevStatusRef = useRef<OrderStatus | null>(null);

  // ── Initial load
  useEffect(() => {
    let mounted = true;

    async function load() {
      if (!orderId) return;
      try {
        const [orderData, itemsData] = await Promise.all([
          getOrder(orderId),
          getOrderItems(orderId),
        ]);
        if (!mounted) return;
        if (orderData) {
          prevStatusRef.current = orderData.status;
          setOrder(orderData);
        }
        setItems(itemsData);
      } catch (err) {
        console.warn('[OrderTracking] load error', err);
      } finally {
        if (mounted) setLoadingOrder(false);
      }
    }

    void load();
    return () => { mounted = false; };
  }, [orderId]);

  // ── Real-time subscription
  useEffect(() => {
    if (!orderId) return;

    const unsubscribe = subscribeOrder(orderId, (updated) => {
      // TODO(server): push on ready — handled server-side; client receives the update here
      setOrder(updated);
      prevStatusRef.current = updated.status;
    });

    return unsubscribe;
  }, [orderId]);

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
      navigation.goBack();
    }
  }, [navigation, roomId]);

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
      const msg = err instanceof Error ? err.message : t('tracking.genericError');
      Alert.alert(t('shared.errorTitle'), msg);
    } finally {
      setServiceCallLoading(false);
    }
  }, [order, user, t]);

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
        <Text style={styles.errorText}>{t('tracking.orderNotFound')}</Text>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnLabel}>{t('shared.goBack')}</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const isCancelled = order.status === 'cancelled';

  return (
    <SafeAreaView style={styles.root}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <Pressable
          onPress={handleBackToChat}
          style={styles.headerBack}
          accessibilityRole="button"
          accessibilityLabel={t('tracking.backToChatA11y')}
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
        {/* ── Cancelled banner ── */}
        {isCancelled && (
          <View style={[styles.statusBanner, { backgroundColor: c.danger }]}>
            <Text style={styles.statusBannerText}>{t('tracking.orderCancelled')}</Text>
          </View>
        )}

        {/* ── ETA Card ── */}
        {!isCancelled && !isDelivered && etaLabel !== null && (
          <View style={styles.etaCard}>
            <Text style={styles.etaLabel}>{t('tracking.estimatedWait')}</Text>
            <Text style={styles.etaValue}>{etaLabel}</Text>
          </View>
        )}

        {/* ── Stepper ── */}
        {!isCancelled && (
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
              businessName={t('tracking.thisBusiness')} // TODO: pass business name through route params in a future update
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
                  <Text style={styles.itemName}>
                    {/* menu_item_id used as fallback label until name join is added */}
                    {t('tracking.itemFallback', { id: item.menu_item_id.slice(0, 8) })}
                  </Text>
                </View>
                <View
                  style={[
                    styles.itemStatusBadge,
                    {
                      backgroundColor:
                        item.item_status === 'ready'
                          ? palette.success + '22'
                          : palette.warning + '22',
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
                            : palette.warning,
                      },
                    ]}
                  >
                    {item.item_status === 'ready' ? t('tracking.statusReady') : t('tracking.statusCooking')}
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
              ${(order.subtotal_cents / 100).toFixed(2)}
            </Text>
          </View>
          {order.tax_cents > 0 && (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>{t('tracking.tax')}</Text>
              <Text style={styles.summaryValue}>
                ${(order.tax_cents / 100).toFixed(2)}
              </Text>
            </View>
          )}
          {order.tip_cents > 0 && (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>{t('tracking.tip')}</Text>
              <Text style={styles.summaryValue}>
                ${(order.tip_cents / 100).toFixed(2)}
              </Text>
            </View>
          )}
          {order.discount_cents > 0 && (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>{t('tracking.discount')}</Text>
              <Text style={[styles.summaryValue, { color: c.success }]}>
                −${(order.discount_cents / 100).toFixed(2)}
              </Text>
            </View>
          )}
          <View style={[styles.summaryRow, styles.summaryTotal]}>
            <Text style={styles.summaryTotalLabel}>{t('cart.total')}</Text>
            <Text style={styles.summaryTotalValue}>
              ${(order.total_cents / 100).toFixed(2)}
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* ── Bottom actions ── */}
      <View style={styles.bottomBar}>
        {/* Service call button */}
        {!isCancelled && !isDelivered && (
          <Pressable
            onPress={() => setShowServiceSheet(true)}
            style={styles.serviceBtn}
            accessibilityRole="button"
            accessibilityLabel={t('tracking.callServiceA11y')}
          >
            <IconBellRinging size={20} color={c.bgSurface} />
            <Text style={styles.serviceBtnLabel}>{t('tracking.callStaff')}</Text>
          </Pressable>
        )}

        {/* Back to chat */}
        {roomId ? (
          <Pressable
            onPress={handleBackToChat}
            style={[styles.chatBtn, !(!isCancelled && !isDelivered) && styles.chatBtnFull]}
            accessibilityRole="button"
            accessibilityLabel={t('tracking.backToChatA11y')}
          >
            <Text style={styles.chatBtnLabel}>{t('tracking.backToChat')}</Text>
          </Pressable>
        ) : null}
      </View>

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
      paddingTop: Platform.OS === 'android' ? 16 : 8,
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
      flexDirection: 'row',
      gap: 10,
      padding: 16,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.borderSubtle,
      backgroundColor: c.bgBase,
    },
    serviceBtn: {
      flex: 1,
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
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.bgElevated,
      borderRadius: 12,
      paddingVertical: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.borderSubtle,
    },
    chatBtnFull: {
      flex: 2,
    },
    chatBtnLabel: {
      fontSize: 15,
      fontWeight: '500',
      color: c.textPrimary,
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
      backgroundColor: 'rgba(0,0,0,0.5)',
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
