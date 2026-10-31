/**
 * JChat 3.0 — useNotifications hook (Task 1.16)
 *
 * Registers the device for push notifications on mount (when authenticated),
 * sets up expo-notifications foreground + response listeners, and maintains
 * a live list of the user's notifications via Supabase Realtime.
 *
 * All Supabase calls are guarded by `isSupabaseConfigured` so the hook works
 * in demo mode without a backend.
 *
 * Cleanup contract:
 *   - expo-notifications listeners removed via `EventSubscription.remove()`.
 *   - Supabase Realtime channel removed via `supabase.removeChannel()`.
 *   Both cleanups happen in the useEffect return function on unmount.
 *
 * TODO(i18n): strings are English; wire up translation keys when i18n is added.
 * TODO(Stage 4): geofence-triggered proximity notifications.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import type { EventSubscription } from 'expo-modules-core';
import { supabase, isSupabaseConfigured, channelTopic } from '../services/supabase';
import { useAuth } from '../context/AuthContext';
import { shouldRequestPushPermission } from '../services/pushPermission';
import {
  registerForPushNotifications,
  pushPermissionRequestedThisSession,
  reportPushError,
  deleteNotification,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  unmarkNotificationsRead,
  isMatchNotificationType,
  isOrderNotificationType,
  SOCIAL_NOTIFICATION_TYPES,
  resolveNotificationRoute,
  isSocialNotificationType,
  type NotificationRow,
  type NotificationType,
  type NotificationRoute,
} from '../services/notifications';

// ── Configure foreground presentation behaviour ────────────────────────────────
// Must be called outside any component / hook body so it is set before the
// first notification arrives (Expo SDK requirement).
// With the app OPEN the OS banner is shown only for the events a person must not miss: a gift offer or
// its response, an order status change and a Match. Tapping it goes through the response listener below
// (1:1 chat / order tracking / Match chat). Everything else keeps arriving silently (bell + badges).
const FOREGROUND_BANNER_TYPES: ReadonlySet<string> = new Set([
  'gift_offer',
  'gift_response',
  'order_status',
  'match_match',
]);

// Web has no foreground OS banners or push (the browser build lists notifications through Realtime only).
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const type = notification.request.content.data?.type;
      const show = typeof type === 'string' && FOREGROUND_BANNER_TYPES.has(type);
      return {
        shouldShowBanner: show,
        shouldShowList: show,
        shouldPlaySound: false,
        shouldSetBadge: false,
      };
    },
  });
}

// ── Public interface ───────────────────────────────────────────────────────────

export type NotificationFilter = 'all' | 'match' | 'orders';

/** Notification types behind each filter chip of the bell sheet. */
export function notificationTypesForFilter(filter: NotificationFilter): string[] {
  if (filter === 'match') return SOCIAL_NOTIFICATION_TYPES.filter((type) => isMatchNotificationType(type));
  if (filter === 'orders') return SOCIAL_NOTIFICATION_TYPES.filter((type) => isOrderNotificationType(type));
  return [...SOCIAL_NOTIFICATION_TYPES];
}

export interface UseNotificationsResult {
  /** Sorted array (newest first) of the current user's notifications. */
  notifications: NotificationRow[];
  /**
   * False until the FIRST fetch has finished (successfully or not; true at once when there is no backend to ask). It tells "first load, nothing to
   * show yet" apart from "loaded and really empty": a skeleton belongs to the former only. It never goes back to false (a refresh keeps the rows).
   */
  initialized: boolean;
  /** Number of unread notifications. */
  unreadCount: number;
  /**
   * Mark a single notification as read and update local state optimistically.
   * No-op if Supabase is not configured.
   */
  markRead: (id: string) => Promise<void>;
  /**
   * "Mark all as read" for the active filter of the bell sheet: updates the local rows at once and rolls
   * them back if the request fails. Returns the ids the server changed ([] on failure) for the Undo.
   */
  markAllRead: (filter: NotificationFilter) => Promise<string[]>;
  /** Undo of markAllRead: those ids go back to unread (rolled back to read if the request fails). */
  undoMarkAll: (ids: string[]) => Promise<void>;
  /** Delete one notification optimistically, restoring it if the request fails. */
  remove: (id: string) => Promise<void>;
  /** Re-fetch notifications from Supabase on demand. */
  refresh: () => Promise<void>;
  /**
   * The navigation descriptor produced when the user taps a notification.
   * `null` until a tap occurs. The consumer should react to this and navigate,
   * then call `clearPendingRoute()` to reset it.
   */
  pendingRoute: NotificationRoute | null;
  /** Clear `pendingRoute` after the consumer has handled navigation. */
  clearPendingRoute: () => void;
}

// ── Hook ───────────────────────────────────────────────────────────────────────

export interface UseNotificationsOptions {
  /** Skip permission/token registration and Expo event listeners. */
  passive?: boolean;
}

export function useNotifications({ passive = false }: UseNotificationsOptions = {}): UseNotificationsResult {
  const { user, isAuthenticated } = useAuth();

  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [pendingRoute, setPendingRoute] = useState<NotificationRoute | null>(null);

  // Refs for cleanup — avoids stale-closure issues with the effect.
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const receivedSubRef = useRef<EventSubscription | null>(null);
  const responseSubRef = useRef<EventSubscription | null>(null);

  // ── Derived values ──────────────────────────────────────────────────────────

  const unreadCount = notifications.filter(
    (notification) => !notification.is_read && isSocialNotificationType(notification.type),
  ).length;

  // ── Data helpers ────────────────────────────────────────────────────────────

  const refresh = useCallback(async () => {
    if (!isAuthenticated || !isSupabaseConfigured) return;
    try {
      const rows = await listNotifications();
      setNotifications(rows);
    } finally {
      setInitialized(true);
    }
  }, [isAuthenticated]);

  const markRead = useCallback(async (id: string) => {
    if (!isSupabaseConfigured) return;
    // Optimistic local update.
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)),
    );
    await markNotificationRead(id);
  }, []);

  const markAllRead = useCallback(async (filter: NotificationFilter): Promise<string[]> => {
    if (!isSupabaseConfigured || !user?.id) return [];
    const types = notificationTypesForFilter(filter);
    const touched = new Set(
      notifications.filter((n) => !n.is_read && types.includes(n.type)).map((n) => n.id),
    );
    // Optimistic: dots disappear and the bell counter drops immediately.
    setNotifications((prev) => prev.map((n) => (touched.has(n.id) ? { ...n, is_read: true } : n)));
    try {
      return await markAllNotificationsRead(user.id, types);
    } catch (error) {
      console.warn('[notifications] markAllRead error:', error instanceof Error ? error.message : error);
      setNotifications((prev) => prev.map((n) => (touched.has(n.id) ? { ...n, is_read: false } : n)));
      return [];
    }
  }, [notifications, user?.id]);

  const undoMarkAll = useCallback(async (ids: string[]): Promise<void> => {
    if (!isSupabaseConfigured || ids.length === 0) return;
    const restored = new Set(ids);
    setNotifications((prev) => prev.map((n) => (restored.has(n.id) ? { ...n, is_read: false } : n)));
    try {
      await unmarkNotificationsRead(ids);
    } catch (error) {
      console.warn('[notifications] undoMarkAll error:', error instanceof Error ? error.message : error);
      setNotifications((prev) => prev.map((n) => (restored.has(n.id) ? { ...n, is_read: true } : n)));
    }
  }, []);

  const remove = useCallback(async (id: string) => {
    const originalIndex = notifications.findIndex((notification) => notification.id === id);
    if (originalIndex < 0) return;
    const removedNotification = notifications[originalIndex];

    setNotifications((prev) => prev.filter((notification) => notification.id !== id));
    try {
      await deleteNotification(id);
    } catch (error) {
      setNotifications((prev) => {
        if (prev.some((notification) => notification.id === id)) return prev;
        const restored = [...prev];
        restored.splice(Math.min(originalIndex, restored.length), 0, removedNotification);
        return restored;
      });
      throw error;
    }
  }, [notifications]);

  const clearPendingRoute = useCallback(() => {
    setPendingRoute(null);
  }, []);

  // ── Main effect: register, listen, subscribe ────────────────────────────────

  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;

    const userId = user.id;
    let cancelled = false;
    let registrationInFlight = false;
    let shouldRetryPermission = false;

    const refetch = () => {
      if (cancelled) return;
      if (!isSupabaseConfigured) {
        setInitialized(true); // nothing to wait for
        return;
      }
      void listNotifications()
        .then((rows) => {
          if (!cancelled) setNotifications(rows);
        })
        .finally(() => {
          if (!cancelled) setInitialized(true);
        });
    };

    const attemptPushRegistration = async () => {
      if (cancelled || passive || registrationInFlight || Platform.OS === 'web') return;
      registrationInFlight = true;
      try {
        await registerForPushNotifications(userId);
        // Retry on the next foreground only if the system would still let us ask AND no dialog was shown yet in this session
        // (the dialog itself sends the app to the background and back: that return must not open a second one).
        const permission = await Notifications.getPermissionsAsync();
        shouldRetryPermission = !pushPermissionRequestedThisSession() && shouldRequestPushPermission({
          platform: Platform.OS,
          status: permission.status,
          canAskAgain: permission.canAskAgain,
          granted: permission.granted,
        });
      } catch (error) {
        // Native permission/channel APIs can fail on unsupported devices. Registration stays best-effort and never interrupts the session,
        // but the failure is now reported (short warning + Sentry) instead of swallowed.
        reportPushError('push registration failed', error);
      } finally {
        registrationInFlight = false;
      }
    };

    // The non-passive root consumer owns the single registration attempt for
    // this authenticated mount/session.
    if (!passive) void attemptPushRegistration();

    // 2. Fetch initial notification list.
    refetch();

    const appStateSubscription = AppState.addEventListener('change', (status) => {
      if (status !== 'active') return;
      refetch();
      if (shouldRetryPermission) void attemptPushRegistration();
    });

    // 3. Foreground received listener — refresh the list so the new row appears (native only: no push on web).
    if (!passive && Platform.OS !== 'web') {
      void Notifications.getLastNotificationResponseAsync()
        .then((response) => {
          if (cancelled || !response) return;
          void routeFromNotificationResponse(response).then((route) => {
            if (!cancelled) setPendingRoute(route);
          });
        })
        .catch(() => {});

      receivedSubRef.current = Notifications.addNotificationReceivedListener(
        (_notification) => {
          refetch();
        },
      );

      // 4. Response (tap) listener — build a navigation descriptor.
      responseSubRef.current = Notifications.addNotificationResponseReceivedListener(
        (response) => {
          if (cancelled) return;
          void routeFromNotificationResponse(response).then((route) => {
            if (!cancelled) setPendingRoute(route);
          });
        },
      );
    }

    // 5. Supabase Realtime subscription for the notifications table.
    if (isSupabaseConfigured) {
      const channel = supabase
        .channel(channelTopic(`notifications:${passive ? 'passive' : 'active'}:user:${userId}`))
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            if (cancelled) return;
            // Prepend the new row to keep the list sorted newest-first.
            const newRow = payload.new as NotificationRow;
            setNotifications((prev) => (
              prev.some((notification) => notification.id === newRow.id)
                ? prev
                : [newRow, ...prev]
            ));
          },
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            if (cancelled) return;
            const updated = payload.new as NotificationRow;
            setNotifications((prev) =>
              prev.map((n) => (n.id === updated.id ? updated : n)),
            );
          },
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') refetch();
        });

      channelRef.current = channel;
    }

    // ── Cleanup ──────────────────────────────────────────────────────────────
    return () => {
      cancelled = true;
      appStateSubscription.remove();

      // Remove expo-notifications listeners.
      receivedSubRef.current?.remove();
      responseSubRef.current?.remove();
      receivedSubRef.current = null;
      responseSubRef.current = null;

      // Unsubscribe from Supabase Realtime channel.
      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [isAuthenticated, passive, user?.id]);

  // ── Return ──────────────────────────────────────────────────────────────────

  return {
    notifications,
    initialized,
    unreadCount,
    markRead,
    markAllRead,
    undoMarkAll,
    remove,
    refresh,
    pendingRoute,
    clearPendingRoute,
  };
}

// ── Internal helpers ──────────────────────────────────────────────────────────

const VALID_NOTIFICATION_TYPES: ReadonlySet<NotificationType> = new Set([
  'dm',
  'follower',
  'like',
  'comment',
  'work_alert',
  'match_like',
  'match_super',
  'match_match',
  'match_new_people',
  'order_status',
  'gift_offer',
  'gift_response',
] as const);

function isValidNotificationType(value: unknown): value is NotificationType {
  return (
    typeof value === 'string' &&
    VALID_NOTIFICATION_TYPES.has(value as NotificationType)
  );
}

async function routeFromNotificationResponse(
  response: Notifications.NotificationResponse,
): Promise<NotificationRoute | null> {
  const data = response.notification.request.content.data;
  const rawType = data?.type;
  const rawPayload = data?.payload;
  const payload = rawPayload && typeof rawPayload === 'object' && !Array.isArray(rawPayload)
    ? rawPayload as Record<string, unknown>
    : null;
  return isValidNotificationType(rawType)
    ? resolveNotificationRoute(rawType, payload)
    : null;
}
