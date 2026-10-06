import React from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import {
  IconArrowLeft, IconCircleCheckFilled, IconDots, IconX,
  IconCamera, IconMapPin, IconMessage, IconPencil, IconPlus, IconSettings, IconShare3,
} from '@tabler/icons-react-native';

import type { ProfileTheme } from '../../theme/profileThemes';
import type { FollowRelation } from '../../hooks/useFollowSystem';
import { getInitials } from '../../utils/initials';

export interface ProfileTopBarProps {
  isOwnProfile: boolean;
  username: string;
  topInset: number;
  onBack: () => void;
  onOpenMenu: () => void;
  onShare: () => void;
  onSettings: () => void;
  onCreatePost: () => void;
  theme: ProfileTheme;
}

export interface ProfileHeaderProps {
  isOwnProfile: boolean;
  displayName: string | null;
  username: string;
  avatarUrl: string | null;
  coverUrl: string | null;
  bio: string | null;
  city: string | null;
  isVerified: boolean;
  postCount: number;
  followerCount: number;
  followingCount: number;
  /** Relationship with the viewed user (ignored on the own profile). */
  relation: FollowRelation;
  /** A relationship action is in flight (or the relationship is still loading). */
  followBusy: boolean;
  completion: { hasPhoto: boolean; hasBio: boolean; hasPost: boolean };
  completionVisible: boolean;
  onEditProfile: () => void;
  onShare: () => void;
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

function IconButton({ label, onPress, children }: { label: string; onPress: () => void; children: React.ReactNode }) {
  return (
    <TouchableOpacity style={styles.iconButton} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
      {children}
    </TouchableOpacity>
  );
}

function StatItem({ label, value, theme, onPress }: { label: string; value: number; theme: ProfileTheme; onPress?: () => void }) {
  const content = (
    <>
      <Text style={[styles.statValue, { color: theme.bodyText }]}>{formatCount(value)}</Text>
      <Text
        style={[styles.statLabel, { color: theme.bodyTextSecondary }]}
        numberOfLines={2}
      >
        {label}
      </Text>
    </>
  );
  return onPress ? (
    <Pressable style={styles.statItem} onPress={onPress} accessibilityRole="button">{content}</Pressable>
  ) : <View style={styles.statItem}>{content}</View>;
}

/**
 * Fixed profile top bar (username / +/share/settings or back/more), rendered as
 * a sibling ABOVE the screen's ScrollView so it never scrolls — it respects
 * `topInset` itself, and everything else (cover, avatar, stats...) scrolls
 * underneath it. Previously this row lived inside the scrolling ProfileHeader,
 * so scrolling could pass the avatar/cover behind the status bar clock/battery.
 */
export function ProfileTopBar({
  isOwnProfile, username, topInset, onBack, onOpenMenu, onShare, onSettings, onCreatePost, theme,
}: ProfileTopBarProps) {
  const { t } = useTranslation('profile');
  return (
    <View style={[styles.topBarRoot, { backgroundColor: theme.statsBg, paddingTop: topInset }]}>
      <View style={styles.topBar}>
        {isOwnProfile ? (
          <Text style={[styles.topUsername, { color: theme.bodyText }]} numberOfLines={1}>@{username}</Text>
        ) : (
          <IconButton label={t('header.backA11y')} onPress={onBack}><IconArrowLeft size={24} color={theme.bodyText} /></IconButton>
        )}
        {!isOwnProfile ? <Text style={[styles.otherTopUsername, { color: theme.bodyText }]} numberOfLines={1}>@{username}</Text> : null}
        <View style={styles.topActions}>
          {isOwnProfile ? (
            <>
              <IconButton label={t('header.createPostA11y')} onPress={onCreatePost}><IconPlus size={24} color={theme.bodyText} /></IconButton>
              <IconButton label={t('header.shareA11y')} onPress={onShare}><IconShare3 size={22} color={theme.bodyText} /></IconButton>
              <IconButton label={t('header.settingsA11y')} onPress={onSettings}><IconSettings size={22} color={theme.bodyText} /></IconButton>
            </>
          ) : (
            <IconButton label={t('header.moreA11y')} onPress={onOpenMenu}><IconDots size={25} color={theme.bodyText} /></IconButton>
          )}
        </View>
      </View>
    </View>
  );
}

export default function ProfileHeader({
  isOwnProfile, displayName, username, avatarUrl, coverUrl, bio, city, isVerified, postCount,
  followerCount, followingCount, relation, followBusy, completion,
  completionVisible, onEditProfile, onShare, onDismissCompletion, onOpenFollowers, onOpenFollowing,
  onFollow, onUnfollow, onCancelRequest, onUnblock, onMessage, theme,
}: ProfileHeaderProps) {
  const { t } = useTranslation('profile');
  const name = displayName?.trim() || username;
  const initials = getInitials(name, 2);
  const completedCount = Object.values(completion).filter(Boolean).length;
  const followLabel = relation === 'requested' ? t('header.requested') : relation === 'following' ? t('header.following') : t('header.follow');
  const followOutlined = relation === 'requested' || relation === 'following';
  const followAction = relation === 'requested' ? onCancelRequest : relation === 'following' ? onUnfollow : onFollow;

  return (
    <View style={[styles.container, { backgroundColor: theme.statsBg }]}>
      <View style={styles.coverFrame}>
        {coverUrl ? (
          <Image source={{ uri: coverUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityLabel={t('header.coverPhotoA11y', { name })} />
        ) : theme.coverGradient.length >= 2 ? (
          <LinearGradient colors={theme.coverGradient as [string, string, ...string[]]} style={StyleSheet.absoluteFill} />
        ) : <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.coverBg }]} />}
        {isOwnProfile ? (
          <TouchableOpacity style={[styles.coverCamera, { backgroundColor: theme.btn1Bg, borderColor: theme.statsBg }]} onPress={onEditProfile} accessibilityRole="button" accessibilityLabel={t('header.changeCoverA11y')}>
            <IconCamera size={20} color={theme.btn1Color} />
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.avatarStatsRow}>
        <View style={[styles.avatarRing, { backgroundColor: theme.statsBg }]}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={[styles.avatar, { backgroundColor: theme.coverBg }]} resizeMode="cover" accessibilityLabel={t('header.avatarA11y', { name })} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: theme.coverBg }]}><Text style={[styles.avatarInitials, { color: theme.nameColor }]}>{initials}</Text></View>
          )}
        </View>
        <View style={styles.inlineStats}>
          <StatItem label={t('header.posts')} value={postCount} theme={theme} />
          <StatItem label={t('header.followers')} value={followerCount} theme={theme} onPress={onOpenFollowers} />
          <StatItem label={t('header.following')} value={followingCount} theme={theme} onPress={onOpenFollowing} />
        </View>
      </View>

      <View style={styles.identity}>
        <View style={styles.nameRow}>
          <Text style={[styles.displayName, { color: theme.bodyText }]} numberOfLines={1}>{name}</Text>
          {isVerified ? <IconCircleCheckFilled size={19} color={theme.tabActive} /> : null}
        </View>
        <Text style={[styles.username, { color: theme.bodyTextSecondary }]}>@{username}</Text>
        {bio?.trim() ? (
          <Text style={[styles.bio, { color: theme.bodyText }]} numberOfLines={3}>{bio.trim()}</Text>
        ) : isOwnProfile ? (
          <TouchableOpacity onPress={onEditProfile} accessibilityRole="button"><Text style={[styles.addBio, { color: theme.tabActive }]}>{t('header.addBio')}</Text></TouchableOpacity>
        ) : null}
        {city?.trim() ? (
          <View style={styles.cityRow}><IconMapPin size={16} color={theme.bodyTextSecondary} /><Text style={[styles.city, { color: theme.bodyTextSecondary }]}>{city.trim()}</Text></View>
        ) : null}
      </View>

      {isOwnProfile && completionVisible && completedCount < 3 ? (
        <View style={[styles.completionStrip, { borderColor: theme.statsBorder, backgroundColor: theme.btn2Bg }]}>
          <View style={styles.completionCopy}>
            <Text style={[styles.completionSummary, { color: theme.bodyText }]} numberOfLines={1}>
              {t('completion.summary', { count: completedCount })}
            </Text>
            <View style={[styles.progressTrack, { backgroundColor: theme.statsBorder }]}>
              <View style={[styles.progressFill, { backgroundColor: theme.tabActive, width: `${(completedCount / 3) * 100}%` }]} />
            </View>
          </View>
          <Pressable
            style={styles.completionDismiss}
            onPress={onDismissCompletion}
            accessibilityRole="button"
            accessibilityLabel={t('completion.dismissA11y')}
          >
            <IconX size={18} color={theme.bodyTextSecondary} />
          </Pressable>
        </View>
      ) : null}

      <View style={styles.actionRow}>
        {isOwnProfile ? (
          <>
            <TouchableOpacity style={[styles.ownActionButton, { backgroundColor: theme.btn2Bg, borderColor: theme.statsBorder }]} onPress={onEditProfile} accessibilityRole="button"><IconPencil size={17} color={theme.btn2Color} /><Text style={[styles.buttonLabel, { color: theme.btn2Color }]}>{t('header.editProfile')}</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.ownActionButton, { backgroundColor: theme.btn2Bg, borderColor: theme.statsBorder }]} onPress={onShare} accessibilityRole="button"><IconShare3 size={17} color={theme.btn2Color} /><Text style={[styles.buttonLabel, { color: theme.btn2Color }]}>{t('header.shareProfile')}</Text></TouchableOpacity>
          </>
        ) : (
          relation === 'blockedMe' ? (
            <Text style={[styles.blockedNotice, { color: theme.bodyTextSecondary }]}>{t('header.blockedMe')}</Text>
          ) : relation === 'blockedByMe' ? (
            <TouchableOpacity style={[styles.primaryButton, { backgroundColor: theme.btn2Bg, borderColor: theme.statsBorder, borderWidth: 1 }]} onPress={onUnblock} disabled={followBusy} accessibilityRole="button">
              {followBusy ? <ActivityIndicator color={theme.btn2Color} /> : <Text style={[styles.buttonLabel, { color: theme.btn2Color }]}>{t('header.unblock')}</Text>}
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity style={[styles.primaryButton, { backgroundColor: followOutlined ? theme.btn2Bg : theme.btn1Bg }, followOutlined && { borderColor: theme.statsBorder, borderWidth: 1 }]} onPress={followAction} disabled={followBusy} accessibilityRole="button">
                {followBusy ? <ActivityIndicator color={followOutlined ? theme.btn2Color : theme.btn1Color} /> : <Text style={[styles.buttonLabel, { color: followOutlined ? theme.btn2Color : theme.btn1Color }]}>{followLabel}</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={[styles.secondaryButton, { backgroundColor: theme.btn2Bg, borderColor: theme.statsBorder }]} onPress={onMessage} accessibilityRole="button"><IconMessage size={18} color={theme.btn2Color} /><Text style={[styles.buttonLabel, { color: theme.btn2Color }]}>{t('header.message')}</Text></TouchableOpacity>
            </>
          )
        )}
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%' },
  blockedNotice: { flex: 1, fontSize: 14, lineHeight: 20, paddingVertical: 12, textAlign: 'center' },
  topBarRoot: { width: '100%' },
  topBar: { height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10 },
  topUsername: { flex: 1, paddingLeft: 6, fontSize: 17, fontWeight: '800' },
  otherTopUsername: { position: 'absolute', left: 64, right: 64, bottom: 16, textAlign: 'center', fontSize: 16, fontWeight: '800' },
  topActions: { marginLeft: 'auto', flexDirection: 'row' },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  coverFrame: { height: 120, marginHorizontal: 16, borderRadius: 20, overflow: 'hidden' },
  coverCamera: { position: 'absolute', right: 10, bottom: 10, width: 44, height: 44, borderRadius: 22, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  avatarStatsRow: { minHeight: 104, marginTop: -48, paddingLeft: 28, paddingRight: 12, flexDirection: 'row', alignItems: 'flex-end' },
  avatarRing: { width: 104, height: 104, borderRadius: 52, padding: 4 },
  avatar: { width: 96, height: 96, borderRadius: 48 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarInitials: { fontSize: 30, fontWeight: '800' },
  inlineStats: { flex: 1, height: 56, marginLeft: 6, flexDirection: 'row', alignItems: 'stretch' },
  identity: { paddingHorizontal: 20, paddingTop: 8 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  displayName: { maxWidth: '90%', fontSize: 22, lineHeight: 28, fontWeight: '800' },
  username: { marginTop: 1, fontSize: 15, lineHeight: 20 },
  bio: { marginTop: 10, fontSize: 15, lineHeight: 21 },
  addBio: { marginTop: 9, fontSize: 15, lineHeight: 21, fontWeight: '700' },
  cityRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 },
  city: { fontSize: 14, lineHeight: 19 },
  statItem: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', gap: 2, paddingHorizontal: 2 },
  statValue: { fontSize: 18, lineHeight: 22, fontWeight: '700' },
  statLabel: { minHeight: 28, fontSize: 12, lineHeight: 14, fontWeight: '600', textAlign: 'center' },
  actionRow: { flexDirection: 'row', gap: 9, marginHorizontal: 16, marginTop: 12 },
  ownActionButton: { flex: 1, height: 36, borderRadius: 10, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  primaryButton: { flex: 1, height: 44, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  secondaryButton: { flex: 1, height: 44, borderRadius: 12, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  buttonLabel: { fontSize: 14, fontWeight: '700' },
  completionStrip: { height: 44, marginHorizontal: 16, marginTop: 12, borderWidth: 1, borderRadius: 12, flexDirection: 'row', alignItems: 'center', paddingLeft: 12 },
  completionCopy: { flex: 1, gap: 4 },
  completionSummary: { fontSize: 13, lineHeight: 16, fontWeight: '700' },
  completionDismiss: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  progressTrack: { height: 3, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: 3, borderRadius: 2 },
});
