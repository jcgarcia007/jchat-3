/**
 * JChat 3.0 — useFollowSystem hook (Task 1.15)
 *
 * Provides follow/unfollow state and actions for a given target user.
 * Subscribes to the `follows` table via Supabase Realtime so follower/
 * following counts update live; unsubscribes on unmount.
 *
 * Guards all live Supabase calls with `isSupabaseConfigured` so the hook
 * never crashes when the backend is not yet configured (demo mode).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../services/supabase';
import { useAuth } from '../context/AuthContext';
import {
  followUser,
  unfollowUser,
  requestFollow,
  isFollowing as checkIsFollowing,
  getFollowerCount,
  getFollowingCount,
  blockUser,
  reportUser,
  type FollowState,
} from '../services/users';

// ── Public interface ────────────────────────────────────────────────────────

export interface UseFollowSystemResult {
  /** Whether the current user is following targetUserId. */
  isFollowing: boolean;
  /**
   * Whether the current user has sent a pending follow request (private accounts).
   * Always false until the `follow_requests` schema table is added.
   */
  isPending: boolean;
  /** Current follower count for targetUserId. */
  followerCount: number;
  /** Number of accounts targetUserId is following. */
  followingCount: number;
  /** True during the initial data fetch or any in-flight action. */
  loading: boolean;
  /**
   * Follow the target user.
   * If the target has a private account (currently not modelled in schema),
   * pass `isPrivate: true` to send a follow request instead of a direct follow.
   */
  follow: (options?: { isPrivate?: boolean }) => Promise<void>;
  /** Unfollow the target user. */
  unfollow: () => Promise<void>;
  /**
   * Block the target user.
   * Removes follow relationships in both directions and hides their content.
   * TODO(schema): requires `blocks` table.
   */
  block: () => Promise<void>;
  /**
   * Report the target user to the Super Admin review queue.
   * TODO(schema): requires `reports` table.
   */
  report: (reason: string) => Promise<void>;
}

// ── Hook ────────────────────────────────────────────────────────────────────

/**
 * @param targetUserId — The user whose follow relationship to observe/manage.
 *   Pass `null` or `undefined` to render a no-op idle state (useful while
 *   data is loading in the parent screen).
 */
export function useFollowSystem(
  targetUserId: string | null | undefined,
): UseFollowSystemResult {
  const { user } = useAuth();

  const [followState, setFollowState] = useState<FollowState>('none');
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Keep a ref to the Realtime channel so we can unsubscribe in cleanup.
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // ── Helpers ───────────────────────────────────────────────────────────────

  const fetchCounts = useCallback(async (userId: string) => {
    if (!isSupabaseConfigured) return;
    const [fc, fg] = await Promise.all([
      getFollowerCount(userId),
      getFollowingCount(userId),
    ]);
    setFollowerCount(fc);
    setFollowingCount(fg);
  }, []);

  const fetchFollowState = useCallback(
    async (currentId: string, targetId: string) => {
      if (!isSupabaseConfigured) return;
      const following = await checkIsFollowing(currentId, targetId);
      setFollowState(following ? 'following' : 'none');
    },
    [],
  );

  // ── Initial load + Realtime subscription ──────────────────────────────────

  useEffect(() => {
    if (!targetUserId || !user?.id) {
      setLoading(false);
      return;
    }

    const currentUserId = user.id;
    let cancelled = false;

    async function init() {
      setLoading(true);
      try {
        if (isSupabaseConfigured) {
          await Promise.all([
            fetchFollowState(currentUserId, targetUserId as string),
            fetchCounts(targetUserId as string),
          ]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void init();

    // Subscribe to follows table changes for this target user so counts
    // update live when anyone follows/unfollows them.
    if (isSupabaseConfigured) {
      const channel = supabase
        .channel(`follows:target:${targetUserId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'follows',
            filter: `following_id=eq.${targetUserId}`,
          },
          () => {
            // Refresh counts on any change to the follows rows for this user.
            void fetchCounts(targetUserId as string);
          },
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'follows',
            filter: `follower_id=eq.${currentUserId}`,
          },
          () => {
            // Re-check whether current user is still following target.
            void fetchFollowState(currentUserId, targetUserId as string);
          },
        )
        .subscribe();

      channelRef.current = channel;
    }

    return () => {
      cancelled = true;
      // Unsubscribe from Realtime on unmount (spec requirement).
      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [targetUserId, user?.id, fetchCounts, fetchFollowState]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const follow = useCallback(
    async (options?: { isPrivate?: boolean }) => {
      if (!user?.id || !targetUserId) return;
      setLoading(true);
      try {
        if (options?.isPrivate) {
          // Private account — send a follow request (pending).
          await requestFollow(user.id, targetUserId);
          setFollowState('pending');
        } else {
          await followUser(user.id, targetUserId);
          setFollowState('following');
          // Optimistic count bump; Realtime will correct if needed.
          setFollowerCount((c) => c + 1);
        }
      } finally {
        setLoading(false);
      }
    },
    [user?.id, targetUserId],
  );

  const unfollow = useCallback(async () => {
    if (!user?.id || !targetUserId) return;
    setLoading(true);
    try {
      await unfollowUser(user.id, targetUserId);
      setFollowState('none');
      // Optimistic count decrement; Realtime will correct if needed.
      setFollowerCount((c) => Math.max(0, c - 1));
    } finally {
      setLoading(false);
    }
  }, [user?.id, targetUserId]);

  const block = useCallback(async () => {
    if (!user?.id || !targetUserId) return;
    setLoading(true);
    try {
      await blockUser(user.id, targetUserId);
      // After blocking, current user is no longer following the target.
      setFollowState('none');
      setFollowerCount((c) => Math.max(0, c - 1));
    } finally {
      setLoading(false);
    }
  }, [user?.id, targetUserId]);

  const report = useCallback(
    async (reason: string) => {
      if (!user?.id || !targetUserId) return;
      await reportUser(user.id, targetUserId, reason);
    },
    [user?.id, targetUserId],
  );

  // ── Return ─────────────────────────────────────────────────────────────────

  return {
    isFollowing: followState === 'following',
    isPending: followState === 'pending',
    followerCount,
    followingCount,
    loading,
    follow,
    unfollow,
    block,
    report,
  };
}
