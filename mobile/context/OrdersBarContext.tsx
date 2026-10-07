/**
 * JChat 3.0 — OrdersBarContext
 *
 * Owns the orders in progress (one subscription for the whole app) and which of them the user swiped away from
 * the home bar. A swiped order moves to Notifications as a pinned "In progress" row that follows its status live.
 *
 * "Swiped away" is remembered per order on this device (AsyncStorage, never the database):
 *   { [orderId]: { dismissed, status (last seen), reappeared } }
 * Rules:
 *   • swipe → dismissed = true, status = the status at that moment.
 *   • a dismissed order that PASSES to 'ready' (it was not ready when swiped) brings the bar back ONCE (dismissed = false, reappeared = true);
 *     swiping it again keeps it dismissed for good (reappeared stays true). 'preparing' never brings it back.
 *   • entries of orders that are no longer in progress (delivered / cancelled / gone) are pruned.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useAuth } from './AuthContext';
import { useActiveOrdersState } from '../hooks/useActiveOrders';
import type { ActiveOrder } from '../services/orders';

export interface DismissedEntry {
  dismissed: boolean;
  status: string;
  reappeared: boolean;
}
type DismissedMap = Record<string, DismissedEntry>;

const storageKey = (userId: string) => `jchat.dismissedOrders.v1:${userId}`;

interface OrdersBarValue {
  /** Every order in progress. */
  orders: ActiveOrder[];
  /** The ones the home bar shows (not swiped away, or brought back once at 'ready'). */
  barOrders: ActiveOrder[];
  /** The ones swiped away that are still in progress: pinned rows of Notifications. */
  pinnedOrders: ActiveOrder[];
  /** Swipe away these orders; returns a snapshot for restore(). */
  dismiss: (orderIds: string[]) => DismissedMap;
  /** Undo a dismiss(): puts the given snapshot back for those orders. */
  restore: (snapshot: DismissedMap, orderIds: string[]) => void;
}

const OrdersBarContext = createContext<OrdersBarValue>({
  orders: [],
  barOrders: [],
  pinnedOrders: [],
  dismiss: () => ({}),
  restore: () => undefined,
});

export function OrdersBarProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const { orders, loaded } = useActiveOrdersState(userId);
  const [dismissedMap, setDismissedMap] = useState<DismissedMap>({});
  const [storageLoaded, setStorageLoaded] = useState(false);
  const mapRef = useRef<DismissedMap>({});

  const commit = useCallback(
    (next: DismissedMap) => {
      mapRef.current = next;
      setDismissedMap(next);
      if (userId) void AsyncStorage.setItem(storageKey(userId), JSON.stringify(next)).catch(() => undefined);
    },
    [userId],
  );

  // Load this user's remembered state.
  useEffect(() => {
    let alive = true;
    mapRef.current = {};
    setDismissedMap({});
    setStorageLoaded(false);
    if (!userId) return undefined;
    void AsyncStorage.getItem(storageKey(userId))
      .then((raw) => {
        if (!alive) return;
        const parsed = raw ? (JSON.parse(raw) as unknown) : {};
        const map = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as DismissedMap) : {};
        mapRef.current = map;
        setDismissedMap(map);
      })
      .catch(() => undefined)
      .finally(() => {
        if (alive) setStorageLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, [userId]);

  // Bring a dismissed order back ONCE when it reaches 'ready'; forget orders that are no longer in progress.
  useEffect(() => {
    if (!storageLoaded || !loaded) return;
    const current = mapRef.current;
    const next: DismissedMap = {};
    let changed = false;
    const inProgress = new Map(orders.map((o) => [o.id, o]));
    for (const [id, entry] of Object.entries(current)) {
      const order = inProgress.get(id);
      if (!order) {
        changed = true; // delivered / cancelled / expired: drop it
        continue;
      }
      if (entry.dismissed && entry.status !== 'ready' && order.status === 'ready' && !entry.reappeared) {
        next[id] = { dismissed: false, status: order.status, reappeared: true };
        changed = true;
      } else {
        next[id] = entry.dismissed && entry.status !== order.status ? { ...entry, status: order.status } : entry;
        if (next[id] !== entry) changed = true;
      }
    }
    if (changed) commit(next);
  }, [orders, loaded, storageLoaded, commit]);

  const dismiss = useCallback(
    (orderIds: string[]) => {
      const snapshot: DismissedMap = {};
      const next = { ...mapRef.current };
      for (const id of orderIds) {
        const order = orders.find((o) => o.id === id);
        if (!order) continue;
        if (mapRef.current[id]) snapshot[id] = mapRef.current[id];
        next[id] = { dismissed: true, status: order.status, reappeared: mapRef.current[id]?.reappeared ?? false };
      }
      commit(next);
      return snapshot;
    },
    [orders, commit],
  );

  const restore = useCallback(
    (snapshot: DismissedMap, orderIds: string[]) => {
      const next = { ...mapRef.current };
      for (const id of orderIds) {
        if (snapshot[id]) next[id] = snapshot[id];
        else delete next[id];
      }
      commit(next);
    },
    [commit],
  );

  const value = useMemo<OrdersBarValue>(() => {
    const isDismissed = (id: string) => dismissedMap[id]?.dismissed === true;
    return {
      orders,
      barOrders: storageLoaded ? orders.filter((o) => !isDismissed(o.id)) : [],
      pinnedOrders: storageLoaded ? orders.filter((o) => isDismissed(o.id)) : [],
      dismiss,
      restore,
    };
  }, [orders, dismissedMap, storageLoaded, dismiss, restore]);

  return <OrdersBarContext.Provider value={value}>{children}</OrdersBarContext.Provider>;
}

export function useOrdersBar(): OrdersBarValue {
  return useContext(OrdersBarContext);
}
