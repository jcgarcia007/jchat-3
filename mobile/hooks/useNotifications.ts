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
import * as Notifications from 'expo-notifications';
import type { EventSubscription } from 'expo-modules-core';
import { supabase, isSupabaseConfigured } from '../services/supabase';
import { useAuth } from '../context/AuthContext';
import {
  registerForPushNotifications,
  listNotifications,
  markNotificationRead,
  routeForNotification,
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

export function useNotifications(): UseNotificationsResult {
  const { user, isAuthenticated } = useAuth();

  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [pendingRoute, setPendingRoute] = useState<NotificationRoute | null>(null);

  // Refs for cleanup — avoids stale-closure issues with the effect.
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const receivedSubRef = useRef<EventSubscription | null>(null);
  const responseSubRef = useRef<EventSubscription | null>(null);

  // ── Derived values ──────────────────────────────────────────────────────────

  const unreadCount = notifications.filter((n) => !n.is_read).length;

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

  const clearPendingRoute = useCallback(() => {
    setPendingRoute(null);
  }, []);

  // ── Main effect: register, listen, subscribe ────────────────────────────────

  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;

    const userId = user.id;
    let cancelled = false;

    // 1. Register for push notifications and store the token.
    void registerForPushNotifications(userId);

    // 2. Fetch initial notification list.
    if (isSupabaseConfigured) {
      void listNotifications().then((rows) => {
        if (!cancelled) setNotifications(rows);
      });
    }

    // 3. Foreground received listener — refresh the list so the new row appears.
    receivedSubRef.current = Notifications.addNotificationReceivedListener(
      (_notification) => {
        // Refresh the DB-backed list so the new notification row appears.
        // The Realtime subscription below also catches this, but this listener
        // ensures we pick it up even if Realtime hasn't connected yet.
        if (!cancelled && isSupabaseConfigured) {
          void listNotifications().then((rows) => {
            if (!cancelled) setNotifications(rows);
          });
        }
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

        // The server payload is expected to include a `type` field.
        const rawType = data?.type;
        const payload = (data?.payload as Record<string, unknown> | null) ?? null;

        if (isValidNotificationType(rawType)) {
          const route = routeForNotification(rawType, payload);
          setPendingRoute(route);
        } else {
          // Fallback — navigate to Notifications screen.
          setPendingRoute({ screen: 'Notifications', params: {} });
        }
      },
    );

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
            setNotifications((prev) => [newRow, ...prev]);
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
        .subscribe();

      channelRef.current = channel;
    }

    // ── Cleanup ──────────────────────────────────────────────────────────────
    return () => {
      cancelled = true;

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
  }, [isAuthenticated, user?.id]);

  // ── Return ──────────────────────────────────────────────────────────────────

  return {
    notifications,
    unreadCount,
    markRead,
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
