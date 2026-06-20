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
import { Platform } from 'react-native';
import {
  IconBell,
  IconBriefcase,
  IconHeart,
  IconMessageCircle,
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
  | 'work_alert';

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
  | { screen: 'DMs'; params: { conversationId?: string } }
  | { screen: 'Profile'; params: { userId: string } }
  | { screen: 'Feed'; params: { postId?: string } }
  | { screen: 'Notifications'; params: Record<string, never> };

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

  // Check existing permission before prompting.
  let { status } = await Notifications.getPermissionsAsync();

  if (status !== 'granted') {
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
    const tokenData = await Notifications.getExpoPushTokenAsync();
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
): NotificationRoute {
  switch (type) {
    case 'dm':
      return {
        screen: 'DMs',
        params: {
          conversationId:
            typeof payload?.conversation_id === 'string'
              ? payload.conversation_id
              : undefined,
        },
      };

    case 'follower':
      return {
        screen: 'Profile',
        params: {
          userId:
            typeof payload?.from_user_id === 'string'
              ? payload.from_user_id
              : '',
        },
      };

    case 'like':
    case 'comment':
      return {
        screen: 'Feed',
        params: {
          postId:
            typeof payload?.post_id === 'string'
              ? payload.post_id
              : undefined,
        },
      };

    case 'work_alert':
      // Work alerts currently navigate to the Notifications centre.
      return { screen: 'Notifications', params: {} };
  }
}
