/**
 * JChat 3.0 — Social Feed Screen (Task 1.9)
 *
 * Following-only chronological feed:
 *  1. getFollowingIds(user.id)  →  ids[]
 *  2. listFeed(ids, page)       →  PostRow[]  (20/page, oldest-first by created_at DESC)
 *  3. FlatList + onEndReached   →  infinite pagination
 *  4. RefreshControl            →  pull-to-refresh (resets to page 0)
 *  5. Supabase Realtime         →  subscribe to post_likes INSERT/DELETE; update
 *                                  like_count + liked_by_me in local state; unsubscribe on unmount.
 *
 * Empty state: "Follow people to see their posts. Find them inside business chats."
 * CommentSheet: TODO stub — onOpenComments triggers an Alert placeholder until Task 2.x.
 *
 * Colors: useThemeColors() only. Icons: @tabler/icons-react-native only.
 * // TODO(i18n): all strings are English; wire to i18n once the layer is set up.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  ListRenderItemInfo,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { IconUsers } from '@tabler/icons-react-native';

import { useThemeColors } from '../../theme/colors';
import { useAuth } from '../../context/AuthContext';
import { supabase, isSupabaseConfigured } from '../../services/supabase';
import {
  listFeed,
  likePost,
  unlikePost,
  type PostRow,
} from '../../services/posts';
import PostCard from '../../components/feed/PostCard';
import StoriesRow from '../../components/stories/StoriesRow';

// ─── Local helper — get IDs the current user follows ─────────────────────────

async function getFollowingIds(userId: string): Promise<string[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from('follows')
    .select('following_id')
    .eq('follower_id', userId);
  if (error) {
    console.warn('[FeedScreen] getFollowingIds error:', error.message);
    return [];
  }
  return (data ?? []).map((r: { following_id: string }) => r.following_id);
}

// ─── Realtime payload shapes ──────────────────────────────────────────────────

interface LikePayload {
  post_id: string;
  user_id: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;
const FOOTER_HEIGHT = 56;

export default function FeedScreen() {
  const c = useThemeColors();
  const { user } = useAuth();

  const [posts, setPosts] = useState<PostRow[]>([]);
  const [followingIds, setFollowingIds] = useState<string[]>([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);

  // Prevent duplicate onEndReached triggers.
  const endReachedLock = useRef(false);

  // ── 1. Load following ids on mount (once per user) ────────────────────────
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    getFollowingIds(user.id).then((ids) => {
      if (!cancelled) setFollowingIds(ids);
    });
    return () => { cancelled = true; };
  }, [user?.id]);

  // ── 2. Load first page when followingIds are ready ────────────────────────
  useEffect(() => {
    if (!user?.id) return;
    // followingIds resolved (even if empty) — initial load.
    setLoading(true);
    setInitError(null);
    setPage(0);
    setHasMore(true);

    listFeed(followingIds, 0)
      .then((rows) => {
        const enriched = enrichWithMe(rows, user.id);
        setPosts(enriched);
        setHasMore(rows.length === PAGE_SIZE);
      })
      .catch((err: Error) => {
        console.warn('[FeedScreen] initial load error:', err.message);
        setInitError('Could not load feed. Pull down to retry.');
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [followingIds, user?.id]);

  // ── 3. Supabase Realtime — post_likes table ───────────────────────────────
  useEffect(() => {
    if (!isSupabaseConfigured || !user?.id) return;

    const channel = supabase
      .channel('post_likes_feed')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'post_likes' },
        (payload) => {
          const { post_id, user_id } = payload.new as LikePayload;
          setPosts((prev) =>
            prev.map((p) => {
              if (p.id !== post_id) return p;
              return {
                ...p,
                like_count: (p.like_count ?? 0) + 1,
                liked_by_me:
                  user_id === user.id ? true : p.liked_by_me,
              };
            }),
          );
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'post_likes' },
        (payload) => {
          const { post_id, user_id } = payload.old as LikePayload;
          setPosts((prev) =>
            prev.map((p) => {
              if (p.id !== post_id) return p;
              return {
                ...p,
                like_count: Math.max(0, (p.like_count ?? 1) - 1),
                liked_by_me:
                  user_id === user.id ? false : p.liked_by_me,
              };
            }),
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  // ── 4. Pull-to-refresh ────────────────────────────────────────────────────
  const handleRefresh = useCallback(() => {
    if (!user?.id) return;
    setRefreshing(true);
    setHasMore(true);
    endReachedLock.current = false;
    listFeed(followingIds, 0)
      .then((rows) => {
        setPosts(enrichWithMe(rows, user.id));
        setPage(0);
        setHasMore(rows.length === PAGE_SIZE);
      })
      .catch((err: Error) =>
        console.warn('[FeedScreen] refresh error:', err.message),
      )
      .finally(() => setRefreshing(false));
  }, [followingIds, user?.id]);

  // ── 5. Infinite scroll ────────────────────────────────────────────────────
  const handleEndReached = useCallback(() => {
    if (endReachedLock.current || loadingMore || !hasMore || !user?.id) return;
    endReachedLock.current = true;
    setLoadingMore(true);
    const nextPage = page + 1;
    listFeed(followingIds, nextPage)
      .then((rows) => {
        if (rows.length === 0) {
          setHasMore(false);
          return;
        }
        setPosts((prev) => [...prev, ...enrichWithMe(rows, user.id)]);
        setPage(nextPage);
        setHasMore(rows.length === PAGE_SIZE);
      })
      .catch((err: Error) =>
        console.warn('[FeedScreen] load more error:', err.message),
      )
      .finally(() => {
        setLoadingMore(false);
        endReachedLock.current = false;
      });
  }, [endReachedLock, loadingMore, hasMore, user?.id, page, followingIds]);

  // ── 6. Like toggle ────────────────────────────────────────────────────────
  const handleToggleLike = useCallback(
    (post: PostRow) => {
      if (!user?.id) return;
      const alreadyLiked = post.liked_by_me;
      // Optimistic update.
      setPosts((prev) =>
        prev.map((p) => {
          if (p.id !== post.id) return p;
          return {
            ...p,
            liked_by_me: !alreadyLiked,
            like_count: (p.like_count ?? 0) + (alreadyLiked ? -1 : 1),
          };
        }),
      );
      const fn = alreadyLiked ? unlikePost : likePost;
      fn(post.id, user.id).catch((err: Error) => {
        // Rollback on error.
        console.warn('[FeedScreen] like toggle error:', err.message);
        setPosts((prev) =>
          prev.map((p) => {
            if (p.id !== post.id) return p;
            return {
              ...p,
              liked_by_me: alreadyLiked,
              like_count: (p.like_count ?? 0) + (alreadyLiked ? 1 : -1),
            };
          }),
        );
      });
    },
    [user?.id],
  );

  // ── 7. Open comments — stub ───────────────────────────────────────────────
  const handleOpenComments = useCallback((post: PostRow) => {
    // TODO(comments): replace with real CommentSheet (Task 1.x / 2.x)
    Alert.alert(
      'Comments',
      `${post.comment_count ?? 0} comment(s) on this post.\nComment sheet coming soon.`,
    );
  }, []);

  // ── Render helpers ────────────────────────────────────────────────────────

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<PostRow>) => (
      <PostCard
        post={item}
        onToggleLike={handleToggleLike}
        onOpenComments={handleOpenComments}
      />
    ),
    [handleToggleLike, handleOpenComments],
  );

  const keyExtractor = useCallback((item: PostRow) => item.id, []);

  const ListEmptyComponent = useMemo(() => {
    if (loading) return null; // spinner shown separately
    return (
      <View style={styles.empty}>
        <IconUsers size={48} color={c.textTertiary} />
        <Text style={[styles.emptyTitle, { color: c.textPrimary }]}>
          Nothing here yet
        </Text>
        <Text style={[styles.emptyBody, { color: c.textSecondary }]}>
          Follow people to see their posts.{'\n'}
          Find them inside business chats.
        </Text>
        {initError ? (
          <Text style={[styles.errorText, { color: c.danger }]}>
            {initError}
          </Text>
        ) : null}
      </View>
    );
  }, [loading, c, initError]);

  const ListFooterComponent = useMemo(() => {
    if (!loadingMore) return null;
    return (
      <View style={styles.footer}>
        <ActivityIndicator size="small" color={c.brand} />
      </View>
    );
  }, [loadingMore, c.brand]);

  const refreshControl = useMemo(
    () => (
      <RefreshControl
        refreshing={refreshing}
        onRefresh={handleRefresh}
        tintColor={c.brand}
        colors={[c.brand]}
      />
    ),
    [refreshing, handleRefresh, c.brand],
  );

  // ── Full-screen loading spinner on initial load ───────────────────────────
  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: c.bgBase }]}>
        <ActivityIndicator size="large" color={c.brand} />
      </View>
    );
  }

  // ── Stories row header ────────────────────────────────────────────────────

  const StoriesHeader = useMemo(() => {
    if (!user?.id) return null;
    return (
      <StoriesRow
        currentUserId={user.id}
        currentUserAvatarUrl={
          // user.user_metadata may carry avatar_url from the auth provider.
          (user.user_metadata?.avatar_url as string | undefined) ?? null
        }
      />
    );
  }, [user?.id, user?.user_metadata?.avatar_url]);

  return (
    <View style={[styles.container, { backgroundColor: c.bgBase }]}>
      <FlatList<PostRow>
        data={posts}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        refreshControl={refreshControl}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.4}
        ListHeaderComponent={StoriesHeader}
        ListEmptyComponent={ListEmptyComponent}
        ListFooterComponent={ListFooterComponent}
        contentContainerStyle={
          posts.length === 0 ? styles.emptyContainer : styles.listContent
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

// ─── Utility ──────────────────────────────────────────────────────────────────

/**
 * Stamp each post with liked_by_me = false as a sensible default since the
 * feed query doesn't JOIN post_likes for the current user yet.
 * The Realtime subscription and optimistic updates keep it current from
 * the moment the screen mounts.
 * TODO: add a subquery in listFeed to populate liked_by_me server-side.
 */
function enrichWithMe(rows: PostRow[], userId: string): PostRow[] {
  void userId; // userId reserved for future server-side enrichment
  return rows.map((p) => ({
    ...p,
    liked_by_me: p.liked_by_me ?? false,
    like_count: p.like_count ?? 0,
    comment_count: p.comment_count ?? 0,
  }));
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingVertical: 8,
  },
  emptyContainer: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  empty: {
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 48,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  emptyBody: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 4,
  },
  footer: {
    height: FOOTER_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
