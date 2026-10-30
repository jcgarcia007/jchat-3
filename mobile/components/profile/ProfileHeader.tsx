/**
 * JChat 3.0 — ProfileHeader ("Liquid Glass": canvas "JChat · Perfil", LG1 / LG2 / LG3)
 *
 * A full-bleed cover (the profile theme's gradient, up to the top edge of the screen, the status bar included) with two round glass buttons over it
 * (share and settings on my profile; back and ⋯ on someone else's), and over its lower edge a content sheet with rounded top corners. The 92 pt avatar
 * straddles the sheet's edge; the name (26 pt) and @username sit to its right. Under them: the bio (or "+ Add a bio" on my profile), the city (only when
 * the owner shows it), two capsules on my profile ("Edit profile" in glass, "+ Post" in brand) or Follow / Message on someone else's.
 * There are no counters (posts, followers, following): the lists live in Edit profile ("Your network") and in the ⋯ menu of other profiles.
 *
 * `ProfileCompactBar` takes over from the cover buttons once the big name has scrolled out of sight (see utils/profileHeaderState.ts).
 *
 * The profile theme gives the cover gradient, the readable colour of the cover's icons (nameColor) and the accent of the follow button. Page, texts and
 * borders come from useThemeColors(); the glass from the glass tokens.
 *
 * PRIVACY (decision A.1): nothing here shows where a person is right now.
 */

import React, { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import {
  IconArrowLeft, IconCircleCheckFilled, IconDots, IconMapPin, IconMessage, IconPlus, IconSettings, IconShare3, IconX,
} from '@tabler/icons-react-native';

import { Spinner } from '../common/Spinner';
import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import { readableOn, type ProfileTheme } from '../../theme/profileThemes';
import type { FollowRelation } from '../../hooks/useFollowSystem';
import { getInitials } from '../../utils/initials';
import {
  AVATAR_BORDER, AVATAR_SIZE, BUTTONS_BELOW_INSET, COMPACT_HEIGHT, COVER_BELOW_INSET, NAME_LEFT, NAME_TOP, SHEET_OVERLAP, SHEET_RADIUS,
} from '../../utils/profileHeaderState';
import { GlassIconButton } from './GlassIconButton';
import { GlassSurface } from './GlassSurface';

const BIO_MAX_LINES = 3;
const SIDE_MARGIN = 16;

/** What the round buttons need (cover and compact header). */
export interface ProfileChromeProps {
  isOwnProfile: boolean;
  /** Own profile opened as a stacked screen (e.g. from the chat): show the back arrow. */
  showBack?: boolean;
  /** Inside the profile sheet the sheet's own ✕ closes it: no back arrow (own or other's profile). */
  hideBack?: boolean;
  topInset: number;
  onBack: () => void;
  onOpenMenu: () => void;
  onShare: () => void;
  onSettings: () => void;
}

export interface ProfileHeaderProps extends ProfileChromeProps {
  displayName: string | null;
  username: string;
  avatarUrl: string | null;
  bio: string | null;
  /** Already filtered by the owner's "show city" choice: null / empty hides the line. */
  city: string | null;
  isVerified: boolean;
  /** Relationship with the viewed user (ignored on the own profile). */
  relation: FollowRelation;
  /** A relationship action is in flight (or the relationship is still loading). */
  followBusy: boolean;
  completion: { hasPhoto: boolean; hasBio: boolean; hasPost: boolean };
  completionVisible: boolean;
  /** Own profile: follow requests waiting for an answer (a dot on "Edit profile" while > 0). */
  pendingRequests: number;
  onEditProfile: () => void;
  /** Own profile in the Profile tab: the "+ Post" capsule (what the floating button did). Not given → no capsule. */
  onPublish?: () => void;
  onDismissCompletion: () => void;
  onFollow: () => void;
  onUnfollow: () => void;
  onCancelRequest: () => void;
  onUnblock: () => void;
  onMessage: () => void;
  theme: ProfileTheme;
}

/** Whether the back arrow shows: my profile only when it is a stacked screen; someone else's unless it is inside the sheet. */
function showsBack({ isOwnProfile, showBack, hideBack }: ProfileChromeProps): boolean {
  return isOwnProfile ? Boolean(showBack && !hideBack) : !hideBack;
}

/** The round buttons over the cover: back / share / settings on my profile, back / ⋯ on someone else's. */
function CoverButtons({ props, iconColor }: { props: ProfileChromeProps; iconColor: string }) {
  const { t } = useTranslation('profile');
  const { isOwnProfile, onBack, onOpenMenu, onShare, onSettings } = props;
  const back = showsBack(props);
  const backButton = back ? (
    <GlassIconButton label={t('header.backA11y')} onPress={onBack} testID="profile-back"><IconArrowLeft size={20} color={iconColor} strokeWidth={2} /></GlassIconButton>
  ) : null;
  const shareButton = (
    <GlassIconButton label={t('header.shareA11y')} onPress={onShare} testID="profile-share"><IconShare3 size={19} color={iconColor} strokeWidth={2} /></GlassIconButton>
  );
  return (
    <>
      <View style={styles.buttonGroup}>{backButton ?? (isOwnProfile ? shareButton : null)}</View>
      <View style={styles.buttonGroup}>
        {isOwnProfile && backButton ? shareButton : null}
        {isOwnProfile ? (
          <GlassIconButton label={t('header.settingsA11y')} onPress={onSettings} testID="profile-open-settings"><IconSettings size={19} color={iconColor} strokeWidth={2} /></GlassIconButton>
        ) : (
          <GlassIconButton label={t('header.moreA11y')} onPress={onOpenMenu} testID="profile-more"><IconDots size={22} color={iconColor} strokeWidth={2} /></GlassIconButton>
        )}
      </View>
    </>
  );
}

/**
 * The compact header, fixed at the top while the big name is out of sight: a glass pill with the avatar, the name and the @username, and the same
 * round buttons in the bar's glass. It replaces the buttons over the cover instantly (no fade: the glass's opacity is never animated).
 */
export function ProfileCompactBar(props: ProfileChromeProps & { displayName: string | null; username: string; avatarUrl: string | null }) {
  const { t } = useTranslation('profile');
  const c = useThemeColors();
  const name = props.displayName?.trim() || props.username;
  return (
    <View testID="profile-compact-bar" style={[styles.compactRow, { top: props.topInset + BUTTONS_BELOW_INSET }]} pointerEvents="box-none">
      {showsBack(props) ? (
        <GlassIconButton tone="bar" size={COMPACT_HEIGHT} label={t('header.backA11y')} onPress={props.onBack}><IconArrowLeft size={21} color={c.textPrimary} strokeWidth={2} /></GlassIconButton>
      ) : null}
      <GlassSurface variant="bar" style={styles.compactPill}>
        <View style={styles.compactPillInner}>
          {props.avatarUrl ? (
            <Image source={{ uri: props.avatarUrl }} style={styles.compactAvatar} accessible={false} />
          ) : (
            <View style={[styles.compactAvatar, styles.avatarFallback, { backgroundColor: c.bgElevated }]}>
              <Text style={[styles.compactInitials, { color: c.textPrimary }]}>{getInitials(name, 2)}</Text>
            </View>
          )}
          <View style={styles.compactNames}>
            <Text style={[styles.compactName, { color: c.textPrimary }]} numberOfLines={1}>{name}</Text>
            <Text style={[styles.compactHandle, { color: c.textSecondary }]} numberOfLines={1}>@{props.username}</Text>
          </View>
        </View>
      </GlassSurface>
      {props.isOwnProfile ? (
        <GlassIconButton tone="bar" size={COMPACT_HEIGHT} label={t('header.settingsA11y')} onPress={props.onSettings} testID="profile-open-settings-compact"><IconSettings size={20} color={c.textPrimary} strokeWidth={2} /></GlassIconButton>
      ) : (
        <GlassIconButton tone="bar" size={COMPACT_HEIGHT} label={t('header.moreA11y')} onPress={props.onOpenMenu} testID="profile-more-compact"><IconDots size={23} color={c.textPrimary} strokeWidth={2} /></GlassIconButton>
      )}
    </View>
  );
}

export default function ProfileHeader(props: ProfileHeaderProps) {
  const {
    isOwnProfile, displayName, username, avatarUrl, bio, city, isVerified, relation, followBusy, completion, completionVisible, pendingRequests,
    onEditProfile, onPublish, onDismissCompletion, onFollow, onUnfollow, onCancelRequest, onUnblock, onMessage, theme, topInset,
  } = props;
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
  // The cover's icons: the profile theme's readable colour on its cover (white or near-black, whichever contrasts).
  const coverIcon = theme.nameColor;
  const editLabel = pendingRequests > 0 ? t('header.editProfileRequestsA11y', { count: pendingRequests }) : t('header.editProfileA11y');

  return (
    <View style={styles.container}>
      <View style={{ height: topInset + COVER_BELOW_INSET }}>
        <LinearGradient
          pointerEvents="none"
          colors={[theme.coverGradient[0], theme.coverGradient[1]]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={[styles.coverButtons, { top: topInset + BUTTONS_BELOW_INSET }]} pointerEvents="box-none">
          <CoverButtons props={props} iconColor={coverIcon} />
        </View>
      </View>

      <View style={[styles.sheet, { backgroundColor: c.bgBase }]}>
        <View style={[styles.avatarBorder, { backgroundColor: c.bgBase }]}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatar} resizeMode="cover" accessibilityLabel={t('header.avatarA11y', { name })} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: c.bgSurface }]}>
              <Text style={[styles.avatarInitials, { color: c.textPrimary }]}>{initials}</Text>
            </View>
          )}
        </View>

        <View style={styles.nameBlock}>
          <View style={styles.nameRow}>
            <Text style={[styles.displayName, { color: c.textPrimary }]} numberOfLines={1}>{name}</Text>
            {isVerified ? <IconCircleCheckFilled size={20} color={theme.accent} /> : null}
          </View>
          <Text style={[styles.handle, { color: c.textSecondary }]} numberOfLines={1}>@{username}</Text>
          {!bioText && isOwnProfile ? (
            <TouchableOpacity onPress={onEditProfile} accessibilityRole="button" hitSlop={8}>
              <Text style={[styles.addBio, { color: c.brandText }]}>{t('header.addBio')}</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {bioText ? (
          <View style={styles.bioBlock}>
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
          </View>
        ) : null}
        {city?.trim() ? (
          <View style={styles.cityRow}><IconMapPin size={16} color={c.textSecondary} /><Text style={[styles.city, { color: c.textSecondary }]}>{city.trim()}</Text></View>
        ) : null}

        {isOwnProfile ? (
          <View style={styles.capsules}>
            <Pressable testID="profile-edit" style={styles.capsuleCell} onPress={onEditProfile} accessibilityRole="button" accessibilityLabel={editLabel}>
              <GlassSurface variant="sheet" style={styles.capsule}>
                <Text style={[styles.capsuleLabel, { color: c.textPrimary }]} numberOfLines={1}>{t('header.editProfile')}</Text>
              </GlassSurface>
              {pendingRequests > 0 ? <View testID="profile-requests-dot" style={[styles.requestsDot, { backgroundColor: c.danger, borderColor: c.bgBase }]} /> : null}
            </Pressable>
            {onPublish ? (
              <Pressable testID="profile-publish" style={styles.capsuleCell} onPress={onPublish} accessibilityRole="button" accessibilityLabel={t('header.createPostA11y')}>
                <View style={[styles.capsule, styles.publishCapsule, { backgroundColor: c.brandFillSoft, borderColor: c.offersBorder }]}>
                  <IconPlus size={16} color={palette.onBrand} strokeWidth={2.6} />
                  <Text style={[styles.capsuleLabel, { color: palette.onBrand }]} numberOfLines={1}>{t('header.publish')}</Text>
                </View>
              </Pressable>
            ) : null}
          </View>
        ) : null}

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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%' },
  coverButtons: { position: 'absolute', left: SIDE_MARGIN, right: SIDE_MARGIN, flexDirection: 'row', justifyContent: 'space-between' },
  buttonGroup: { flexDirection: 'row', gap: 8 },
  // The content sheet overlaps the cover and has rounded top corners; the avatar is centred on its top edge.
  sheet: { marginTop: -SHEET_OVERLAP, borderTopLeftRadius: SHEET_RADIUS, borderTopRightRadius: SHEET_RADIUS, paddingBottom: 8, minHeight: 120 },
  avatarBorder: {
    position: 'absolute', left: 20, top: -AVATAR_SIZE / 2, width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_SIZE / 2, padding: AVATAR_BORDER,
  },
  avatar: { width: AVATAR_SIZE - AVATAR_BORDER * 2, height: AVATAR_SIZE - AVATAR_BORDER * 2, borderRadius: (AVATAR_SIZE - AVATAR_BORDER * 2) / 2 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarInitials: { fontSize: 28, fontWeight: '800' },
  nameBlock: { marginLeft: NAME_LEFT, marginRight: SIDE_MARGIN, marginTop: NAME_TOP, minHeight: 70 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  displayName: { flexShrink: 1, fontSize: 26, lineHeight: 30, fontWeight: '800', letterSpacing: -0.6 },
  handle: { marginTop: 2, fontSize: 14, lineHeight: 19 },
  addBio: { marginTop: 2, fontSize: 13, lineHeight: 18, fontWeight: '700' },
  bioBlock: { marginTop: 10, marginHorizontal: 20 },
  bio: { fontSize: 15, lineHeight: 21, textAlign: 'left' },
  bioMore: { marginTop: 2, fontSize: 14, fontWeight: '700' },
  cityRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8, marginHorizontal: 20 },
  city: { fontSize: 14, lineHeight: 19 },
  capsules: { flexDirection: 'row', gap: 10, marginHorizontal: 20, marginTop: 14 },
  capsuleCell: { flex: 1, height: 44 },
  capsule: { height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  publishCapsule: { borderWidth: 1 },
  capsuleLabel: { fontSize: 15, fontWeight: '700' },
  requestsDot: { position: 'absolute', top: 2, right: 10, width: 11, height: 11, borderRadius: 6, borderWidth: 2 },
  actionRow: { flexDirection: 'row', gap: 10, marginHorizontal: 20, marginTop: 14 },
  button: { flex: 1, height: 44, borderRadius: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  outlinedButton: { borderWidth: 1 },
  buttonLabel: { fontSize: 15, fontWeight: '700' },
  blockedNotice: { flex: 1, fontSize: 14, lineHeight: 20, paddingVertical: 12, textAlign: 'center' },
  completionStrip: { height: 44, marginHorizontal: 20, marginTop: 12, borderWidth: 1, borderRadius: 12, flexDirection: 'row', alignItems: 'center', paddingLeft: 12 },
  completionCopy: { flex: 1, gap: 4 },
  completionSummary: { fontSize: 13, lineHeight: 16, fontWeight: '700' },
  completionDismiss: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  progressTrack: { height: 3, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: 3, borderRadius: 2 },
  compactRow: { position: 'absolute', left: SIDE_MARGIN, right: SIDE_MARGIN, flexDirection: 'row', alignItems: 'center', gap: 10 },
  compactPill: { flex: 1, height: COMPACT_HEIGHT, borderRadius: COMPACT_HEIGHT / 2 },
  compactPillInner: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 6, paddingRight: 12 },
  compactAvatar: { width: 36, height: 36, borderRadius: 18 },
  compactInitials: { fontSize: 13, fontWeight: '800' },
  compactNames: { flexShrink: 1, minWidth: 0 },
  compactName: { fontSize: 15, lineHeight: 18, fontWeight: '800' },
  compactHandle: { fontSize: 12, lineHeight: 15 },
});
