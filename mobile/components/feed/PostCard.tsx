/**
 * JChat 3.0 — PostCard (Task 1.9)
 * Renders a single PostRow: avatar + name + timestamp + caption +
 * photo strip (media_urls) + like / comment / share action bar.
 *
 * Like button:  animated heart with live count; toggles via props.
 * Comments:     tapping the comment count fires onOpenComments(post).
 * Share:        stub action (// TODO: share sheet).
 *
 * Colors: useThemeColors() only — no hardcoded hex.
 * Icons:  @tabler/icons-react-native only.
 */

import React, { useCallback, useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  IconHeart,
  IconHeartFilled,
  IconMessageCircle,
  IconShare,
} from '@tabler/icons-react-native';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useThemeColors } from '../../theme/colors';
import type { PostRow } from '../../services/posts';

// ─── helpers ────────────────────────────────────────────────────────────────

const { width: SCREEN_W } = Dimensions.get('window');
const MEDIA_H = 280;

/** Format a UTC ISO string as a relative human label ("2h ago", "3d ago"). */
function relativeTime(iso: string, t: TFunction<'feed'>): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return t('post.justNow');
  if (mins < 60) return t('post.minAgo', { count: mins });
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return t('post.hourAgo', { count: hrs });
  const days = Math.floor(hrs / 24);
  if (days < 7) return t('post.dayAgo', { count: days });
  return new Date(iso).toLocaleDateString();
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface PostCardProps {
  post: PostRow;
  /** Called when the user taps like / unlike on this post. */
  onToggleLike: (post: PostRow) => void;
  /** Called when the user taps the comment area — parent owns the sheet. */
  onOpenComments: (post: PostRow) => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function PostCard({
  post,
  onToggleLike,
  onOpenComments,
}: PostCardProps) {
  const c = useThemeColors();
  const { t } = useTranslation('feed');

  // Animated heart scale — pulses when liked.
  const heartScale = useRef(new Animated.Value(1)).current;

  const handleToggleLike = useCallback(() => {
    // Spring animation: quick pop.
    Animated.sequence([
      Animated.spring(heartScale, {
        toValue: 1.4,
        useNativeDriver: true,
        speed: 40,
        bounciness: 8,
      }),
      Animated.spring(heartScale, {
        toValue: 1,
        useNativeDriver: true,
        speed: 40,
        bounciness: 4,
      }),
    ]).start();
    onToggleLike(post);
  }, [heartScale, onToggleLike, post]);

  // Re-trigger pop animation whenever liked_by_me flips to true.
  const wasLiked = useRef(post.liked_by_me);
  useEffect(() => {
    if (post.liked_by_me && !wasLiked.current) {
      Animated.sequence([
        Animated.spring(heartScale, {
          toValue: 1.35,
          useNativeDriver: true,
          speed: 40,
          bounciness: 8,
        }),
        Animated.spring(heartScale, {
          toValue: 1,
          useNativeDriver: true,
          speed: 40,
          bounciness: 4,
        }),
      ]).start();
    }
    wasLiked.current = post.liked_by_me;
  }, [post.liked_by_me, heartScale]);

  const authorName =
    post.author?.display_name ?? post.author?.username ?? t('post.unknownAuthor');
  const initials = authorName.slice(0, 2).toUpperCase();
  const likeCount = post.like_count ?? 0;
  const commentCount = post.comment_count ?? 0;

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: c.bgSurface, borderColor: c.borderSubtle },
      ]}
    >
      {/* ── Header: avatar + name + timestamp ── */}
      <View style={styles.header}>
        {post.author?.avatar_url ? (
          <Image
            source={{ uri: post.author.avatar_url }}
            style={[styles.avatar, { backgroundColor: c.bgOverlay }]}
            accessibilityLabel={t('post.avatarA11y', { name: authorName })}
          />
        ) : (
          <View
            style={[styles.avatar, styles.avatarFallback, { backgroundColor: c.bgOverlay }]}
          >
            <Text style={[styles.avatarInitials, { color: c.textSecondary }]}>
              {initials}
            </Text>
          </View>
        )}
        <View style={styles.headerText}>
          <Text
            style={[styles.authorName, { color: c.textPrimary }]}
            numberOfLines={1}
          >
            {authorName}
          </Text>
          <Text style={[styles.timestamp, { color: c.textTertiary }]}>
            {relativeTime(post.created_at, t)}
          </Text>
        </View>
      </View>

      {/* ── Caption ── */}
      {post.caption ? (
        <Text style={[styles.caption, { color: c.textPrimary }]}>
          {post.caption}
        </Text>
      ) : null}

      {/* ── Geotag (manual text only — never GPS) ── */}
      {post.geotag ? (
        <Text style={[styles.geotag, { color: c.textTertiary }]}>
          📍 {post.geotag}
        </Text>
      ) : null}

      {/* ── Media strip ── */}
      {post.media_urls && post.media_urls.length > 0 ? (
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          style={styles.mediaScroll}
          accessibilityLabel={t('post.photosA11y')}
        >
          {post.media_urls.map((url, idx) => (
            <Image
              key={`${post.id}-media-${idx}`}
              source={{ uri: url }}
              style={[styles.mediaImage, { backgroundColor: c.bgOverlay }]}
              resizeMode="cover"
              accessibilityLabel={t('post.photoA11y', { index: idx + 1, total: post.media_urls.length })}
            />
          ))}
        </ScrollView>
      ) : null}

      {/* ── Action bar: like / comment / share ── */}
      <View style={[styles.actions, { borderTopColor: c.borderSubtle }]}>
        {/* Like */}
        <TouchableOpacity
          style={styles.action}
          onPress={handleToggleLike}
          accessibilityRole="button"
          accessibilityLabel={post.liked_by_me ? t('post.unlikeA11y') : t('post.likeA11y')}
          accessibilityState={{ selected: !!post.liked_by_me }}
        >
          <Animated.View style={{ transform: [{ scale: heartScale }] }}>
            {post.liked_by_me ? (
              <IconHeartFilled size={22} color={c.danger} />
            ) : (
              <IconHeart size={22} color={c.textSecondary} />
            )}
          </Animated.View>
          {likeCount > 0 ? (
            <Text
              style={[
                styles.actionCount,
                { color: post.liked_by_me ? c.danger : c.textSecondary },
              ]}
            >
              {likeCount}
            </Text>
          ) : null}
        </TouchableOpacity>

        {/* Comment */}
        <TouchableOpacity
          style={styles.action}
          onPress={() => onOpenComments(post)}
          accessibilityRole="button"
          accessibilityLabel={t('post.commentsA11y', { count: commentCount })}
        >
          <IconMessageCircle size={22} color={c.textSecondary} />
          {commentCount > 0 ? (
            <Text style={[styles.actionCount, { color: c.textSecondary }]}>
              {commentCount}
            </Text>
          ) : null}
        </TouchableOpacity>

        {/* Share — stub */}
        <TouchableOpacity
          style={styles.action}
          onPress={() => {
            // TODO(share): open native share sheet for this post
          }}
          accessibilityRole="button"
          accessibilityLabel={t('post.shareA11y')}
        >
          <IconShare size={22} color={c.textSecondary} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 12,
    marginVertical: 6,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontSize: 14,
    fontWeight: '600',
  },
  headerText: {
    marginLeft: 10,
    flex: 1,
  },
  authorName: {
    fontSize: 15,
    fontWeight: '600',
  },
  timestamp: {
    fontSize: 12,
    marginTop: 1,
  },
  caption: {
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: 14,
    paddingBottom: 10,
  },
  geotag: {
    fontSize: 12,
    paddingHorizontal: 14,
    paddingBottom: 8,
  },
  mediaScroll: {
    width: SCREEN_W - 24, // matches card margin
  },
  mediaImage: {
    width: SCREEN_W - 24,
    height: MEDIA_H,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 20,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  actionCount: {
    fontSize: 13,
    fontWeight: '500',
  },
});
