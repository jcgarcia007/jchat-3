/**
 * JChat 3.0 — useDmUnread: the signed-in user's unread direct messages.
 *
 * One shared source for every consumer (the Messages tab dot and the chat top bar dot): the first
 * mounted hook opens a single Realtime channel on dm_messages + the local invalidation listener +
 * the foreground listener, the last unmounted one removes them. Supabase returns the same channel for
 * the same topic and rejects `.on()` after subscribe, so two independent hooks must not each open one.
 *
 * Refreshes: initial load, any dm_messages change, local invalidation (markRead / send / hide),
 * app back to foreground, and every time the screen using the hook regains focus.
 */

import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { useAuth } from '../context/AuthContext';
import { getTotalUnread, subscribeToDmUnreadInvalidation } from '../services/dms';
import { channelTopic, isSupabaseConfigured, supabase } from '../services/supabase';

interface SharedDmUnread {
  userId: string;
  count: number;
  refs: number;
  listeners: Set<(count: number) => void>;
  refresh: () => Promise<void>;
  teardown: () => void;
}

let shared: SharedDmUnread | null = null;

function createShared(userId: string): SharedDmUnread {
  let cancelled = false;
  const state: SharedDmUnread = {
    userId,
    count: 0,
    refs: 0,
    listeners: new Set(),
    refresh: async () => {
      const next = await getTotalUnread(userId).catch(() => state.count);
      if (cancelled || next === state.count) return;
      state.count = next;
      state.listeners.forEach((listener) => listener(next));
    },
    teardown: () => undefined,
  };

  const unsubscribeInvalidation = subscribeToDmUnreadInvalidation(() => {
    void state.refresh();
  });
  const appState = AppState.addEventListener('change', (status) => {
    if (status === 'active') void state.refresh();
  });
  const channel = isSupabaseConfigured
    ? supabase
        .channel(channelTopic(`dm_unread_${userId}`))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'dm_messages' }, () => {
          void state.refresh();
        })
        .subscribe()
    : null;

  state.teardown = () => {
    cancelled = true;
    appState.remove();
    unsubscribeInvalidation();
    if (channel) void supabase.removeChannel(channel);
  };
  void state.refresh();
  return state;
}

function acquire(userId: string): SharedDmUnread {
  if (!shared || shared.userId !== userId) shared = createShared(userId);
  shared.refs += 1;
  return shared;
}

function release(state: SharedDmUnread): void {
  state.refs -= 1;
  if (state.refs > 0) return;
  state.teardown();
  if (shared === state) shared = null;
}

export function useDmUnread(): { hasUnread: boolean; count: number } {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!userId) {
      setCount(0);
      return undefined;
    }
    const state = acquire(userId);
    setCount(state.count);
    state.listeners.add(setCount);
    return () => {
      state.listeners.delete(setCount);
      release(state);
    };
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      if (shared && shared.userId === userId) void shared.refresh();
    }, [userId]),
  );

  return { hasUnread: count > 0, count };
}
