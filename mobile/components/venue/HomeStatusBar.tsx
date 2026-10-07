/**
 * JChat 3.0 — HomeStatusBar
 *
 * One fixed bar above the tab bar with up to two segments:
 *   • venue session  — "Estás en {negocio} · N mensajes · N likes"  [Volver] (reopens the chat instantly)
 *   • order in progress — "Pedido #N · {estado}" [Ver]  /  "N pedidos en curso" [Ver] (→ My orders)
 * With neither, nothing is drawn. Always mounted (the hooks keep running); `visible` says whether the
 * current screen is a tab screen.
 *
 * ONLY the orders segment can be swiped left away ("Moved to notifications · Undo", 4 s). The orders it hides
 * live on as pinned "In progress" rows in Notifications (context/OrdersBarContext). Screen readers get the same
 * thing as an accessibility action on the segment's button; "Reduce motion" skips the slide.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, PanResponder, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { IconMapPin, IconReceipt } from '@tabler/icons-react-native';

import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import { useVenueSession } from '../../context/VenueSessionContext';
import { useOrdersBar } from '../../context/OrdersBarContext';
import { useReportHomeBarInset } from './HomeBarInset';

/** Tab bar geometry (components/navigation/NotchTabBar): bottom offset 26 + inset, height 68. */
const TAB_BAR_TOP_OFFSET = 26 + 68;
const GAP = 10;

interface Props {
  /** True on the tab screens (the bar sits above the tab bar only there). */
  visible: boolean;
  onOpenChat: (roomId: string) => void;
  onOpenOrder: (orderId: string) => void;
  onOpenOrders: () => void;
}

export function HomeStatusBar({ visible, onOpenChat, onOpenOrder, onOpenOrders }: Props): React.ReactElement | null {
  const c = useThemeColors();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation('chat');
  const { t: tPos } = useTranslation('pos');
  const { session, unreadMessages, likeCount } = useVenueSession();
  const { barOrders: orders, dismiss, restore } = useOrdersBar();
  const reduceMotion = useReduceMotion();
  const [toast, setToast] = useState<{ ids: string[]; snapshot: ReturnType<typeof dismiss> } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reportInset = useReportHomeBarInset();
  const showCard = visible && (!!session || orders.length > 0);
  const shown = showCard || (visible && toast !== null);

  // Hidden → the screens get their full height back (the toast alone reserves no space).
  useEffect(() => {
    if (!showCard) reportInset(0);
    return () => reportInset(0);
  }, [showCard, reportInset]);

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  /** Swipe (or the accessibility action): every order of the bar moves to Notifications, with a 4 s undo. */
  const moveOrdersToNotifications = useCallback(() => {
    const ids = orders.map((o) => o.id);
    if (ids.length === 0) return;
    const snapshot = dismiss(ids);
    setToast({ ids, snapshot });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, [orders, dismiss]);

  const undo = useCallback(() => {
    if (!toast) return;
    restore(toast.snapshot, toast.ids);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(null);
  }, [toast, restore]);

  if (!shown) return null;

  const venueParts = session ? [t('venueSession.here', { business: session.businessName })] : [];
  if (session && unreadMessages > 0) venueParts.push(t('venueSession.messages', { count: unreadMessages }));
  if (session && likeCount > 0) venueParts.push(t('venueSession.likes', { count: likeCount }));

  const single = orders.length === 1 ? orders[0] : null;
  const orderText = single
    ? t('venueSession.order', {
        n: single.order_number,
        status: tPos(`tracking.status.${single.status}`, { defaultValue: single.status }),
      })
    : t('venueSession.orders', { count: orders.length });

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: insets.bottom + TAB_BAR_TOP_OFFSET + GAP }]}>
      {toast ? (
        <View
          accessibilityLiveRegion="polite"
          style={[styles.toast, { backgroundColor: c.bgElevated, borderColor: c.borderSubtle }]}
        >
          <Text style={[styles.toastText, { color: c.textPrimary }]} numberOfLines={1}>
            {t('venueSession.movedToNotifications')}
          </Text>
          <Pressable
            onPress={undo}
            accessibilityRole="button"
            accessibilityLabel={t('venueSession.undo')}
            hitSlop={8}
            style={styles.toastUndo}
          >
            <Text style={[styles.toastUndoLabel, { color: c.brand }]}>{t('venueSession.undo')}</Text>
          </Pressable>
        </View>
      ) : null}
      {showCard ? (
        <View
          style={[styles.card, { backgroundColor: c.bgSurface, borderColor: c.borderSubtle }]}
          onLayout={(event) => reportInset(event.nativeEvent.layout.height + GAP)}
        >
          {session ? (
            <Segment
              icon={<IconMapPin size={20} color={palette.brand} strokeWidth={2} />}
              text={venueParts.join(' · ')}
              action={t('venueSession.back')}
              actionA11y={t('venueSession.backA11y', { business: session.businessName })}
              onPress={() => onOpenChat(session.roomId)}
              textColor={c.textPrimary}
            />
          ) : null}
          {session && orders.length > 0 ? <View style={[styles.divider, { backgroundColor: c.borderSubtle }]} /> : null}
          {orders.length > 0 ? (
            <SwipeAway onSwiped={moveOrdersToNotifications} reduceMotion={reduceMotion}>
              <Segment
                icon={<IconReceipt size={20} color={palette.brand} strokeWidth={2} />}
                text={orderText}
                action={t('venueSession.view')}
                actionA11y={t('venueSession.viewA11y')}
                onPress={() => (single ? onOpenOrder(single.id) : onOpenOrders())}
                textColor={c.textPrimary}
                extraActions={[{ name: 'moveToNotifications', label: t('venueSession.moveToNotifications') }]}
                onExtraAction={moveOrdersToNotifications}
              />
            </SwipeAway>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** "Reduce motion" accessibility setting (iOS / Android), kept live. */
function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (alive) setReduce(value);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduce;
}

const SWIPE_DISTANCE_RATIO = 0.35;
const SWIPE_VELOCITY = 0.6;

/**
 * Horizontal swipe-left to remove its child. Past 35% of the width (or a quick flick) the child slides out and
 * onSwiped fires; otherwise it springs back. Taps on the child's own button still work (the pan only claims the
 * touch once it is clearly horizontal). With "Reduce motion" there is no slide: it just fires.
 */
function SwipeAway({
  children,
  onSwiped,
  reduceMotion,
}: {
  children: React.ReactNode;
  onSwiped: () => void;
  reduceMotion: boolean;
}): React.ReactElement {
  const { width: screenWidth } = useWindowDimensions();
  const translateX = useRef(new Animated.Value(0)).current;
  const widthRef = useRef(screenWidth);
  const onSwipedRef = useRef(onSwiped);
  onSwipedRef.current = onSwiped;
  const reduceRef = useRef(reduceMotion);
  reduceRef.current = reduceMotion;

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => g.dx < -8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
        onPanResponderMove: (_e, g) => translateX.setValue(Math.min(0, g.dx)),
        onPanResponderRelease: (_e, g) => {
          const passed = -g.dx > widthRef.current * SWIPE_DISTANCE_RATIO || g.vx < -SWIPE_VELOCITY;
          if (!passed) {
            Animated.spring(translateX, { toValue: 0, useNativeDriver: true, friction: 9, tension: 90 }).start();
            return;
          }
          if (reduceRef.current) {
            onSwipedRef.current();
            return;
          }
          Animated.timing(translateX, { toValue: -widthRef.current, duration: 160, useNativeDriver: true }).start(() => {
            onSwipedRef.current();
          });
        },
        onPanResponderTerminate: () => {
          Animated.spring(translateX, { toValue: 0, useNativeDriver: true, friction: 9, tension: 90 }).start();
        },
      }),
    [translateX],
  );

  return (
    <View onLayout={(event) => { widthRef.current = event.nativeEvent.layout.width; }} style={styles.swipeClip}>
      <Animated.View style={{ transform: [{ translateX }] }} {...panResponder.panHandlers}>
        {children}
      </Animated.View>
    </View>
  );
}

function Segment({
  icon,
  text,
  action,
  actionA11y,
  onPress,
  textColor,
  extraActions,
  onExtraAction,
}: {
  icon: React.ReactNode;
  text: string;
  action: string;
  actionA11y: string;
  onPress: () => void;
  textColor: string;
  extraActions?: Array<{ name: string; label: string }>;
  onExtraAction?: () => void;
}): React.ReactElement {
  return (
    <View style={styles.segment}>
      {icon}
      <Text style={[styles.text, { color: textColor }]} numberOfLines={1}>
        {text}
      </Text>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={actionA11y}
        accessibilityActions={extraActions}
        onAccessibilityAction={onExtraAction ? () => onExtraAction() : undefined}
        style={({ pressed }) => [styles.button, { backgroundColor: palette.brand, opacity: pressed ? 0.85 : 1 }]}
      >
        <Text style={[styles.buttonLabel, { color: palette.onBrand }]}>{action}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, zIndex: 900, gap: 8 },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    shadowColor: palette.shadow,
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 8,
  },
  swipeClip: { overflow: 'hidden' },
  toast: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingLeft: 14,
    paddingRight: 6,
    borderRadius: 14,
    borderWidth: 1,
  },
  toastText: { flex: 1, fontSize: 14, fontWeight: '600' },
  toastUndo: { minHeight: 44, minWidth: 44, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  toastUndoLabel: { fontSize: 14, fontWeight: '800' },
  segment: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 4,
  },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: 12 },
  text: { flex: 1, fontSize: 14, fontWeight: '600' },
  button: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonLabel: { fontSize: 14, fontWeight: '700' },
});
