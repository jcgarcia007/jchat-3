import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { useAuth } from '../context/AuthContext';
import { useDmUnread } from './useDmUnread';
import { getUnreadSocialNotificationCount } from '../services/notifications';
import { isSupabaseConfigured, supabase, channelTopic } from '../services/supabase';

export function useUnreadBadge(): boolean {
  const { user } = useAuth();
  // DM unread comes from the shared source (one Realtime channel for the tab dot and the chat top bar).
  const { count: dmUnread } = useDmUnread();
  const [notificationUnread, setNotificationUnread] = useState(0);

  const refresh = useCallback(async () => {
    if (!user?.id) {
      setNotificationUnread(0);
      return;
    }

    setNotificationUnread(await getUnreadSocialNotificationCount(user.id).catch(() => 0));
  }, [user?.id]);

  useFocusEffect(useCallback(() => {
    void refresh();
  }, [refresh]));

  useEffect(() => {
    if (!isSupabaseConfigured || !user?.id) return;

    let cancelled = false;
    const refreshNotificationCount = async () => {
      const nextCount = await getUnreadSocialNotificationCount(user.id).catch(() => 0);
      if (!cancelled) setNotificationUnread(nextCount);
    };

    const notificationChannel = supabase
      .channel(channelTopic(`tab_badge_notifications_${user.id}`))
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        () => { void refreshNotificationCount(); },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        () => { void refreshNotificationCount(); },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'notifications' },
        () => { void refreshNotificationCount(); },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED' && !cancelled) void refreshNotificationCount();
      });
    const appStateSubscription = AppState.addEventListener('change', (status) => {
      if (status === 'active' && !cancelled) void refreshNotificationCount();
    });

    return () => {
      cancelled = true;
      appStateSubscription.remove();
      void supabase.removeChannel(notificationChannel);
    };
  }, [user?.id]);

  return dmUnread > 0 || notificationUnread > 0;
}
