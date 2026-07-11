/**
 * JChat 3.0 — usePresenceChannels
 *
 * Multi-room presence for the chat screen (port of web DISENO_SUBCHATS.md §2.5).
 *
 * A user is "present" in several rooms at once:
 *   • MAIN    — the business's main room. Permanent while the session lives.
 *   • ANCHOR  — the room the user entered by (route.params.id). Permanent.
 *               Skipped when it equals MAIN (already covered).
 *   • VISITED — the sub-chat currently on screen, one at a time. Rotates as the
 *               user navigates; null when the active room is main/anchor.
 *
 * The permanent channels intentionally do NOT depend on activeRoomId, so they
 * never re-mount (and never flicker join/leave) when the user switches rooms.
 *
 * AppState (option a): on returning to foreground ('active') we re-emit the
 * presence track on live channels and rebuild any channel whose socket dropped
 * while backgrounded — Supabase reconnects the socket but does NOT re-emit
 * track() automatically, so without this the user would silently disappear from
 * main/anchor. We never untrack on 'background'.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import type { RealtimeChannel, User } from '@supabase/supabase-js';

import { supabase, isSupabaseConfigured } from '../../services/supabase';
import type { UserSummary } from '../../components/chat/ChatTopBar';
import type { IncognitoState } from '../../components/chat/IncognitoToggle';

interface PresencePayload {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  is_incognito: boolean;
  nickname: string | null;
}

interface UsePresenceChannelsArgs {
  /** The business's main room id (from the sub-rooms query; may be undefined until it resolves). */
  mainRoomId: string | undefined;
  /** The entry room id (route.params.id). Stable for the whole session. */
  anchorRoomId: string;
  /** The room currently on screen. Changes as the user navigates. */
  activeRoomId: string;
  user: User | null;
  /** Locked incognito choice — defines the presence payload's name/avatar. */
  enteredIncognito: IncognitoState | null;
  /** Gate: don't mount channels until the user has entered the room. */
  entryVisible: boolean;
}

interface UsePresenceChannelsResult {
  /** Present users keyed by room id. The screen reads presenceByRoom[activeRoomId]. */
  presenceByRoom: Record<string, UserSummary[]>;
}

// Subscribe + track presence on a single room channel. Caller owns the returned
// channel (untrack + removeChannel on cleanup). `onState` fires with the room id
// and its live present-user list on every sync/join/leave.
async function subscribePresence(
  roomId: string,
  userId: string,
  payload: PresencePayload,
  onState: (roomId: string, users: UserSummary[]) => void,
): Promise<RealtimeChannel> {
  const name = `presence:${roomId}`;
  // Presence NEEDS a shared topic (all devices join the same one), so we can't
  // uniquify it like the postgres_changes channels. Instead, drop any stale channel
  // with this topic and AWAIT it: supabase.channel(name) otherwise returns the old,
  // already-subscribed channel and .on() after subscribe() throws.
  const stale = supabase
    .getChannels()
    .filter((c) => c.topic === `realtime:${name}` || c.topic === name);
  if (stale.length > 0) {
    await Promise.all(stale.map((c) => supabase.removeChannel(c)));
  }

  const ch = supabase.channel(name, {
    config: { presence: { key: userId } },
  });
  const rebuild = () => {
    const state = ch.presenceState<PresencePayload>();
    const users: UserSummary[] = Object.values(state)
      .flat()
      .filter((p, i, arr) => arr.findIndex((x) => x.user_id === p.user_id) === i)
      .map((p) => ({
        id: p.user_id,
        display_name: p.display_name,
        avatar_url: p.avatar_url,
        is_incognito: p.is_incognito,
        nickname: p.nickname ?? undefined,
      }));
    onState(roomId, users);
  };
  ch.on('presence', { event: 'sync' }, rebuild)
    .on('presence', { event: 'join' }, rebuild)
    .on('presence', { event: 'leave' }, rebuild)
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') void ch.track(payload);
    });
  return ch;
}

export function usePresenceChannels({
  mainRoomId,
  anchorRoomId,
  activeRoomId,
  user,
  enteredIncognito,
  entryVisible,
}: UsePresenceChannelsArgs): UsePresenceChannelsResult {
  const [presenceByRoom, setPresenceByRoom] = useState<Record<string, UserSummary[]>>({});
  // Bumped by the AppState handler to force a clean rebuild of channels whose
  // socket dropped in the background.
  const [refreshTick, setRefreshTick] = useState(0);

  const mainRef = useRef<RealtimeChannel | null>(null);
  const anchorRef = useRef<RealtimeChannel | null>(null);
  const visitedRef = useRef<RealtimeChannel | null>(null);
  // Always-current payload for the AppState listener (registered once).
  const payloadRef = useRef<PresencePayload | null>(null);

  // Presence payload — depends only on the locked incognito choice + user.
  const payload = useMemo<PresencePayload | null>(() => {
    if (!user) return null;
    const inc = enteredIncognito;
    const displayName = inc?.enabled
      ? (inc.nickname ?? 'Anonymous')
      : ((user.user_metadata?.username as string | undefined) ?? user.email ?? 'User');
    const avatarUrl = inc?.enabled
      ? null
      : ((user.user_metadata?.avatar_url as string | undefined) ?? null);
    return {
      user_id: user.id,
      display_name: displayName,
      avatar_url: avatarUrl,
      is_incognito: inc?.enabled ?? false,
      nickname: inc?.nickname ?? null,
    };
  }, [user, enteredIncognito]);

  useEffect(() => {
    payloadRef.current = payload;
  }, [payload]);

  // Visited (rotating) channel: only when the active room is neither main nor
  // anchor (those are covered by the permanent channels) → no duplicate channel.
  const visitedRoomId =
    activeRoomId !== mainRoomId && activeRoomId !== anchorRoomId ? activeRoomId : null;

  const applyState = (rid: string, users: UserSummary[]) =>
    setPresenceByRoom((prev) => ({ ...prev, [rid]: users }));

  // ── Permanent channels: MAIN (always) + ANCHOR (if ≠ main) ──────────────────
  // Deps intentionally exclude activeRoomId so these never re-mount on navigation.
  useEffect(() => {
    if (!isSupabaseConfigured || entryVisible || !payload || !user || !mainRoomId) return;

    let cancelled = false;
    const channels: RealtimeChannel[] = [];

    void (async () => {
      const main = await subscribePresence(mainRoomId, user.id, payload, applyState);
      if (cancelled) { void supabase.removeChannel(main); return; }
      mainRef.current = main;
      channels.push(main);

      if (anchorRoomId !== mainRoomId) {
        const anchor = await subscribePresence(anchorRoomId, user.id, payload, applyState);
        if (cancelled) { void supabase.removeChannel(anchor); return; }
        anchorRef.current = anchor;
        channels.push(anchor);
      }
    })();

    return () => {
      cancelled = true;
      for (const ch of channels) {
        void ch.untrack().finally(() => {
          void supabase.removeChannel(ch);
        });
      }
      mainRef.current = null;
      anchorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainRoomId, anchorRoomId, user?.id, payload, entryVisible, refreshTick]);

  // ── Rotating channel: the currently VISITED sub-chat ────────────────────────
  useEffect(() => {
    if (!isSupabaseConfigured || entryVisible || !payload || !user || !visitedRoomId) return;

    let cancelled = false;
    let ch: RealtimeChannel | null = null;

    void (async () => {
      const c = await subscribePresence(visitedRoomId, user.id, payload, applyState);
      if (cancelled) { void supabase.removeChannel(c); return; }
      ch = c;
      visitedRef.current = c;
    })();

    return () => {
      cancelled = true;
      if (ch) {
        const c = ch;
        void c.untrack().finally(() => {
          void supabase.removeChannel(c);
        });
      }
      visitedRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visitedRoomId, user?.id, payload, entryVisible, refreshTick]);

  // ── AppState: re-track on foreground; rebuild any dropped channel ───────────
  useEffect(() => {
    const onChange = (next: AppStateStatus) => {
      if (next !== 'active') return; // option (a): do nothing on background
      const p = payloadRef.current;
      if (!p) return;
      const channels = [mainRef.current, anchorRef.current, visitedRef.current].filter(
        (c): c is RealtimeChannel => c !== null,
      );
      let needsRebuild = false;
      for (const ch of channels) {
        if (ch.state === 'joined') {
          void ch.track(p); // socket alive → cheap re-emit
        } else {
          needsRebuild = true; // socket/channel dropped → rebuild clean
        }
      }
      if (needsRebuild) setRefreshTick((t) => t + 1);
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, []);

  return { presenceByRoom };
}
