/**
 * JChat 3.0 — HomeStatusBar
 *
 * One fixed bar above the tab bar with up to two segments:
 *   • venue session  — "Estás en {negocio} · N mensajes · N likes"  [Volver] (reopens the chat instantly)
 *   • order in progress — "Pedido #N · {estado}" [Ver]  /  "N pedidos en curso" [Ver] (→ My orders)
 * With neither, nothing is drawn. Always mounted (the hooks keep running); `visible` says whether the
 * current screen is a tab screen.
 */

import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { IconMapPin, IconReceipt } from '@tabler/icons-react-native';

import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import { useAuth } from '../../context/AuthContext';
import { useVenueSession } from '../../context/VenueSessionContext';
import { useActiveOrders } from '../../hooks/useActiveOrders';
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
  const { user } = useAuth();
  const { session, unreadMessages, likeCount } = useVenueSession();
  const orders = useActiveOrders(user?.id ?? null);
  const reportInset = useReportHomeBarInset();
  const shown = visible && (!!session || orders.length > 0);

  // Hidden → the screens get their full height back.
  useEffect(() => {
    if (!shown) reportInset(0);
    return () => reportInset(0);
  }, [shown, reportInset]);

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
          <Segment
            icon={<IconReceipt size={20} color={palette.brand} strokeWidth={2} />}
            text={orderText}
            action={t('venueSession.view')}
            actionA11y={t('venueSession.viewA11y')}
            onPress={() => (single ? onOpenOrder(single.id) : onOpenOrders())}
            textColor={c.textPrimary}
          />
        ) : null}
      </View>
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
}: {
  icon: React.ReactNode;
  text: string;
  action: string;
  actionA11y: string;
  onPress: () => void;
  textColor: string;
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
        style={({ pressed }) => [styles.button, { backgroundColor: palette.brand, opacity: pressed ? 0.85 : 1 }]}
      >
        <Text style={[styles.buttonLabel, { color: palette.onBrand }]}>{action}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, zIndex: 900 },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    shadowColor: palette.shadow,
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 8,
  },
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
