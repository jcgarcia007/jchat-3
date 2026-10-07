/**
 * JChat 3.0 — useActiveOrders
 *
 * The signed-in user's orders in progress (rpc my_active_orders) kept fresh by Realtime on their own
 * orders, when the app returns to the foreground and every few minutes (the server hides old "ready"
 * orders on its own). Feeds the "Order #N · status" bar.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { supabase, isSupabaseConfigured, channelTopic } from '../services/supabase';
import { myActiveOrders, type ActiveOrder } from '../services/orders';

const REFRESH_MS = 5 * 60 * 1000;
const DEBOUNCE_MS = 400;

export interface ActiveOrdersState {
  orders: ActiveOrder[];
  /** True once the first server answer arrived (an empty list before that means "unknown", not "none"). */
  loaded: boolean;
}

export function useActiveOrders(userId: string | null): ActiveOrder[] {
  return useActiveOrdersState(userId).orders;
}

export function useActiveOrdersState(userId: string | null): ActiveOrdersState {
  const [orders, setOrders] = useState<ActiveOrder[]>([]);
  const [loaded, setLoaded] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(() => {
    if (!userId || !isSupabaseConfigured) return;
    void myActiveOrders()
      .then((rows) => {
        setOrders(rows);
        setLoaded(true);
      })
      .catch(() => undefined); // keep what we have; the next event/tick retries
  }, [userId]);

  useEffect(() => {
    if (!userId || !isSupabaseConfigured) {
      setOrders([]);
      setLoaded(false);
      return;
    }
    refresh();
    const schedule = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(refresh, DEBOUNCE_MS);
    };
    const channel = supabase
      .channel(channelTopic(`active-orders:${userId}`))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `user_id=eq.${userId}` }, schedule)
      .subscribe();
    const interval = setInterval(refresh, REFRESH_MS);
    const appState = AppState.addEventListener('change', (next) => {
      if (next === 'active') refresh();
    });
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      clearInterval(interval);
      appState.remove();
      void supabase.removeChannel(channel);
    };
  }, [userId, refresh]);

  return { orders, loaded };
}
