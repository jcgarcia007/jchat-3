/**
 * JChat 3.0 — usePresentUsers: the room's presence list filtered with the server's geo-presence (migration 243).
 *
 * The header's "N people here" and avatars come from the realtime presence, which keeps people who went to the background. This asks
 * the server (venue_present_users) which of them are still confirmed in the venue: when the room opens, every 60 s and when the app
 * returns to the foreground. It makes NO call while `enabled` is false (the room is not open: not entered yet, or unmounted) nor
 * while the app is in the background. A failed call leaves the list as it is; my own id missing from the answer also does (see
 * utils/presentUsers.ts). The schedule lives in utils/presentPoller.ts (tested with a fake clock).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { fetchPresentUsers } from '../services/venuePresence';
import { filterPresentUsers, presentQueryIds } from '../utils/presentUsers';
import { createPresentPoller } from '../utils/presentPoller';

interface Answer {
  present: string[];
  queried: string[];
}

export function usePresentUsers<T extends { id: string }>(
  users: T[],
  options: { businessId: string | null | undefined; selfId: string | null | undefined; enabled: boolean },
): T[] {
  const { businessId, selfId, enabled } = options;
  const ids = useMemo(() => presentQueryIds(users, selfId), [users, selfId]);
  const key = ids.join(',');
  const idsRef = useRef(ids);
  idsRef.current = ids;
  const [answer, setAnswer] = useState<Answer | null>(null);
  const pollerRef = useRef<ReturnType<typeof createPresentPoller<Answer>> | null>(null);

  useEffect(() => {
    if (!enabled || !businessId || !selfId) {
      setAnswer(null);
      return undefined;
    }
    const poller = createPresentPoller<Answer>({
      fetch: async () => {
        const queried = idsRef.current;
        const present = await fetchPresentUsers(businessId, queried);
        return present === null ? null : { present, queried };
      },
      isForeground: () => AppState.currentState === 'active',
      onResult: setAnswer,
      now: () => Date.now(),
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
      setRepeat: (fn, ms) => setInterval(fn, ms),
      clearRepeat: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
    });
    pollerRef.current = poller;
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') poller.trigger();
    });
    poller.start();
    return () => {
      sub.remove();
      poller.stop();
      pollerRef.current = null;
    };
  }, [enabled, businessId, selfId]);

  // The people in the room changed: ask again (the poller keeps its minimum gap and never calls in the background).
  useEffect(() => {
    pollerRef.current?.trigger();
  }, [key]);

  return useMemo(
    () => (enabled ? filterPresentUsers(users, answer?.present ?? null, answer?.queried ?? null, selfId) : users),
    [enabled, users, answer, selfId],
  );
}
