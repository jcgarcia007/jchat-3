/**
 * JChat 3.0 — useNotificationPresenter
 *
 * One place that turns notification rows into what the user sees (icon, text) and where a tap goes.
 * Used by the Messages tab and by the chat's bell sheet, so both read the same.
 */

import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  IconBell,
  IconGift,
  IconHeart,
  IconMessage,
  IconMessage2,
  IconReceipt,
  IconStar,
  IconUserPlus,
  type Icon,
} from '@tabler/icons-react-native';

import { useMatchNotificationLabels } from './useMatchNotificationLabels';
import {
  isMatchNotificationType,
  isSocialNotificationType,
  type NotificationRoute,
  type NotificationRow,
  type NotificationType,
} from '../services/notifications';

export const NOTIFICATION_ICONS: Record<NotificationType, Icon> = {
  follower: IconUserPlus,
  dm: IconMessage,
  like: IconHeart,
  comment: IconMessage2,
  work_alert: IconBell,
  match_like: IconHeart,
  match_super: IconStar,
  match_match: IconHeart,
  match_new_people: IconHeart,
  order_status: IconReceipt,
  gift_offer: IconGift,
  gift_response: IconGift,
};

function actorName(payload: Record<string, unknown> | null, fallback: string): string {
  for (const key of ['actor_name', 'from_name', 'username', 'display_name'] as const) {
    const value = payload?.[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return fallback;
}

/** Minimal navigation surface: the screens a notification can open. */
export interface NotificationNavigation {
  navigate: (...args: never[]) => void;
}

/** Opens the screen a notification points to. `nav` is a Main-stack navigation object. */
export function openNotificationRoute(
  nav: { navigate: (screen: string, params?: unknown) => void },
  route: NotificationRoute,
): void {
  if (route.screen === 'MyOrders') nav.navigate('MyOrders');
  else nav.navigate(route.screen, route.params);
}

export function useNotificationPresenter(notifications: NotificationRow[]) {
  const translation = useTranslation('social');
  const { t } = translation;
  const matchLabels = useMatchNotificationLabels(notifications);

  /** Rows that are shown (social + order/gift types; Match rows of venues with Match off are hidden). */
  const visible = useMemo(
    () =>
      notifications.filter((notification) => {
        if (!isSocialNotificationType(notification.type)) return false;
        if (isMatchNotificationType(notification.type)) {
          const businessId = notification.payload?.business_id;
          if (typeof businessId === 'string' && matchLabels.enabledBusinesses && !matchLabels.enabledBusinesses.has(businessId)) {
            return false;
          }
        }
        return true;
      }),
    [notifications, matchLabels.enabledBusinesses],
  );

  const textFor = useCallback(
    (notification: NotificationRow): string => {
      if (!isSocialNotificationType(notification.type)) return '';
      const payload = notification.payload;
      const nameOf = (id: unknown): string =>
        (typeof id === 'string' && matchLabels.userNames[id]) || t('messages.someone');
      const businessId = payload?.business_id;
      const businessName =
        (typeof payload?.business_name === 'string' && payload.business_name) ||
        (typeof businessId === 'string' && matchLabels.businessNames[businessId]) ||
        '';

      if (isMatchNotificationType(notification.type)) {
        const userId = payload?.from_user_id ?? payload?.other_user_id;
        const key = {
          match_like: 'matchLike',
          match_super: 'matchSuper',
          match_match: 'matchMatch',
          match_new_people: 'matchNewPeople',
        }[notification.type as 'match_like' | 'match_super' | 'match_match' | 'match_new_people'];
        return t(`messages.notif.${key}`, { name: nameOf(userId), business: businessName });
      }

      if (notification.type === 'order_status') {
        const status = typeof payload?.status === 'string' ? payload.status : '';
        const n = payload?.order_number ?? '';
        const toTable = payload?.order_type === 'table';
        if (status === 'preparing') return t('messages.notif.orderPreparing', { n });
        if (status === 'ready') return t(toTable ? 'messages.notif.orderReadyTable' : 'messages.notif.orderReady', { n });
        if (status === 'delivered') return t('messages.notif.orderDelivered', { n });
        if (status === 'cancelled') return t('messages.notif.orderCancelled', { n });
        return t('messages.notif.orderGeneric', { n });
      }

      if (notification.type === 'gift_offer') {
        return t('messages.notif.giftOffer', { name: nameOf(payload?.from_user_id), business: businessName });
      }

      if (notification.type === 'gift_response') {
        const result = payload?.result;
        if (result === 'accepted') return t('messages.notif.giftAccepted', { name: nameOf(payload?.to_user_id) });
        if (result === 'declined') return t('messages.notif.giftDeclined', { name: nameOf(payload?.to_user_id) });
        if (result === 'expired') return t('messages.notif.giftExpired', { name: nameOf(payload?.to_user_id) });
        if (result === 'paid') return t('messages.notif.giftPaid');
        return t('messages.notif.giftGeneric');
      }

      return t(`messages.notif.${notification.type === 'work_alert' ? 'workAlert' : notification.type}`, {
        name: actorName(payload, t('messages.someone')),
      });
    },
    [t, matchLabels],
  );

  return { visible, textFor, translation, matchLabels };
}
