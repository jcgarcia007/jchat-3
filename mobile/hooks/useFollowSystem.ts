/**
 * JChat 3.0 — useFollowSystem hook
 *
 * Relationship between the signed-in user and a target user, as ONE state:
 *   none · requested (my pending follow_request) · following · blockedByMe · blockedMe
 * plus the actions that move between them. Following always goes through the
 * request_or_follow RPC (the server decides public vs private); the app never inserts
 * into `follows` directly.
 *
 * Every action is guarded against double taps and rolls the state back if it fails,
 * returning `null`/`false` so the screen can show the translated error. Counters are NOT
 * handled here: the screen reads them from profile_counts.
 *
 * Realtime: one channel on MY follow edges, unsubscribed on unmount.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../services/supabase';
import { useAuth } from '../context/AuthContext';
import { unfollowUser, isFollowing as checkIsFollowing } from '../services/users';
import { cancelRequest, hasPendingRequestTo, requestOrFollow, type FollowResult } from '../services/follows';
import { getBlockRelations, isBlocked as checkIBlocked, unblockUser } from '../services/blocks';

export type FollowRelation = 'none' | 'requested' | 'following' | 'blockedByMe' | 'blockedMe';

export interface UseFollowSystemResult {
  relation: FollowRelation;
  /** True during the first load of the relationship. */
  loading: boolean;
  /** True while an action (follow, unfollow, cancel, unblock) is in flight. */
  busy: boolean;
  /** Follow or request. Resolves with the server's answer, or null if it failed (state rolled back). */
  follow: () => Promise<FollowResult | null>;
  /** Stop following. Resolves false if it failed (state rolled back). */
  unfollow: () => Promise<boolean>;
  /** Cancel my pending request. Resolves false if it failed (state rolled back). */
  cancelFollowRequest: () => Promise<boolean>;
  /** Unblock the target. Resolves false if it failed. */
  unblock: () => Promise<boolean>;
  /** Re-read the relationship from the server. */
  refresh: () => Promise<void>;
}

/** @param targetUserId — pass null/undefined for an idle state (own profile, or still loading). */
export function useFollowSystem(targetUserId: string | null | undefined): UseFollowSystemResult {
  const { user } = useAuth();
  const myId = user?.id ?? null;

  const [relation, setRelation] = useState<FollowRelation>('none');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  // Synchronous guard: state updates are too late to stop a fast double tap.
  const busyRef = useRef(false);
  // Drops answers of a previous target / an older read.
  const readIdRef = useRef(0);

  const readRelation = useCallback(async (me: string, target: string): Promise<FollowRelation> => {
    const [following, requested, relations, iBlocked] = await Promise.all([
      checkIsFollowing(me, target),
      hasPendingRequestTo(target),
      getBlockRelations(),
      checkIBlocked(target),
    ]);
    if (iBlocked) return 'blockedByMe';
    if (relations.has(target)) return 'blockedMe'; // related by a block, but not one of mine
    if (following) return 'following';
    if (requested) return 'requested';
    return 'none';
  }, []);

  const refresh = useCallback(async () => {
    if (!myId || !targetUserId || !isSupabaseConfigured) return;
    const readId = ++readIdRef.current;
    try {
      const next = await readRelation(myId, targetUserId);
      if (readId === readIdRef.current) setRelation(next);
    } catch (error) {
      console.warn('[follow] read relation error:', error);
    }
  }, [myId, targetUserId, readRelation]);

  // Initial load + live updates of MY follow edges.
  useEffect(() => {
    if (!myId || !targetUserId || !isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void refresh().finally(() => { if (!cancelled) setLoading(false); });

    const channel = supabase
      .channel(`follows:me:${myId}:${targetUserId}:${Date.now()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'follows', filter: `follower_id=eq.${myId}` },
        () => { if (!busyRef.current) void refresh(); },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [myId, targetUserId, refresh]);

  /** Run an action once at a time; roll back to `previous` if it fails. */
  const run = useCallback(
    async <T,>(optimistic: FollowRelation | null, action: () => Promise<T>): Promise<T | null> => {
      if (busyRef.current) return null;
      busyRef.current = true;
      setBusy(true);
      readIdRef.current += 1; // anything read before this action is now stale
      const previous = relation;
      if (optimistic) setRelation(optimistic);
      try {
        return await action();
      } catch (error) {
        console.warn('[follow] action error:', error);
        setRelation(previous);
        return null;
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [relation],
  );

  const follow = useCallback(async (): Promise<FollowResult | null> => {
    if (!targetUserId) return null;
    const result = await run<FollowResult>(null, () => requestOrFollow(targetUserId));
    if (result) setRelation(result === 'requested' ? 'requested' : 'following');
    return result;
  }, [run, targetUserId]);

  const unfollow = useCallback(async (): Promise<boolean> => {
    if (!myId || !targetUserId) return false;
    const done = await run<boolean>('none', async () => {
      await unfollowUser(myId, targetUserId);
      return true;
    });
    return done === true;
  }, [run, myId, targetUserId]);

  const cancelFollowRequest = useCallback(async (): Promise<boolean> => {
    if (!targetUserId) return false;
    const done = await run<boolean>('none', async () => {
      await cancelRequest(targetUserId);
      return true;
    });
    return done === true;
  }, [run, targetUserId]);

  const unblock = useCallback(async (): Promise<boolean> => {
    if (!targetUserId) return false;
    const done = await run<boolean>('none', async () => {
      await unblockUser(targetUserId);
      return true;
    });
    if (done) await refresh();
    return done === true;
  }, [run, targetUserId, refresh]);

  return { relation, loading, busy, follow, unfollow, cancelFollowRequest, unblock, refresh };
}
