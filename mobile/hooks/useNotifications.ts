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
import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import type { EventSubscription } from 'expo-modules-core';
import { supabase, isSupabaseConfigured } from '../services/supabase';
import { useAuth } from '../context/AuthContext';
import {
  registerForPushNotifications,
  deleteNotification,
  listNotifications,
  markNotificationRead,
  routeForNotification,
  isSocialNotificationType,
  type NotificationRow,
  type NotificationType,
  type NotificationRoute,
} from '../services/notifications';

// ── Configure foreground presentation behaviour ────────────────────────────────
// Must be called outside any component / hook body so it is set before the
// first notification arrives (Expo SDK requirement).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// ── Public interface ───────────────────────────────────────────────────────────

export interface UseNotificationsResult {
  /** Sorted array (newest first) of the current user's notifications. */
  notifications: NotificationRow[];
  /** Number of unread notifications. */
  unreadCount: number;
  /**
   * Mark a single notification as read and update local state optimistically.
   * No-op if Supabase is not configured.
   */
  markRead: (id: string) => Promise<void>;
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
    const rows = await listNotifications();
    setNotifications(rows);
  }, [isAuthenticated]);

  const markRead = useCallback(async (id: string) => {
    if (!isSupabaseConfigured) return;
    // Optimistic local update.
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)),
    );
    await markNotificationRead(id);
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

    const refetch = () => {
      if (cancelled || !isSupabaseConfigured) return;
      void listNotifications().then((rows) => {
        if (!cancelled) setNotifications(rows);
      });
    };

    // Passive consumers read database state without requesting notification
    // permission. Push registration remains intentionally outside Lote 3.
    if (!passive) void registerForPushNotifications(userId);

    // 2. Fetch initial notification list.
    refetch();

    const appStateSubscription = AppState.addEventListener('change', (status) => {
      if (status === 'active') refetch();
    });

    // 3. Foreground received listener — refresh the list so the new row appears.
    if (!passive) {
      receivedSubRef.current = Notifications.addNotificationReceivedListener(
        (_notification) => {
          refetch();
        },
      );

      // 4. Response (tap) listener — build a navigation descriptor.
      responseSubRef.current = Notifications.addNotificationResponseReceivedListener(
        (response) => {
          if (cancelled) return;

          const data = response.notification.request.content.data as
            | Record<string, unknown>
            | null
            | undefined;
          const rawType = data?.type;
          const payload = (data?.payload as Record<string, unknown> | null) ?? null;

          setPendingRoute(
            isValidNotificationType(rawType)
              ? routeForNotification(rawType, payload)
              : null,
          );
        },
      );
    }

    // 5. Supabase Realtime subscription for the notifications table.
    if (isSupabaseConfigured) {
      const channel = supabase
        .channel(`notifications:user:${userId}`)
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
    unreadCount,
    markRead,
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
] as const);

function isValidNotificationType(value: unknown): value is NotificationType {
  return (
    typeof value === 'string' &&
    VALID_NOTIFICATION_TYPES.has(value as NotificationType)
  );
}
