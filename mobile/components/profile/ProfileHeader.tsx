/**
 * JChat 3.0 — ProfileHeader (Task 1.7)
 *
 * Renders the top section of a user profile:
 *   - Cover photo area (80px tall, full width) with theme accent as background
 *   - Edit-photo overlay button for own profile
 *   - Avatar circle (44px, 3px border in theme accent) bottom-left of cover
 *   - Display name, @username, verified badge (IconCircleCheckFilled)
 *   - Bio (up to 150 chars)
 *   - Stats row: Posts / Followers / Following
 *   - Action buttons:
 *       own profile  → "Edit Profile" (single button)
 *       other users  → Follow (primary) + Message (secondary)
 *   - Sign-out button (own profile only, small tertiary button)
 *
 * Colors come exclusively from the ProfileTheme object — no hardcoded hex.
 * Icons: @tabler/icons-react-native only.
 */

import React from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  IconCamera,
  IconCircleCheckFilled,
  IconPencil,
  IconMessage,
} from '@tabler/icons-react-native';
import type { ProfileTheme } from '../../theme/profileThemes';

// ── Constants ────────────────────────────────────────────────────────────────

const SCREEN_W = Dimensions.get('window').width;
const COVER_HEIGHT = 80;
const AVATAR_SIZE = 44;
const AVATAR_BORDER = 3;
/** Avatar overlaps the cover by half its height */
const AVATAR_OVERLAP = AVATAR_SIZE / 2;

// ── Types ────────────────────────────────────────────────────────────────────

export interface ProfileHeaderProps {
  /** ID of the profile being viewed — used only for accessibility labels. */
  userId: string;
  /** Whether this header is for the logged-in user's own profile. */
  isOwnProfile: boolean;

  // ── Profile data ──────────────────────────────────────────────────────────
  displayName: string | null;
  username: string;
  avatarUrl: string | null;
  coverUrl: string | null;
  bio: string | null;
  isVerified: boolean;

  // ── Stats ─────────────────────────────────────────────────────────────────
  postCount: number;
  followerCount: number;
  followingCount: number;

  // ── Follow state (other-user view) ────────────────────────────────────────
  isFollowing: boolean;
  isPending: boolean;
  followLoading: boolean;

  // ── Callbacks ─────────────────────────────────────────────────────────────
  onFollow: () => void;
  onUnfollow: () => void;
  onMessage: () => void;
  onEditProfile: () => void;
  onEditCover: () => void;
  onSignOut: () => void;

  // ── Theme ─────────────────────────────────────────────────────────────────
  theme: ProfileTheme;
}

// ── Sub-components ───────────────────────────────────────────────────────────

interface StatItemProps {
  label: string;
  value: number;
  theme: ProfileTheme;
}

function StatItem({ label, value, theme }: StatItemProps) {
  return (
    <View style={styles.statItem}>
      <Text style={[styles.statValue, { color: theme.statsValColor }]}>
        {value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value)}
      </Text>
      <Text style={[styles.statLabel, { color: theme.nameColor === '#ffffff' ? 'rgba(255,255,255,0.65)' : 'rgba(0,0,0,0.5)' }]}>
        {label}
      </Text>
    </View>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export default function ProfileHeader({
  userId,
  isOwnProfile,
  displayName,
  username,
  avatarUrl,
  coverUrl,
  bio,
  isVerified,
  postCount,
  followerCount,
  followingCount,
  isFollowing,
  isPending,
  followLoading,
  onFollow,
  onUnfollow,
  onMessage,
  onEditProfile,
  onEditCover,
  onSignOut,
  theme,
}: ProfileHeaderProps) {
  const { t } = useTranslation('profile');
  const name = displayName ?? username;
  const bioTruncated = bio ? bio.slice(0, 150) : null;

  // ── Label for follow button ────────────────────────────────────────────────
  let followLabel = t('header.follow');
  if (isPending) followLabel = t('header.requested');
  else if (isFollowing) followLabel = t('header.following');

  return (
    <View style={[styles.container, { backgroundColor: theme.statsBg }]}>

      {/* ── Cover area ─────────────────────────────────────────────────────── */}
      <View style={[styles.coverWrap, { height: COVER_HEIGHT, width: SCREEN_W }]}>
        {coverUrl ? (
          <Image
            source={{ uri: coverUrl }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            accessibilityLabel={t('header.coverPhotoA11y', { name })}
          />
        ) : (
          <View
            style={[StyleSheet.absoluteFill, { backgroundColor: theme.coverBg }]}
          />
        )}

        {/* Edit-cover overlay button (own profile only) */}
        {isOwnProfile && (
          <TouchableOpacity
            style={[styles.coverEditBtn, { backgroundColor: 'rgba(0,0,0,0.45)' }]}
            onPress={onEditCover}
            accessibilityRole="button"
            accessibilityLabel={t('header.changeCoverA11y')}
          >
            <IconCamera size={16} color="#ffffff" />
          </TouchableOpacity>
        )}
      </View>

      {/* ── Avatar + name row (avatar overlaps cover) ──────────────────────── */}
      <View style={[styles.avatarRow, { marginTop: -(AVATAR_OVERLAP) }]}>
        {/* Avatar */}
        <View
          style={[
            styles.avatarOuter,
            {
              width: AVATAR_SIZE + AVATAR_BORDER * 2,
              height: AVATAR_SIZE + AVATAR_BORDER * 2,
              borderRadius: (AVATAR_SIZE + AVATAR_BORDER * 2) / 2,
              backgroundColor: theme.avatarBorder,
            },
          ]}
        >
          {avatarUrl ? (
            <Image
              source={{ uri: avatarUrl }}
              style={[
                styles.avatarInner,
                {
                  width: AVATAR_SIZE,
                  height: AVATAR_SIZE,
                  borderRadius: AVATAR_SIZE / 2,
                  backgroundColor: theme.statsBg,
                },
              ]}
              resizeMode="cover"
              accessibilityLabel={t('header.avatarA11y', { name })}
            />
          ) : (
            <View
              style={[
                styles.avatarInner,
                styles.avatarFallback,
                {
                  width: AVATAR_SIZE,
                  height: AVATAR_SIZE,
                  borderRadius: AVATAR_SIZE / 2,
                  backgroundColor: theme.statsBg,
                },
              ]}
            >
              <Text style={[styles.avatarInitials, { color: theme.statsValColor }]}>
                {name.slice(0, 2).toUpperCase()}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* ── Identity block ─────────────────────────────────────────────────── */}
      <View style={styles.identityBlock}>
        {/* Name + verified badge */}
        <View style={styles.nameRow}>
          <Text style={[styles.displayName, { color: theme.nameColor !== '#ffffff' ? '#1d1d1f' : theme.nameColor }]} numberOfLines={1}>
            {name}
          </Text>
          {isVerified && (
            <IconCircleCheckFilled
              size={16}
              color={theme.avatarBorder}
              style={styles.verifiedIcon}
              accessibilityLabel={t('header.verifiedA11y')}
            />
          )}
        </View>

        {/* Username */}
        <Text style={[styles.username, { color: theme.nameColor !== '#ffffff' ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.6)' }]}>
          @{username}
        </Text>

        {/* Bio */}
        {bioTruncated && bioTruncated.length > 0 && (
          <Text
            style={[styles.bio, { color: theme.nameColor !== '#ffffff' ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.8)' }]}
            numberOfLines={3}
          >
            {bioTruncated}
          </Text>
        )}
      </View>

      {/* ── Stats row ──────────────────────────────────────────────────────── */}
      <View style={[styles.statsRow, { borderTopColor: theme.statsBorder, borderBottomColor: theme.statsBorder }]}>
        <StatItem label={t('header.posts')} value={postCount} theme={theme} />
        <View style={[styles.statDivider, { backgroundColor: theme.statsBorder }]} />
        <StatItem label={t('header.followers')} value={followerCount} theme={theme} />
        <View style={[styles.statDivider, { backgroundColor: theme.statsBorder }]} />
        <StatItem label={t('header.following')} value={followingCount} theme={theme} />
      </View>

      {/* ── Action buttons ─────────────────────────────────────────────────── */}
      <View style={styles.actionRow}>
        {isOwnProfile ? (
          /* Own profile → single "Edit Profile" button */
          <TouchableOpacity
            style={[styles.btnPrimary, { backgroundColor: theme.btn1Bg }]}
            onPress={onEditProfile}
            accessibilityRole="button"
            accessibilityLabel={t('header.editProfileA11y')}
          >
            <IconPencil size={15} color={theme.btn1Color} />
            <Text style={[styles.btnLabel, { color: theme.btn1Color }]}>
              {t('header.editProfile')}
            </Text>
          </TouchableOpacity>
        ) : (
          /* Other user → Follow (primary) + Message (secondary) */
          <>
            <TouchableOpacity
              style={[
                styles.btnPrimary,
                styles.btnHalf,
                {
                  backgroundColor: isFollowing || isPending
                    ? theme.btn2Bg
                    : theme.btn1Bg,
                  borderWidth: isFollowing || isPending ? 1 : 0,
                  borderColor: theme.avatarBorder,
                },
              ]}
              onPress={isFollowing ? onUnfollow : onFollow}
              disabled={followLoading}
              accessibilityRole="button"
              accessibilityLabel={followLabel}
            >
              {followLoading ? (
                <ActivityIndicator size="small" color={isFollowing ? theme.btn2Color : theme.btn1Color} />
              ) : (
                <Text
                  style={[
                    styles.btnLabel,
                    { color: isFollowing || isPending ? theme.btn2Color : theme.btn1Color },
                  ]}
                >
                  {followLabel}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.btnSecondary,
                styles.btnHalf,
                { backgroundColor: theme.btn2Bg, borderColor: theme.avatarBorder },
              ]}
              onPress={onMessage}
              accessibilityRole="button"
              accessibilityLabel={t('header.messageA11y', { name })}
            >
              <IconMessage size={15} color={theme.btn2Color} />
              <Text style={[styles.btnLabel, { color: theme.btn2Color }]}>
                {t('header.message')}
              </Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* ── Sign-out affordance (own profile, small tertiary) ──────────────── */}
      {isOwnProfile && (
        <TouchableOpacity
          style={styles.signOutBtn}
          onPress={onSignOut}
          accessibilityRole="button"
          accessibilityLabel={t('header.signOutA11y')}
        >
          <Text style={[styles.signOutLabel, { color: theme.nameColor !== '#ffffff' ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)' }]}>
            {t('header.signOut')}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── Styles (numbers only — zero hardcoded hex) ───────────────────────────────

const styles = StyleSheet.create({
  container: {
    width: SCREEN_W,
  },

  // Cover
  coverWrap: {
    overflow: 'hidden',
  },
  coverEditBtn: {
    position: 'absolute',
    right: 10,
    bottom: 8,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Avatar
  avatarRow: {
    paddingLeft: 16,
  },
  avatarOuter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInner: {
    // width/height/borderRadius applied inline
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontSize: 16,
    fontWeight: '700',
  },

  // Identity
  identityBlock: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 3,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  displayName: {
    fontSize: 20,
    fontWeight: '700',
    flexShrink: 1,
  },
  verifiedIcon: {
    marginTop: 1,
  },
  username: {
    fontSize: 14,
    fontWeight: '400',
  },
  bio: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 12,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  statValue: {
    fontSize: 17,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '500',
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    height: 28,
  },

  // Action buttons
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 4,
  },
  btnPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 38,
    borderRadius: 10,
  },
  btnSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
  },
  btnHalf: {
    flex: 1,
  },
  btnLabel: {
    fontSize: 14,
    fontWeight: '600',
  },

  // Sign-out
  signOutBtn: {
    alignSelf: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  signOutLabel: {
    fontSize: 12,
    fontWeight: '400',
  },
});
