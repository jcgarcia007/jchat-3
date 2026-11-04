/**
 * JChat 3.0 — VenueDock
 *
 * One Liquid Glass card (the tab bar's own material: GlassSurface 'bar') docked 8 pt above the tab bar's centre button (which rises 30 pt over the
 * bar's top edge, so the card never covers it) — on the web, which has no tab bar, at the bottom of the page. Two rows, plus a thin third one when there are orders:
 *   1. a green "live" dot · the venue's name · a red badge with the unread chat messages · "{n} people" on the right
 *   2. [Volver al chat] (brand, fills the row) · [Salir] (glass, danger text) — Salir asks first (utils/confirmLeaveVenue), then leaveVenue
 *   3. only with orders in progress: "Pedido #N · {estado}" [Ver] / "N pedidos en curso" [Ver]; swipe it left to move the orders to Notifications
 *      (4 s undo). With orders but no venue session the card is just this row.
 *
 * It is always mounted (the hooks keep running); `placement` says when it shows (navigation/venueBarPlacement.ts decides: the five tab screens, and on
 * the web the home + Messages + Offers). It hides while the keyboard is up. The height it takes is published through HomeBarInset as a BOTTOM inset: the
 * tab screens add it to their paddingBottom, so nothing is left under the card. Hidden → it reports 0.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Keyboard, PanResponder, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { IconReceipt } from '@tabler/icons-react-native';

import { GlassSurface } from '../profile/GlassSurface';
import { BAR_HEIGHT, BUTTON_SIZE, CENTER_Y } from '../navigation/notchGeometry';
import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import { useVenueSession } from '../../context/VenueSessionContext';
import { useOrdersBar } from '../../context/OrdersBarContext';
import { fetchPeopleCounts } from '../../services/venuePresence';
import { confirmLeaveVenue } from '../../utils/confirmLeaveVenue';
import { useAppWindow } from '../../utils/appWindow';
import { useReportHomeBarInset } from './HomeBarInset';

import type { VenueBarPlacement } from '../../navigation/venueBarPlacement';
import { LABEL_TEXT_CAP } from '../../theme/textScale';

export type VenueDockPlacement = VenueBarPlacement;

const IS_WEB = Platform.OS === 'web';
/** Gap between the card and the tab bar (on the web: the page's bottom edge), and the lateral margin. */
const GAP = 8;
const SIDE_MARGIN = 16;
/** The tab bar floats 26 pt above the safe area (components/navigation/NotchTabBar.tsx). */
const TAB_BAR_LIFT = 26;
/** The centre button (Ofertas) rises above the bar's top edge by this much: the card is lifted over it, so it never covers the button. */
const BUTTON_RISE = BUTTON_SIZE / 2 - CENTER_Y;
const CARD_RADIUS = 18;
const BUTTON_HEIGHT = 30;
const LEAVE_WIDTH = 60;
/** How often the people count is read again while the dock is on screen. */
const PEOPLE_REFRESH_MS = 60_000;

interface Props {
  /** Where the current screen wants the dock (see the file header). */
  placement: VenueDockPlacement;
  onOpenChat: (roomId: string) => void;
  onOpenOrder: (orderId: string) => void;
  onOpenOrders: () => void;
}

export function VenueDock({ placement, onOpenChat, onOpenOrder, onOpenOrders }: Props): React.ReactElement | null {
  const c = useThemeColors();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation('chat');
  const { t: tPos } = useTranslation('pos');
  const { session, unreadMessages, leaveVenue } = useVenueSession();
  const { barOrders: orders, dismiss, restore } = useOrdersBar();
  const reduceMotion = useReduceMotion();
  const keyboardUp = useKeyboardVisible();
  const [toast, setToast] = useState<{ ids: string[]; snapshot: ReturnType<typeof dismiss> } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reportInset = useReportHomeBarInset();

  const onScreen = placement === 'dock' && !keyboardUp;
  const showCard = onScreen && (!!session || orders.length > 0);
  const shown = showCard || (onScreen && toast !== null);
  const people = usePeopleCount(showCard && session ? session.businessId : null);

  // Hidden → the screens get their full height back (the toast alone reserves no space).
  useEffect(() => {
    if (!showCard) reportInset(0);
    return () => reportInset(0);
  }, [showCard, reportInset]);

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  /** Swipe (or the accessibility action): every order of the dock moves to Notifications, with a 4 s undo. */
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

  const leave = useCallback(() => {
    if (!session) return;
    void confirmLeaveVenue(session.businessName).then((accepted) => {
      if (accepted) void leaveVenue();
    });
  }, [session, leaveVenue]);

  if (!shown) return null;

  const single = orders.length === 1 ? orders[0] : null;
  const orderText = single
    ? t('venueSession.order', { n: single.order_number, status: tPos(`tracking.status.${single.status}`, { defaultValue: single.status }) })
    : t('venueSession.orders', { count: orders.length });
  const bottom = IS_WEB ? insets.bottom + GAP : TAB_BAR_LIFT + insets.bottom + BAR_HEIGHT + BUTTON_RISE + GAP;
  // Card height + the gap above the tab bar (on the web also the margin to the page edge, since no tab bar fills it).
  const reserve = (height: number) => Math.ceil(height) + GAP + (IS_WEB ? insets.bottom + GAP : BUTTON_RISE);

  return (
    <View testID="venue-dock" pointerEvents="box-none" style={[styles.wrap, { bottom }]}>
      {toast ? (
        <View accessibilityLiveRegion="polite" style={[styles.toast, { backgroundColor: c.bgElevated, borderColor: c.borderSubtle }]}>
          <Text maxFontSizeMultiplier={LABEL_TEXT_CAP} style={[styles.toastText, { color: c.textPrimary }]} numberOfLines={1}>
            {t('venueSession.movedToNotifications')}
          </Text>
          <Pressable onPress={undo} accessibilityRole="button" accessibilityLabel={t('venueSession.undo')} hitSlop={8} style={styles.toastUndo}>
            <Text maxFontSizeMultiplier={LABEL_TEXT_CAP} style={[styles.toastUndoLabel, { color: c.brandText }]}>{t('venueSession.undo')}</Text>
          </Pressable>
        </View>
      ) : null}
      {showCard ? (
        <View onLayout={(event) => reportInset(reserve(event.nativeEvent.layout.height))}>
          <GlassSurface variant="bar" style={styles.card}>
            {session ? (
              <View role="group" aria-label={t('venueSession.here', { business: session.businessName })}>
                <View style={styles.row1}>
                  <View style={[styles.liveDot, { backgroundColor: palette.success }]} />
                  <Text maxFontSizeMultiplier={LABEL_TEXT_CAP} testID="venue-dock-name" style={[styles.name, { color: c.textPrimary }]} numberOfLines={1}>
                    {session.businessName}
                  </Text>
                  {unreadMessages > 0 ? (
                    <View testID="venue-dock-unread" accessibilityLabel={t('venueSession.unreadA11y', { count: unreadMessages })} style={[styles.badge, { backgroundColor: palette.danger }]}>
                      <Text maxFontSizeMultiplier={LABEL_TEXT_CAP} style={[styles.badgeText, { color: palette.onBrand }]}>{unreadMessages > 99 ? '99+' : unreadMessages}</Text>
                    </View>
                  ) : null}
                  <View style={styles.spacer} />
                  {people !== null ? (
                    <Text maxFontSizeMultiplier={LABEL_TEXT_CAP} testID="venue-dock-people" style={[styles.people, { color: c.textSecondary }]} numberOfLines={1}>
                      {t('venueSession.people', { count: people })}
                    </Text>
                  ) : null}
                </View>
                <View style={styles.row2}>
                  <Pressable
                    testID="venue-dock-back"
                    onPress={() => onOpenChat(session.roomId)}
                    hitSlop={{ top: 7, bottom: 7 }}
                    accessibilityRole="button"
                    accessibilityLabel={t('venueSession.backA11y', { business: session.businessName })}
                    style={({ pressed }) => [styles.backButton, { backgroundColor: palette.brandFill, opacity: pressed ? 0.85 : 1 }]}
                  >
                    <Text maxFontSizeMultiplier={LABEL_TEXT_CAP} style={[styles.backLabel, { color: palette.onBrand }]} numberOfLines={1}>{t('venueSession.dockBack')}</Text>
                  </Pressable>
                  <Pressable
                    testID="venue-dock-leave"
                    onPress={leave}
                    hitSlop={{ top: 7, bottom: 7, left: 4, right: 4 }}
                    accessibilityRole="button"
                    accessibilityLabel={t('venueSession.dockLeaveA11y', { business: session.businessName })}
                    style={({ pressed }) => [styles.leaveButton, { backgroundColor: c.glassButtonFill, borderColor: c.glassButtonBorder, opacity: pressed ? 0.7 : 1 }]}
                  >
                    <Text maxFontSizeMultiplier={LABEL_TEXT_CAP} style={[styles.leaveLabel, { color: c.dangerText }]} numberOfLines={1}>{t('venueSession.dockLeave')}</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
            {orders.length > 0 ? (
              <View style={session ? [styles.ordersDivided, { borderTopColor: c.borderSubtle }] : undefined}>
                <SwipeAway onSwiped={moveOrdersToNotifications} reduceMotion={reduceMotion}>
                  <View testID="venue-dock-orders" style={styles.ordersRow}>
                    <IconReceipt size={18} color={palette.brand} strokeWidth={2} />
                    <Text maxFontSizeMultiplier={LABEL_TEXT_CAP} style={[styles.ordersText, { color: c.textPrimary }]} numberOfLines={1}>{orderText}</Text>
                    <Pressable
                      onPress={() => (single ? onOpenOrder(single.id) : onOpenOrders())}
                      hitSlop={{ top: 7, bottom: 7, left: 4, right: 4 }}
                      accessibilityRole="button"
                      accessibilityLabel={t('venueSession.viewA11y')}
                      accessibilityActions={[{ name: 'moveToNotifications', label: t('venueSession.moveToNotifications') }]}
                      onAccessibilityAction={() => moveOrdersToNotifications()}
                      style={({ pressed }) => [styles.viewButton, { backgroundColor: palette.brandFill, opacity: pressed ? 0.85 : 1 }]}
                    >
                      <Text maxFontSizeMultiplier={LABEL_TEXT_CAP} style={[styles.backLabel, { color: palette.onBrand }]}>{t('venueSession.view')}</Text>
                    </Pressable>
                  </View>
                </SwipeAway>
              </View>
            ) : null}
          </GlassSurface>
        </View>
      ) : null}
    </View>
  );
}

/** True while the on-screen keyboard is up (devices); the web page handles its own viewport. */
function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (IS_WEB) return undefined;
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setVisible(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return visible;
}

/**
 * How many people are in the venue, from the same server count the Map's pins use (venue_people_counts: only a number, never who). Read when the
 * dock appears and again every minute while it is on screen; null until the first answer (or when the function does not answer) — then the dock
 * just shows the name.
 */
function usePeopleCount(businessId: string | null): number | null {
  const [people, setPeople] = useState<number | null>(null);
  useEffect(() => {
    setPeople(null);
    if (!businessId) return undefined;
    let alive = true;
    const load = () => {
      void fetchPeopleCounts([businessId]).then((counts) => {
        if (alive && counts) setPeople(counts[businessId] ?? 0);
      });
    };
    load();
    const timer = setInterval(load, PEOPLE_REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [businessId]);
  return people;
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
 * Horizontal swipe-left to remove its child. Past 35% of the width (or a quick flick) the child slides out and onSwiped fires; otherwise it springs
 * back. Taps on the child's own button still work (the pan only claims the touch once it is clearly horizontal). With "Reduce motion" there is no
 * slide: it just fires.
 */
function SwipeAway({ children, onSwiped, reduceMotion }: { children: React.ReactNode; onSwiped: () => void; reduceMotion: boolean }): React.ReactElement {
  const { width: screenWidth } = useAppWindow();
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

const styles = StyleSheet.create({
  // The wrapper is anchored by its bottom edge: the card sits right above the tab bar and the undo toast (first child) floats above the card without
  // changing the card's height, which is the only thing reported through HomeBarInset.
  wrap: { position: 'absolute', left: SIDE_MARGIN, right: SIDE_MARGIN, zIndex: 900, gap: 8 },
  card: {
    borderRadius: CARD_RADIUS,
    paddingTop: 8,
    paddingRight: 8,
    paddingBottom: 8,
    paddingLeft: 11,
    shadowColor: palette.shadow,
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 8,
  },
  row1: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 20 },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  name: { flexShrink: 1, fontSize: 15, fontWeight: '600' },
  badge: { minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 11, fontWeight: '800' },
  spacer: { flex: 1 },
  people: { fontSize: 12, fontWeight: '600' },
  row2: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 7 },
  backButton: { flex: 1, minHeight: BUTTON_HEIGHT, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  backLabel: { fontSize: 13, fontWeight: '700' },
  leaveButton: { width: LEAVE_WIDTH, minHeight: BUTTON_HEIGHT, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  leaveLabel: { fontSize: 13, fontWeight: '700' },
  ordersDivided: { marginTop: 7, paddingTop: 7, borderTopWidth: StyleSheet.hairlineWidth },
  swipeClip: { overflow: 'hidden' },
  ordersRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: BUTTON_HEIGHT },
  ordersText: { flex: 1, fontSize: 13, fontWeight: '600' },
  viewButton: { minHeight: BUTTON_HEIGHT, minWidth: 56, paddingHorizontal: 14, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
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
});
