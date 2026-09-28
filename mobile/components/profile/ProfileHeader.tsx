import React from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import {
  IconArrowLeft, IconCheck, IconCircleCheckFilled, IconCircleDashed, IconDots,
  IconCamera, IconMapPin, IconMessage, IconPencil, IconPlus, IconSettings, IconShare3,
} from '@tabler/icons-react-native';

import type { ProfileTheme } from '../../theme/profileThemes';

export interface ProfilePlace { businessId: string; businessName: string }

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
  placeCount: number;
  frequentPlaces: ProfilePlace[];
  commonPlaces: ProfilePlace[];
  isFollowing: boolean;
  isPending: boolean;
  followLoading: boolean;
  completion: { hasPhoto: boolean; hasBio: boolean; hasCheckIn: boolean };
  topInset: number;
  onBack: () => void;
  onOpenMenu: () => void;
  onShare: () => void;
  onSettings: () => void;
  onEditProfile: () => void;
  onCreatePost: () => void;
  onOpenMap: () => void;
  onOpenPlaces: () => void;
  onFollow: () => void;
  onUnfollow: () => void;
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
      <Text style={[styles.statLabel, { color: theme.bodyTextSecondary }]}>{label}</Text>
    </>
  );
  return onPress ? (
    <Pressable style={styles.statItem} onPress={onPress} accessibilityRole="button">{content}</Pressable>
  ) : <View style={styles.statItem}>{content}</View>;
}

function CompletionStep({ complete, label, onPress, theme }: { complete: boolean; label: string; onPress: () => void; theme: ProfileTheme }) {
  const Icon = complete ? IconCheck : IconCircleDashed;
  return (
    <Pressable style={styles.completionStep} onPress={onPress} disabled={complete} accessibilityRole={complete ? 'text' : 'button'}>
      <Icon size={19} color={complete ? theme.tabActive : theme.bodyTextSecondary} />
      <Text style={[styles.completionStepLabel, { color: complete ? theme.bodyTextSecondary : theme.bodyText }]}>{label}</Text>
    </Pressable>
  );
}

export default function ProfileHeader({
  isOwnProfile, displayName, username, avatarUrl, coverUrl, bio, city, isVerified, postCount,
  followerCount, followingCount, placeCount, frequentPlaces, commonPlaces,
  isFollowing, isPending, followLoading, completion, topInset, onBack,
  onOpenMenu, onShare, onSettings, onEditProfile, onCreatePost, onOpenMap, onOpenPlaces,
  onFollow, onUnfollow, onMessage, theme,
}: ProfileHeaderProps) {
  const { t } = useTranslation('profile');
  const name = displayName?.trim() || username;
  const initials = name.split(/\s+/).slice(0, 2).map((part) => part.charAt(0)).join('').toUpperCase();
  const completedCount = Object.values(completion).filter(Boolean).length;
  const extraFrequent = Math.max(0, placeCount - frequentPlaces.length);
  const followLabel = isPending ? t('header.requested') : isFollowing ? t('header.following') : t('header.follow');

  return (
    <View style={[styles.container, { backgroundColor: theme.statsBg, paddingTop: topInset }]}>
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

      <View style={styles.avatarPositioner}>
        <View style={[styles.avatarRing, { backgroundColor: theme.statsBg }]}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={[styles.avatar, { backgroundColor: theme.coverBg }]} resizeMode="cover" accessibilityLabel={t('header.avatarA11y', { name })} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: theme.coverBg }]}><Text style={[styles.avatarInitials, { color: theme.nameColor }]}>{initials}</Text></View>
          )}
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

      {frequentPlaces.length > 0 ? (
        <View style={styles.frequentRow}>
          <View style={styles.frequentLabel}><IconMapPin size={17} color={theme.bodyTextSecondary} /><Text style={[styles.eyebrow, { color: theme.bodyTextSecondary }]}>{t('header.frequents')}</Text></View>
          <View style={styles.chips}>
            {frequentPlaces.map((place) => (
              <View key={place.businessId} style={[styles.chip, { borderColor: theme.statsBorder, backgroundColor: theme.btn2Bg }]}>
                <Text style={[styles.chipText, { color: theme.bodyText }]} numberOfLines={1}>{place.businessName}</Text>
              </View>
            ))}
            {extraFrequent > 0 ? <View style={[styles.chip, { borderColor: theme.statsBorder, backgroundColor: theme.btn2Bg }]}><Text style={[styles.chipText, { color: theme.bodyText }]}>+{extraFrequent}</Text></View> : null}
          </View>
        </View>
      ) : null}

      {!isOwnProfile && commonPlaces.length > 0 ? (
        <View style={[styles.commonCard, { borderColor: theme.statsBorder, backgroundColor: theme.btn2Bg }]}>
          <View style={styles.commonTitleRow}><IconMapPin size={18} color={theme.tabActive} /><Text style={[styles.eyebrow, { color: theme.bodyTextSecondary }]}>{t('header.inCommon')}</Text></View>
          <Text style={[styles.commonText, { color: theme.bodyText }]}>{t('header.commonPlace', { place: commonPlaces[0].businessName })}{commonPlaces.length > 1 ? ` ${t('header.commonMore', { count: commonPlaces.length - 1 })}` : ''}</Text>
        </View>
      ) : null}

      {isOwnProfile && completedCount < 3 ? (
        <View style={[styles.completionCard, { borderColor: theme.statsBorder, backgroundColor: theme.btn2Bg }]}>
          <View style={styles.completionHeader}><Text style={[styles.completionTitle, { color: theme.bodyText }]}>{t('completion.title')}</Text><Text style={[styles.completionCount, { color: theme.bodyTextSecondary }]}>{t('completion.progress', { count: completedCount })}</Text></View>
          <View style={[styles.progressTrack, { backgroundColor: theme.statsBorder }]}>
            <View style={[styles.progressFill, { backgroundColor: theme.tabActive, width: `${(completedCount / 3) * 100}%` }]} />
          </View>
          <CompletionStep complete={completion.hasPhoto} label={t('completion.photo')} onPress={onEditProfile} theme={theme} />
          <CompletionStep complete={completion.hasBio} label={t('completion.bio')} onPress={onEditProfile} theme={theme} />
          <CompletionStep complete={completion.hasCheckIn} label={t('completion.checkIn')} onPress={onOpenMap} theme={theme} />
        </View>
      ) : null}

      <View style={[styles.statsCard, { borderColor: theme.statsBorder, backgroundColor: theme.btn2Bg }]}>
        <StatItem label={t('header.posts')} value={postCount} theme={theme} />
        <StatItem label={t('header.followers')} value={followerCount} theme={theme} />
        <StatItem label={t('header.following')} value={followingCount} theme={theme} />
        <StatItem label={t('header.places')} value={placeCount} theme={theme} onPress={onOpenPlaces} />
      </View>

      <View style={styles.actionRow}>
        {isOwnProfile ? (
          <>
            <TouchableOpacity style={[styles.primaryButton, { backgroundColor: theme.btn1Bg }]} onPress={onEditProfile} accessibilityRole="button"><IconPencil size={18} color={theme.btn1Color} /><Text style={[styles.buttonLabel, { color: theme.btn1Color }]}>{t('header.editProfile')}</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.secondaryButton, { backgroundColor: theme.btn2Bg, borderColor: theme.statsBorder }]} onPress={onShare} accessibilityRole="button"><IconShare3 size={18} color={theme.btn2Color} /><Text style={[styles.buttonLabel, { color: theme.btn2Color }]}>{t('header.shareProfile')}</Text></TouchableOpacity>
          </>
        ) : (
          <>
            <TouchableOpacity style={[styles.primaryButton, { backgroundColor: isFollowing || isPending ? theme.btn2Bg : theme.btn1Bg }, (isFollowing || isPending) && { borderColor: theme.statsBorder, borderWidth: 1 }]} onPress={isFollowing ? onUnfollow : onFollow} disabled={followLoading || isPending} accessibilityRole="button">
              {followLoading ? <ActivityIndicator color={isFollowing ? theme.btn2Color : theme.btn1Color} /> : <Text style={[styles.buttonLabel, { color: isFollowing || isPending ? theme.btn2Color : theme.btn1Color }]}>{followLabel}</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={[styles.secondaryButton, { backgroundColor: theme.btn2Bg, borderColor: theme.statsBorder }]} onPress={onMessage} accessibilityRole="button"><IconMessage size={18} color={theme.btn2Color} /><Text style={[styles.buttonLabel, { color: theme.btn2Color }]}>{t('header.message')}</Text></TouchableOpacity>
          </>
        )}
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%' },
  topBar: { height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10 },
  topUsername: { flex: 1, paddingLeft: 6, fontSize: 17, fontWeight: '800' },
  otherTopUsername: { position: 'absolute', left: 64, right: 64, bottom: 16, textAlign: 'center', fontSize: 16, fontWeight: '800' },
  topActions: { marginLeft: 'auto', flexDirection: 'row' },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  coverFrame: { height: 120, marginHorizontal: 16, borderRadius: 20, overflow: 'hidden' },
  coverCamera: { position: 'absolute', right: 10, bottom: 10, width: 44, height: 44, borderRadius: 22, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  avatarPositioner: { height: 104, marginTop: -48, paddingLeft: 28 },
  avatarRing: { width: 104, height: 104, borderRadius: 52, padding: 4 },
  avatar: { width: 96, height: 96, borderRadius: 48 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarInitials: { fontSize: 30, fontWeight: '800' },
  identity: { paddingHorizontal: 20, paddingTop: 8 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  displayName: { maxWidth: '90%', fontSize: 22, lineHeight: 28, fontWeight: '800' },
  username: { marginTop: 1, fontSize: 15, lineHeight: 20 },
  bio: { marginTop: 10, fontSize: 15, lineHeight: 21 },
  addBio: { marginTop: 9, fontSize: 15, lineHeight: 21, fontWeight: '700' },
  cityRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 },
  city: { fontSize: 14, lineHeight: 19 },
  frequentRow: { paddingHorizontal: 20, paddingTop: 16, gap: 9 },
  frequentLabel: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  eyebrow: { fontSize: 11, lineHeight: 14, fontWeight: '800', letterSpacing: 0.7, textTransform: 'uppercase' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: { maxWidth: 160, minHeight: 30, justifyContent: 'center', borderWidth: 1, borderRadius: 15, paddingHorizontal: 11 },
  chipText: { fontSize: 12, fontWeight: '600' },
  commonCard: { marginHorizontal: 16, marginTop: 16, borderWidth: 1, borderRadius: 16, padding: 14 },
  commonTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 7 },
  commonText: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  statsCard: { marginHorizontal: 16, marginTop: 18, flexDirection: 'row', borderWidth: 1, borderRadius: 16, paddingVertical: 13 },
  statItem: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', gap: 2 },
  statValue: { fontSize: 18, lineHeight: 22, fontWeight: '800' },
  statLabel: { fontSize: 10, lineHeight: 14, fontWeight: '600' },
  actionRow: { flexDirection: 'row', gap: 9, marginHorizontal: 16, marginTop: 12 },
  primaryButton: { flex: 1, height: 44, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  secondaryButton: { flex: 1, height: 44, borderRadius: 12, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  buttonLabel: { fontSize: 14, fontWeight: '700' },
  completionCard: { marginHorizontal: 16, marginTop: 16, borderWidth: 1, borderRadius: 18, padding: 15 },
  completionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 },
  completionTitle: { fontSize: 16, fontWeight: '800' },
  completionCount: { fontSize: 12, fontWeight: '700' },
  progressTrack: { height: 4, borderRadius: 2, overflow: 'hidden', marginBottom: 8 },
  progressFill: { height: 4, borderRadius: 2 },
  completionStep: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 9 },
  completionStepLabel: { flex: 1, fontSize: 14, fontWeight: '600' },
});
