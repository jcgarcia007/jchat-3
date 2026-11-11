/**
 * JChat 3.0 — useNextReservation (M3)
 *
 * The reservation for the "Your next reservation" card: the nearest pending / confirmed one that has not expired
 * (utils/nextReservation: it leaves 2 h after its time). Kept fresh by Realtime on the user's own reservations (so the venue's
 * confirmation shows at once), when the app returns to the foreground, and by a timer set to the moment the shown one expires
 * (the card disappears on its own). Subscribes on mount, unsubscribes on unmount.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { supabase, isSupabaseConfigured, channelTopic } from '../services/supabase';
import { cancelMyReservation, listActiveReservations, type MyReservationRow } from '../services/reservations';
import { msUntilCardChanges, pickNext } from '../utils/nextReservation';

const DEBOUNCE_MS = 400;

export interface NextReservationState {
  next: MyReservationRow | null;
  /** Other reservations also coming ("and 1 more"). */
  more: number;
  /** The clock the card was computed with (its text for "today" / "tomorrow" follows it). */
  nowMs: number;
  cancel: (id: string) => Promise<void>;
  refresh: () => void;
}

/** `onRemoteChange` runs after a refresh caused by a change on the server (not the first load): a list on the same screen can reload too. */
export function useNextReservation(userId: string | null, onRemoteChange?: () => void): NextReservationState {
  const [rows, setRows] = useState<MyReservationRow[]>([]);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const remoteRef = useRef(onRemoteChange);
  remoteRef.current = onRemoteChange;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback((remote: boolean) => {
    if (!userId || !isSupabaseConfigured) return;
    void listActiveReservations()
      .then((list) => {
        setRows(list);
        setNowMs(Date.now());
        if (remote) remoteRef.current?.();
      })
      .catch(() => undefined); // keep what we have; the next event retries
  }, [userId]);

  useEffect(() => {
    if (!userId || !isSupabaseConfigured) {
      setRows([]);
      return;
    }
    load(false);
    const schedule = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => load(true), DEBOUNCE_MS);
    };
    const channel = supabase
      .channel(channelTopic(`next-reservation:${userId}`))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations', filter: `user_id=eq.${userId}` }, schedule)
      .subscribe();
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') load(false);
    });
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      appState.remove();
      void supabase.removeChannel(channel);
    };
  }, [userId, load]);

  // the card leaves by itself when the shown reservation expires
  useEffect(() => {
    const wait = msUntilCardChanges(rows, nowMs);
    if (wait === null) return undefined;
    const id = setTimeout(() => setNowMs(Date.now()), wait);
    return () => clearTimeout(id);
  }, [rows, nowMs]);

  const { next, more } = useMemo(() => pickNext(rows, nowMs), [rows, nowMs]);

  const cancel = useCallback(async (id: string) => {
    const status = await cancelMyReservation(id);
    setRows((current) => current.map((row) => (row.id === id ? { ...row, status } : row)));
    setNowMs(Date.now());
  }, []);

  const refresh = useCallback(() => load(false), [load]);

  return { next, more, nowMs, cancel, refresh };
}
