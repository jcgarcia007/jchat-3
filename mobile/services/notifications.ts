/**
 * JChat 3.0 — Notifications service (Task 1.16)
 *
 * Covers:
 *   - Push token registration via expo-notifications (Expo SDK 56).
 *     NOTE(deviation): The Dev Plan references "FCM" directly; in an Expo
 *     managed workflow push notifications are delivered through the Expo
 *     push service (expo-notifications → getExpoPushTokenAsync). Under the
 *     hood Expo relays to FCM on Android and APNs on iOS, so no raw Firebase
 *     SDK is needed or installed. The token stored in `users.push_token` is
 *     the Expo push token string (prefix: "ExponentPushToken[...]").
 *
 *   - NotificationType union — five spec types.
 *   - getNotificationStyle() — icon component + accent colour, no hex literals.
 *   - CRUD helpers against the `notifications` table.
 *   - routeForNotification() — typed navigation descriptor (no direct navigation).
 *
 * Column note: the schema (001_initial_schema.sql, line 35) uses `push_token`,
 * not `fcm_token`. We write to `push_token` accordingly.
 *
 * TODO(Stage 4): geofence-triggered proximity notifications.
 * TODO(i18n): all user-facing strings are English for now.
 */

import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import {
  IconBell,
  IconBriefcase,
  IconGift,
  IconHeart,
  IconMessageCircle,
  IconReceipt,
  IconStar,
  IconUserPlus,
  type Icon as TablerIcon,
} from '@tabler/icons-react-native';
import { supabase, isSupabaseConfigured } from './supabase';
import { palette } from '../theme/tokens';

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * The five notification types defined in the spec.
 * `work_alert` is displayed with a distinct amber accent.
 * All social types share the brand blue accent.
 */
export type NotificationType =
  | 'dm'
  | 'follower'
  | 'like'
  | 'comment'
  | 'work_alert'
  | 'match_like'
  | 'match_super'
  | 'match_match'
  | 'match_new_people'
  | 'order_status'
  | 'gift_offer'
  | 'gift_response';

export const MATCH_NOTIFICATION_TYPES: readonly NotificationType[] = [
  'match_like',
  'match_super',
  'match_match',
  'match_new_people',
];

export function isMatchNotificationType(value: unknown): value is NotificationType {
  return typeof value === 'string' && MATCH_NOTIFICATION_TYPES.includes(value as NotificationType);
}

/** Order in progress + gifts (migrations 201/202): shown under "Pedidos" in the chat's bell sheet. */
export const ORDER_NOTIFICATION_TYPES: readonly NotificationType[] = ['order_status', 'gift_offer', 'gift_response'];

export function isOrderNotificationType(value: unknown): value is NotificationType {
  return typeof value === 'string' && ORDER_NOTIFICATION_TYPES.includes(value as NotificationType);
}

export const SOCIAL_NOTIFICATION_TYPES: readonly NotificationType[] = [
  'dm',
  'follower',
  'like',
  'comment',
  'work_alert',
  ...MATCH_NOTIFICATION_TYPES,
  ...ORDER_NOTIFICATION_TYPES,
];

export function isSocialNotificationType(value: unknown): value is NotificationType {
  return typeof value === 'string'
    && SOCIAL_NOTIFICATION_TYPES.includes(value as NotificationType);
}

/**
 * Row shape returned by `listNotifications()`.
 * Matches the `notifications` table schema.
 */
export interface NotificationRow {
  id: string;
  user_id: string;
  type: NotificationType;
  payload: Record<string, unknown> | null;
  is_read: boolean;
  created_at: string;
}

/**
 * Visual style bundle for a notification type.
 * `icon` is the Tabler icon component (pass `size`/`color`/`strokeWidth` when
 * rendering). The type is `TablerIcon` — the exact ForwardRef shape from
 * `@tabler/icons-react-native` — so callers can use it without casting.
 * `accent` is a palette token value — never a literal hex.
 */
export interface NotificationStyle {
  /** Tabler icon React component (not pre-sized). */
  icon: TablerIcon;
  /** Accent colour from palette tokens. */
  accent: string;
}

/**
 * Typed navigation descriptor returned by `routeForNotification()`.
 * The caller is responsible for converting this to an actual navigation call.
 */
export type NotificationRoute =
  | {
      screen: 'DMs';
      params:
        | { screen: 'DMChat'; params: { conversationId: string; otherUserId?: string } }
        | { screen: 'DMInbox' };
    }
  | { screen: 'UserProfile'; params: { userId: string } }
  | { screen: 'PostDetail'; params: { postId: string } }
  | { screen: 'MatchActivity'; params: { businessId: string; tab: 'likes' | 'likedMe' | 'matches' } }
  | { screen: 'MatchHome'; params: { businessId: string } }
  | { screen: 'OrderTracking'; params: { orderId: string; roomId?: string } }
  | { screen: 'MyOrders' };

// ── Push permission & token registration ──────────────────────────────────────

/**
 * Requests push notification permission, obtains an Expo push token, and
 * upserts it into `users.push_token` for the currently authenticated user.
 *
 * Call once after successful login (see `useNotifications` hook).
 *
 * @param userId - The authenticated user's UUID from Supabase Auth.
 * @returns The Expo push token string, or `null` if permission was denied
 *          or any step failed.
 */
export async function registerForPushNotifications(
  userId: string,
): Promise<string | null> {
  // Android requires an explicit notification channel to be set before
  // requesting a token (Expo SDK 56 / RN 0.85).
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: palette.brand,
    });
  }

  // Prompt only while the user has never answered. A denied permission must not
  // produce a new prompt on every login or foreground transition.
  const existingPermission = await Notifications.getPermissionsAsync();
  let status = existingPermission.status;

  if (status === Notifications.PermissionStatus.UNDETERMINED && existingPermission.canAskAgain) {
    const result = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: true, allowSound: true },
    });
    status = result.status;
  }

  if (status !== 'granted') {
    // User denied permission — do not store anything.
    return null;
  }

  let expoPushToken: string;
  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId
      ?? Constants.easConfig?.projectId;
    if (typeof projectId !== 'string' || !projectId) return null;
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    expoPushToken = tokenData.data;
  } catch {
    // Token fetch can fail in Expo Go without EAS project configuration,
    // in simulators, or when offline. Fail silently.
    return null;
  }

  // Persist token to Supabase if a real backend is configured.
  if (isSupabaseConfigured) {
    const { error } = await supabase
      .from('users')
      .update({ push_token: expoPushToken })
      .eq('id', userId);

    if (error) {
      // Non-fatal — the app keeps working; token will be refreshed next login.
      console.warn('[notifications] Failed to persist push_token:', error.message);
    }
  }

  return expoPushToken;
}

// ── Visual style ──────────────────────────────────────────────────────────────

/**
 * Returns the Tabler icon component and accent colour for a given notification
 * type. Colours come exclusively from `palette` tokens — no hardcoded hex.
 *
 * Design system rules:
 *   - work_alert → IconBriefcase + palette.warning  (#f59e0b amber)
 *   - all social  → respective icon + palette.brand  (#5C7CFA)
 */
export function getNotificationStyle(type: NotificationType): NotificationStyle {
  switch (type) {
    case 'work_alert':
      return { icon: IconBriefcase, accent: palette.warning };

    case 'dm':
      return { icon: IconMessageCircle, accent: palette.brand };

    case 'follower':
      return { icon: IconUserPlus, accent: palette.brand };

    case 'like':
      return { icon: IconHeart, accent: palette.brand };

    case 'comment':
      return { icon: IconBell, accent: palette.brand };

    case 'match_like':
    case 'match_match':
    case 'match_new_people':
      return { icon: IconHeart, accent: palette.brand };

    case 'match_super':
      return { icon: IconStar, accent: palette.brand };

    case 'order_status':
      return { icon: IconReceipt, accent: palette.brand };

    case 'gift_offer':
    case 'gift_response':
      return { icon: IconGift, accent: palette.brand };
  }
}

// ── Supabase CRUD ─────────────────────────────────────────────────────────────

/**
 * Fetches the most recent 50 notifications for the authenticated user,
 * newest first. RLS ensures users only see their own rows.
 *
 * Returns an empty array when Supabase is not configured (demo mode).
 */
export async function listNotifications(): Promise<NotificationRow[]> {
  if (!isSupabaseConfigured) return [];

  const { data, error } = await supabase
    .from('notifications')
    .select('id, user_id, type, payload, is_read, created_at')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.warn('[notifications] listNotifications error:', error.message);
    return [];
  }

  return (data ?? []) as NotificationRow[];
}

/**
 * Marks a single notification as read.
 *
 * @param id - The notification UUID.
 * @returns `true` on success, `false` if Supabase is not configured or the
 *          update failed.
 */
export async function markNotificationRead(id: string): Promise<boolean> {
  if (!isSupabaseConfigured) return false;

  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', id);

  if (error) {
    console.warn('[notifications] markNotificationRead error:', error.message);
    return false;
  }

  return true;
}

/** Permanently delete one notification. RLS restricts deletion to its owner. */
export async function deleteNotification(id: string): Promise<void> {
  if (!isSupabaseConfigured) return;

  const { error } = await supabase
    .from('notifications')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

/** Count unread social notifications without loading their payloads. */
export async function getUnreadSocialNotificationCount(userId: string): Promise<number> {
  if (!isSupabaseConfigured) return 0;

  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false)
    .in('type', [...SOCIAL_NOTIFICATION_TYPES]);

  if (error) {
    console.warn('[notifications] unread count error:', error.message);
    return 0;
  }
  return count ?? 0;
}

// ── Navigation routing ────────────────────────────────────────────────────────

/**
 * Converts a notification type + payload into a typed screen descriptor.
 * The caller (e.g. `useNotifications` response handler) is responsible for
 * the actual navigation call — this function is side-effect-free.
 *
 * @param type    - The notification type.
 * @param payload - The raw `payload` JSONB column value (may be null).
 * @returns A `NotificationRoute` object describing which screen to open.
 */
export function routeForNotification(
  type: NotificationType,
  payload: Record<string, unknown> | null,
): NotificationRoute | null {
  switch (type) {
    case 'dm':
      if (typeof payload?.conversation_id !== 'string') {
        return { screen: 'DMs', params: { screen: 'DMInbox' } };
      }
      return {
        screen: 'DMs',
        params: {
          screen: 'DMChat',
          params: { conversationId: payload.conversation_id },
        },
      };

    case 'follower':
      if (typeof payload?.from_user_id !== 'string' || !payload.from_user_id) return null;
      return {
        screen: 'UserProfile',
        params: { userId: payload.from_user_id },
      };

    case 'like':
    case 'comment':
      if (typeof payload?.post_id !== 'string' || !payload.post_id) return null;
      return {
        screen: 'PostDetail',
        params: { postId: payload.post_id },
      };

    case 'work_alert':
      return null;

    case 'match_like':
    case 'match_super': {
      const businessId = typeof payload?.business_id === 'string' ? payload.business_id : null;
      return businessId ? { screen: 'MatchActivity', params: { businessId, tab: 'likedMe' } } : null;
    }

    case 'match_match': {
      if (typeof payload?.conversation_id === 'string' && payload.conversation_id) {
        const otherUserId = typeof payload.other_user_id === 'string' ? payload.other_user_id : undefined;
        return {
          screen: 'DMs',
          params: { screen: 'DMChat', params: { conversationId: payload.conversation_id, otherUserId } },
        };
      }
      const businessId = typeof payload?.business_id === 'string' ? payload.business_id : null;
      return businessId ? { screen: 'MatchActivity', params: { businessId, tab: 'matches' } } : null;
    }

    case 'match_new_people': {
      const businessId = typeof payload?.business_id === 'string' ? payload.business_id : null;
      return businessId ? { screen: 'MatchHome', params: { businessId } } : null;
    }

    case 'order_status': {
      const orderId = typeof payload?.order_id === 'string' && payload.order_id ? payload.order_id : null;
      return orderId ? { screen: 'OrderTracking', params: { orderId } } : { screen: 'MyOrders' };
    }

    case 'gift_offer':
    case 'gift_response': {
      // The gift card lives in the 1:1 chat (migration 202 puts conversation_id in the payload).
      if (typeof payload?.conversation_id === 'string' && payload.conversation_id) {
        return { screen: 'DMs', params: { screen: 'DMChat', params: { conversationId: payload.conversation_id } } };
      }
      return { screen: 'DMs', params: { screen: 'DMInbox' } };
    }
  }
}

/**
 * Like routeForNotification, but for a PUSH tap: a discreet Match push only carries
 * { type, notification_id, business_id }, so the detail (who, which conversation) is read from
 * the notification row itself. Falls back to the push payload if the row can't be read.
 */
export async function resolveNotificationRoute(
  type: NotificationType,
  payload: Record<string, unknown> | null,
): Promise<NotificationRoute | null> {
  const notificationId = payload?.notification_id;
  if (isMatchNotificationType(type) && typeof notificationId === 'string' && isSupabaseConfigured) {
    const { data } = await supabase
      .from('notifications')
      .select('payload')
      .eq('id', notificationId)
      .maybeSingle();
    const stored = data?.payload;
    if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
      return routeForNotification(type, { ...payload, ...(stored as Record<string, unknown>) });
    }
  }
  return routeForNotification(type, payload);
}
