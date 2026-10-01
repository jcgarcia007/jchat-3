import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { useAuth } from '../context/AuthContext';
import { getTotalUnread, subscribeToDmUnreadInvalidation } from '../services/dms';
import { getUnreadSocialNotificationCount } from '../services/notifications';
import { isSupabaseConfigured, supabase } from '../services/supabase';

export function useUnreadBadge(): boolean {
  const { user } = useAuth();
  const [dmUnread, setDmUnread] = useState(0);
  const [notificationUnread, setNotificationUnread] = useState(0);

  const refresh = useCallback(async () => {
    if (!user?.id) {
      setDmUnread(0);
      setNotificationUnread(0);
      return;
    }

    const [nextDmUnread, nextNotificationUnread] = await Promise.all([
      getTotalUnread(user.id).catch(() => 0),
      getUnreadSocialNotificationCount(user.id).catch(() => 0),
    ]);
    setDmUnread(nextDmUnread);
    setNotificationUnread(nextNotificationUnread);
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

    const dmChannel = supabase
      .channel(`tab_badge_dm_${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dm_messages' }, () => {
        void refresh();
      })
      .subscribe();
    const notificationChannel = supabase
      .channel(`tab_badge_notifications_${user.id}`)
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
    const unsubscribeDmInvalidation = subscribeToDmUnreadInvalidation(() => {
      if (!cancelled) void refresh();
    });
    const appStateSubscription = AppState.addEventListener('change', (status) => {
      if (status === 'active' && !cancelled) void refreshNotificationCount();
    });

    return () => {
      cancelled = true;
      appStateSubscription.remove();
      unsubscribeDmInvalidation();
      void supabase.removeChannel(dmChannel);
      void supabase.removeChannel(notificationChannel);
    };
  }, [refresh, user?.id]);

  return dmUnread > 0 || notificationUnread > 0;
}
