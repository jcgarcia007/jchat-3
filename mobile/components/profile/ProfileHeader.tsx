/**
 * JChat 3.0 — ProfileHeader (design "B5": left-aligned avatar with the figures beside it)
 *
 * A 130 px gradient at the top (the profile theme's headerGradient) that fades into the page background, the avatar
 * (88 px, a 3 px ring in the theme's accent and a 4 px page-coloured border) on the left, half over the gradient, with
 * the three figures in line to its right (Posts · Followers · Following, no cards). Under it, left-aligned: the name
 * (+ the "Edit" chip on the own profile), the bio (3 lines and "more"), the city (only when the owner shows it). Another
 * person's profile also gets the Follow / Message buttons; the own profile has none (the "+" lives in the screen).
 *
 * The profile theme only gives the accent (ring, primary button) and the gradient. Page, cards, texts and borders come
 * from useThemeColors(), so a profile follows the system light / dark.
 *
 * PRIVACY (decision A.1): nothing here shows where a person is right now.
 */

import React, { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import {
  IconArrowLeft, IconCircleCheckFilled, IconDots, IconX,
  IconMapPin, IconMessage, IconPencil, IconSettings, IconShare3,
} from '@tabler/icons-react-native';

import { Spinner } from '../common/Spinner';
import { useThemeColors } from '../../theme/colors';
import { readableOn, type ProfileTheme } from '../../theme/profileThemes';
import type { FollowRelation } from '../../hooks/useFollowSystem';
import { getInitials } from '../../utils/initials';

/** Height of the gradient behind the avatar. */
export const HEADER_GRADIENT_HEIGHT = 130;
/** Vertical centre of the avatar, measured from the top of the header (half over the gradient). */
const AVATAR_CENTER_Y = 144;
const AVATAR_SIZE = 88;
const AVATAR_RING = 3;
const AVATAR_BORDER = 4;
const AVATAR_OUTER = AVATAR_SIZE + (AVATAR_RING + AVATAR_BORDER) * 2;
const BIO_MAX_LINES = 3;

export interface ProfileTopBarProps {
  isOwnProfile: boolean;
  /** Own profile opened as a stacked screen (e.g. from the chat): show the back arrow. */
  showBack?: boolean;
  /** Inside the profile sheet the sheet's own ✕ closes it: no back arrow (own or other's profile). */
  hideBack?: boolean;
  username: string;
  topInset: number;
  onBack: () => void;
  onOpenMenu: () => void;
  onShare: () => void;
  onSettings: () => void;
}

export interface ProfileHeaderProps {
  isOwnProfile: boolean;
  displayName: string | null;
  username: string;
  avatarUrl: string | null;
  bio: string | null;
  /** Already filtered by the owner's "show city" choice: null / empty hides the line. */
  city: string | null;
  isVerified: boolean;
  postCount: number;
  followerCount: number;
  followingCount: number;
  /** Not painted any more (the "Places" card was removed); kept optional so old callers still compile. */
  placesCount?: number | null;
  /** Relationship with the viewed user (ignored on the own profile). */
  relation: FollowRelation;
  /** A relationship action is in flight (or the relationship is still loading). */
  followBusy: boolean;
  completion: { hasPhoto: boolean; hasBio: boolean; hasPost: boolean };
  completionVisible: boolean;
  onEditProfile: () => void;
  onDismissCompletion: () => void;
  onOpenFollowers: () => void;
  onOpenFollowing: () => void;
  onFollow: () => void;
  onUnfollow: () => void;
  onCancelRequest: () => void;
  onUnblock: () => void;
  onMessage: () => void;
  theme: ProfileTheme;
}

function formatCount(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value);
}

function IconButton({ label, onPress, children, testID }: { label: string; onPress: () => void; children: React.ReactNode; testID?: string }) {
  return (
    <TouchableOpacity testID={testID} style={styles.iconButton} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
      {children}
    </TouchableOpacity>
  );
}

/** One figure of the row beside the avatar: the number over its label. Tappable only when it has an action. */
function Stat({ label, value, onPress, testID }: { label: string; value: number; onPress?: () => void; testID?: string }) {
  const c = useThemeColors();
  return (
    <Pressable
      testID={testID}
      style={styles.stat}
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={`${label}: ${formatCount(value)}`}
    >
      <Text style={[styles.statValue, { color: c.textPrimary }]}>{formatCount(value)}</Text>
      <Text style={[styles.statLabel, { color: c.textSecondary }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * Fixed top bar (username on the left; share + settings on the own profile, the ⋯ menu on someone else's), rendered
 * as a sibling ABOVE the screen's ScrollView so it never scrolls. It respects `topInset` itself.
 */
export function ProfileTopBar({
  isOwnProfile, showBack = false, hideBack = false, username, topInset, onBack, onOpenMenu, onShare, onSettings,
}: ProfileTopBarProps) {
  const { t } = useTranslation('profile');
  const c = useThemeColors();
  const back = (
    <IconButton label={t('header.backA11y')} onPress={onBack}><IconArrowLeft size={24} color={c.textPrimary} /></IconButton>
  );
  return (
    <View style={[styles.topBarRoot, { backgroundColor: c.bgBase, paddingTop: topInset }]}>
      <View style={styles.topBar}>
        {isOwnProfile ? (showBack && !hideBack ? back : null) : hideBack ? null : back}
        <Text style={[styles.topUsername, { color: c.textPrimary }]} numberOfLines={1}>@{username}</Text>
        <View style={styles.topActions}>
          {isOwnProfile ? (
            <>
              <IconButton label={t('header.shareA11y')} onPress={onShare}><IconShare3 size={22} color={c.textPrimary} /></IconButton>
              <IconButton testID="profile-open-settings" label={t('header.settingsA11y')} onPress={onSettings}><IconSettings size={22} color={c.textPrimary} /></IconButton>
            </>
          ) : (
            <IconButton label={t('header.moreA11y')} onPress={onOpenMenu}><IconDots size={25} color={c.textPrimary} /></IconButton>
          )}
        </View>
      </View>
    </View>
  );
}

export default function ProfileHeader({
  isOwnProfile, displayName, username, avatarUrl, bio, city, isVerified, postCount,
  followerCount, followingCount, relation, followBusy, completion,
  completionVisible, onEditProfile, onDismissCompletion, onOpenFollowers, onOpenFollowing,
  onFollow, onUnfollow, onCancelRequest, onUnblock, onMessage, theme,
}: ProfileHeaderProps) {
  const { t } = useTranslation('profile');
  const c = useThemeColors();
  const [bioExpanded, setBioExpanded] = useState(false);
  const [bioOverflows, setBioOverflows] = useState(false);
  const name = displayName?.trim() || username;
  const initials = getInitials(name, 2);
  const completedCount = Object.values(completion).filter(Boolean).length;
  const followLabel = relation === 'requested' ? t('header.requested') : relation === 'following' ? t('header.following') : t('header.follow');
  const followOutlined = relation === 'requested' || relation === 'following';
  const followAction = relation === 'requested' ? onCancelRequest : relation === 'following' ? onUnfollow : onFollow;
  const onAccent = readableOn(theme.accent);
  const bioText = bio?.trim() ?? '';
  const outlined = [styles.button, styles.outlinedButton, { backgroundColor: c.bgSurface, borderColor: c.borderSubtle }];
  const primary = [styles.button, { backgroundColor: theme.accent }];

  return (
    <View style={[styles.container, { backgroundColor: c.bgBase }]}>
      {/* Gradient: the theme's two colours, fading into the page at the bottom */}
      <LinearGradient
        pointerEvents="none"
        colors={[theme.headerGradient[0], theme.headerGradient[1], c.bgBase]}
        locations={[0, 0.55, 1]}
        style={styles.gradient}
      />

      <View style={styles.topRow}>
        <View style={[styles.avatarBorder, { backgroundColor: c.bgBase }]}>
          <View style={[styles.avatarRing, { borderColor: theme.accent }]}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatar} resizeMode="cover" accessibilityLabel={t('header.avatarA11y', { name })} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: c.bgSurface }]}>
                <Text style={[styles.avatarInitials, { color: c.textPrimary }]}>{initials}</Text>
              </View>
            )}
          </View>
        </View>
        <View style={styles.statsRow}>
          <Stat label={t('header.posts')} value={postCount} />
          <Stat label={t('header.followers')} value={followerCount} onPress={onOpenFollowers} />
          <Stat label={t('header.following')} value={followingCount} onPress={onOpenFollowing} />
        </View>
      </View>

      <View style={styles.identity}>
        <View style={styles.nameRow}>
          <Text style={[styles.displayName, { color: c.textPrimary }]} numberOfLines={1}>{name}</Text>
          {isVerified ? <IconCircleCheckFilled size={20} color={theme.accent} /> : null}
          {isOwnProfile ? (
            <Pressable
              testID="profile-edit"
              style={[styles.editChip, { backgroundColor: c.bgSurface, borderColor: c.borderSubtle }]}
              onPress={onEditProfile}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('header.editProfile')}
            >
              <IconPencil size={13} color={c.textPrimary} />
              <Text style={[styles.editChipLabel, { color: c.textPrimary }]} numberOfLines={1}>{t('header.edit')}</Text>
            </Pressable>
          ) : null}
        </View>
        {bioText ? (
          <>
            <Text
              style={[styles.bio, { color: c.textPrimary }]}
              numberOfLines={bioExpanded ? undefined : BIO_MAX_LINES}
              onTextLayout={(event) => { if (!bioExpanded) setBioOverflows(event.nativeEvent.lines.length > BIO_MAX_LINES); }}
            >
              {bioText}
            </Text>
            {bioOverflows || bioExpanded ? (
              <TouchableOpacity onPress={() => setBioExpanded((value) => !value)} accessibilityRole="button" hitSlop={8}>
                <Text style={[styles.bioMore, { color: c.brandText }]}>{bioExpanded ? t('header.bioLess') : t('header.bioMore')}</Text>
              </TouchableOpacity>
            ) : null}
          </>
        ) : isOwnProfile ? (
          <TouchableOpacity onPress={onEditProfile} accessibilityRole="button" hitSlop={8}>
            <Text style={[styles.addBio, { color: c.brandText }]}>{t('header.addBio')}</Text>
          </TouchableOpacity>
        ) : null}
        {city?.trim() ? (
          <View style={styles.cityRow}><IconMapPin size={16} color={c.textSecondary} /><Text style={[styles.city, { color: c.textSecondary }]}>{city.trim()}</Text></View>
        ) : null}
      </View>

      {isOwnProfile && completionVisible && completedCount < 3 ? (
        <View style={[styles.completionStrip, { borderColor: c.borderSubtle, backgroundColor: c.bgSurface }]}>
          <View style={styles.completionCopy}>
            <Text style={[styles.completionSummary, { color: c.textPrimary }]} numberOfLines={1}>
              {t('completion.summary', { count: completedCount })}
            </Text>
            <View style={[styles.progressTrack, { backgroundColor: c.borderSubtle }]}>
              <View style={[styles.progressFill, { backgroundColor: theme.accent, width: `${(completedCount / 3) * 100}%` }]} />
            </View>
          </View>
          <Pressable style={styles.completionDismiss} onPress={onDismissCompletion} accessibilityRole="button" accessibilityLabel={t('completion.dismissA11y')}>
            <IconX size={18} color={c.textSecondary} />
          </Pressable>
        </View>
      ) : null}

      {isOwnProfile ? null : (
        <View style={styles.actionRow}>
          {relation === 'blockedMe' ? (
            <Text style={[styles.blockedNotice, { color: c.textSecondary }]}>{t('header.blockedMe')}</Text>
          ) : relation === 'blockedByMe' ? (
            <TouchableOpacity style={outlined} onPress={onUnblock} disabled={followBusy} accessibilityRole="button">
              {followBusy ? <Spinner color={c.textPrimary} /> : <Text style={[styles.buttonLabel, { color: c.textPrimary }]}>{t('header.unblock')}</Text>}
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity testID="profile-follow" style={followOutlined ? outlined : primary} onPress={followAction} disabled={followBusy} accessibilityRole="button">
                {followBusy ? <Spinner color={followOutlined ? c.textPrimary : onAccent} /> : <Text style={[styles.buttonLabel, { color: followOutlined ? c.textPrimary : onAccent }]}>{followLabel}</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={outlined} onPress={onMessage} accessibilityRole="button">
                <IconMessage size={18} color={c.textPrimary} />
                <Text style={[styles.buttonLabel, { color: c.textPrimary }]}>{t('header.message')}</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%' },
  gradient: { position: 'absolute', top: 0, left: 0, right: 0, height: HEADER_GRADIENT_HEIGHT },
  topBarRoot: { width: '100%' },
  topBar: { height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10 },
  topUsername: { flex: 1, paddingLeft: 6, fontSize: 17, fontWeight: '800' },
  topActions: { marginLeft: 'auto', flexDirection: 'row' },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  // Avatar + figures in one row. The avatar's centre sits at AVATAR_CENTER_Y: the row starts half its outer size above.
  topRow: { flexDirection: 'row', alignItems: 'center', marginTop: AVATAR_CENTER_Y - AVATAR_OUTER / 2, paddingLeft: 16, paddingRight: 12 },
  avatarBorder: {
    width: AVATAR_OUTER,
    height: AVATAR_OUTER,
    borderRadius: AVATAR_OUTER / 2,
    padding: AVATAR_BORDER,
  },
  avatarRing: {
    width: AVATAR_SIZE + AVATAR_RING * 2,
    height: AVATAR_SIZE + AVATAR_RING * 2,
    borderRadius: (AVATAR_SIZE + AVATAR_RING * 2) / 2,
    borderWidth: AVATAR_RING,
    overflow: 'hidden',
  },
  avatar: { width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_SIZE / 2 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarInitials: { fontSize: 28, fontWeight: '800' },
  statsRow: { flex: 1, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', alignSelf: 'flex-end', marginBottom: 8 },
  stat: { minHeight: 44, minWidth: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  statValue: { fontSize: 20, lineHeight: 24, fontWeight: '800' },
  statLabel: { fontSize: 12, lineHeight: 16, fontWeight: '600', textAlign: 'center' },
  identity: { alignItems: 'flex-start', paddingHorizontal: 16, paddingTop: 4 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'stretch' },
  displayName: { flexShrink: 1, fontSize: 20, lineHeight: 26, fontWeight: '800' },
  editChip: { marginLeft: 'auto', height: 32, borderRadius: 16, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12 },
  editChipLabel: { fontSize: 13, fontWeight: '700' },
  bio: { marginTop: 6, fontSize: 15, lineHeight: 21, textAlign: 'left' },
  bioMore: { marginTop: 2, fontSize: 14, fontWeight: '700' },
  addBio: { marginTop: 6, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  cityRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 },
  city: { fontSize: 14, lineHeight: 19 },
  actionRow: { flexDirection: 'row', gap: 10, marginHorizontal: 16, marginTop: 12 },
  button: { flex: 1, height: 46, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  outlinedButton: { borderWidth: 1 },
  buttonLabel: { fontSize: 15, fontWeight: '700' },
  blockedNotice: { flex: 1, fontSize: 14, lineHeight: 20, paddingVertical: 12, textAlign: 'center' },
  completionStrip: { height: 44, marginHorizontal: 16, marginTop: 8, borderWidth: 1, borderRadius: 12, flexDirection: 'row', alignItems: 'center', paddingLeft: 12 },
  completionCopy: { flex: 1, gap: 4 },
  completionSummary: { fontSize: 13, lineHeight: 16, fontWeight: '700' },
  completionDismiss: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  progressTrack: { height: 3, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: 3, borderRadius: 2 },
});
