import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';

import { useAuth } from '../context/AuthContext';
import { getTotalUnread } from '../services/dms';
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
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        () => { void refresh(); },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(dmChannel);
      void supabase.removeChannel(notificationChannel);
    };
  }, [refresh, user?.id]);

  return dmUnread > 0 || notificationUnread > 0;
}
