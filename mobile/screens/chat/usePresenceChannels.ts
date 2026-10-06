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
import { useTranslation } from 'react-i18next';

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

/** The signed-in user's own name/avatar, read once from public_profiles (NOT from session metadata). */
export interface SelfProfile {
  name: string | null;
  avatarUrl: string | null;
}

interface UsePresenceChannelsArgs {
  /** The business's main room id (from the sub-rooms query; may be undefined until it resolves). */
  mainRoomId: string | undefined;
  /** The entry room id (route.params.id). Stable for the whole session. */
  anchorRoomId: string;
  /** The room currently on screen. Changes as the user navigates. */
  activeRoomId: string;
  user: User | null;
  /**
   * Own profile. `undefined` = still loading: presence is NOT published until it resolves, so
   * nobody sees a placeholder name that later changes. `{ name: null }` = couldn't be read
   * (the translated fallback is used).
   */
  selfProfile: SelfProfile | undefined;
  /** Locked incognito choice — defines the presence payload's name/avatar. */
  enteredIncognito: IncognitoState | null;
  /** Gate: don't mount channels until the user has entered the room. */
  entryVisible: boolean;
}

interface UsePresenceChannelsResult {
  /** Present users keyed by room id. The screen reads presenceByRoom[activeRoomId]. */
  presenceByRoom: Record<string, UserSummary[]>;
}

type PresenceListener = (roomId: string, users: UserSummary[]) => void;

interface PresenceEntry {
  channel: RealtimeChannel;
  refs: number;
  listeners: Set<PresenceListener>;
  payload: PresencePayload;
}

/** What a caller holds: release it when done (the channel is torn down with the last holder). */
interface PresenceHandle {
  roomId: string;
  channel: RealtimeChannel;
  listener: PresenceListener;
}

// Presence NEEDS a shared topic (all devices join the same `presence:<roomId>`), so unlike the
// postgres_changes channels it can't be uniquified. supabase.channel(name) returns the EXISTING
// channel for a topic, and .on() after subscribe() throws — so two overlapping subscribers (an effect
// re-running while the previous run is still awaiting) crashed. Hence one channel per room, shared by
// reference count, and every create/remove of a topic runs one at a time on a per-room queue.
const presenceEntries = new Map<string, PresenceEntry>();
const presenceQueues = new Map<string, Promise<unknown>>();

function enqueuePresence<T>(roomId: string, task: () => Promise<T>): Promise<T> {
  const previous = presenceQueues.get(roomId) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(task);
  presenceQueues.set(roomId, next);
  return next;
}

function presenceUsers(channel: RealtimeChannel): UserSummary[] {
  const state = channel.presenceState<PresencePayload>();
  return Object.values(state)
    .flat()
    .filter((p, i, arr) => arr.findIndex((x) => x.user_id === p.user_id) === i)
    .map((p) => ({
      id: p.user_id,
      display_name: p.display_name,
      avatar_url: p.avatar_url,
      is_incognito: p.is_incognito,
      nickname: p.nickname ?? undefined,
    }));
}

// Subscribe + track presence on a room channel (shared, reference-counted). `onState` fires with the
// room id and its live present-user list on every sync/join/leave.
function acquirePresence(
  roomId: string,
  userId: string,
  payload: PresencePayload,
  onState: PresenceListener,
): Promise<PresenceHandle> {
  return enqueuePresence(roomId, async () => {
    const existing = presenceEntries.get(roomId);
    if (existing) {
      existing.refs += 1;
      existing.listeners.add(onState);
      existing.payload = payload;
      void existing.channel.track(payload);
      onState(roomId, presenceUsers(existing.channel));
      return { roomId, channel: existing.channel, listener: onState };
    }

    // A channel with this topic that isn't ours (stale after a reconnect) must go first.
    const name = `presence:${roomId}`;
    const stale = supabase.getChannels().filter((c) => c.topic === `realtime:${name}` || c.topic === name);
    if (stale.length > 0) await Promise.all(stale.map((c) => supabase.removeChannel(c)));

    const channel = supabase.channel(name, { config: { presence: { key: userId } } });
    const entry: PresenceEntry = { channel, refs: 1, listeners: new Set([onState]), payload };
    const rebuild = () => {
      const users = presenceUsers(channel);
      entry.listeners.forEach((listener) => listener(roomId, users));
    };
    channel
      .on('presence', { event: 'sync' }, rebuild)
      .on('presence', { event: 'join' }, rebuild)
      .on('presence', { event: 'leave' }, rebuild)
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void channel.track(entry.payload);
      });
    presenceEntries.set(roomId, entry);
    return { roomId, channel, listener: onState };
  });
}

function releasePresence(handle: PresenceHandle): Promise<void> {
  return enqueuePresence(handle.roomId, async () => {
    const entry = presenceEntries.get(handle.roomId);
    if (!entry || entry.channel !== handle.channel) return;
    entry.listeners.delete(handle.listener);
    entry.refs -= 1;
    if (entry.refs > 0) return;
    presenceEntries.delete(handle.roomId);
    try {
      await entry.channel.untrack();
    } catch {
      // the socket may already be gone; removing the channel below is what matters
    }
    await supabase.removeChannel(entry.channel);
  });
}

export function usePresenceChannels({
  mainRoomId,
  anchorRoomId,
  activeRoomId,
  user,
  selfProfile,
  enteredIncognito,
  entryVisible,
}: UsePresenceChannelsArgs): UsePresenceChannelsResult {
  const { t } = useTranslation('chat');
  const [presenceByRoom, setPresenceByRoom] = useState<Record<string, UserSummary[]>>({});
  // Bumped by the AppState handler to force a clean rebuild of channels whose
  // socket dropped in the background.
  const [refreshTick, setRefreshTick] = useState(0);

  const mainRef = useRef<RealtimeChannel | null>(null);
  const anchorRef = useRef<RealtimeChannel | null>(null);
  const visitedRef = useRef<RealtimeChannel | null>(null);
  // Always-current payload for the AppState listener (registered once).
  const payloadRef = useRef<PresencePayload | null>(null);

  // Presence payload — depends on the user, their own profile and the locked incognito choice.
  const payload = useMemo<PresencePayload | null>(() => {
    if (!user || !selfProfile) return null;
    const inc = enteredIncognito;
    const displayName = inc?.enabled
      ? (inc.nickname ?? 'Anonymous')
      // display_name → username (resolved from public_profiles) → translated fallback.
      // Never the session metadata and never the email.
      : (selfProfile.name ?? t('chatRoom.fallbackUserName'));
    const avatarUrl = inc?.enabled ? null : selfProfile.avatarUrl;
    return {
      user_id: user.id,
      display_name: displayName,
      avatar_url: avatarUrl,
      is_incognito: inc?.enabled ?? false,
      nickname: inc?.nickname ?? null,
    };
  }, [user, selfProfile, enteredIncognito, t]);

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
    const handles: PresenceHandle[] = [];

    void (async () => {
      const main = await acquirePresence(mainRoomId, user.id, payload, applyState);
      if (cancelled) { void releasePresence(main); return; }
      mainRef.current = main.channel;
      handles.push(main);

      if (anchorRoomId !== mainRoomId) {
        const anchor = await acquirePresence(anchorRoomId, user.id, payload, applyState);
        if (cancelled) { void releasePresence(anchor); return; }
        anchorRef.current = anchor.channel;
        handles.push(anchor);
      }
    })();

    return () => {
      cancelled = true;
      for (const handle of handles) void releasePresence(handle);
      mainRef.current = null;
      anchorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainRoomId, anchorRoomId, user?.id, payload, entryVisible, refreshTick]);

  // ── Rotating channel: the currently VISITED sub-chat ────────────────────────
  useEffect(() => {
    if (!isSupabaseConfigured || entryVisible || !payload || !user || !visitedRoomId) return;

    let cancelled = false;
    let handle: PresenceHandle | null = null;

    void (async () => {
      const h = await acquirePresence(visitedRoomId, user.id, payload, applyState);
      if (cancelled) { void releasePresence(h); return; }
      handle = h;
      visitedRef.current = h.channel;
    })();

    return () => {
      cancelled = true;
      if (handle) void releasePresence(handle);
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
