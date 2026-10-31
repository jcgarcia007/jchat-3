import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useColorScheme,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { AppModal } from '../../components/common/AppModal';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { ReportReasonSheet } from '../../components/report/ReportReasonSheet';
import {
  IconBan, IconFlag, IconLock, IconPhoto, IconShare3, IconStack2, IconUsers, IconX,
} from '@tabler/icons-react-native';

import type { MainStackParamList } from '../../navigation/AppNavigator';
import { useAuth } from '../../context/AuthContext';
import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import { getProfileTheme, readableOn } from '../../theme/profileThemes';
import { canViewProfile, getOwnProfilePrivacy, getPublicProfile } from '../../services/users';
import { listPendingRequests } from '../../services/follows';
import type { PublicProfileRow } from '../../services/users';
import { getUserPosts } from '../../services/posts';
import type { PostRow } from '../../services/posts';
import { getOrCreateConversation, DmGateError } from '../../services/dms';
import { blockUser } from '../../services/blocks';
import { useFollowSystem } from '../../hooks/useFollowSystem';
import ProfileHeader, { ProfileCompactBar, ProfileHeaderSkeleton } from '../../components/profile/ProfileHeader';
import { Skeleton, SkeletonGroup, useArrivalFade, useDelayedLoading } from '../../components/common/Skeleton';
import { BAR_HEIGHT } from '../../components/navigation/NotchTabBar';
import { toUserMessage } from '../../utils/errors';
import { useHomeBarInset } from '../../components/venue/HomeBarInset';
import { confirm, showAlert } from '../../utils/dialog';
import { shareContent } from '../../utils/shareContent';
import { useAppWindow } from '../../utils/appWindow';
import { parseProfilePrivacy, type ProfilePrivacyView } from '../../utils/profilePlaces';
import { isCompactHeader } from '../../utils/profileHeaderState';

// The same screen backs the Profile tab, the stacked UserProfile and the ProfileSheet over the chat.
type ProfileParams = { userId?: string } | undefined;
type ProfileRoute = RouteProp<{ UserProfile: ProfileParams; ProfileSheet: ProfileParams; Profile: ProfileParams }, 'UserProfile' | 'ProfileSheet' | 'Profile'>;

const GRID_COLUMNS = 3;
const GRID_GAP = 2;
const PROFILE_COMPLETION_DISMISSED_KEY = 'profile.completionDismissed';
/** The tab bar floats this far above the bottom inset (see NotchTabBar). */
const TAB_BAR_LIFT = 26;

/** 12 squares with the real grid's size (3 columns) and gap, drawn only once the 200 ms anti-flicker delay has passed. */
function ProfileGridSkeleton({ cellSize, showBones }: { cellSize: number; showBones: boolean }) {
  if (!showBones) return null;
  return (
    <SkeletonGroup announce={false} style={styles.postsGrid}>
      {Array.from({ length: 12 }).map((_, index) => <Skeleton key={index} width={cellSize} height={cellSize} radius={0} />)}
    </SkeletonGroup>
  );
}

function PostCell({ post, size, onPress }: { post: PostRow; size: number; onPress: () => void }) {
  const { t } = useTranslation('profile');
  const c = useThemeColors();
  const [imageFailed, setImageFailed] = useState(false);
  const media = post.media_urls?.[0];
  const hasMultiplePhotos = (post.media_urls?.length ?? 0) > 1;
  return (
    <TouchableOpacity
      testID={`post-tile-${post.id}`}
      style={[styles.postCell, { width: size, height: size, backgroundColor: c.bgSurface }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('view.openPostA11y')}
    >
      {media && !imageFailed ? (
        <Image
          source={{ uri: media }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          onError={() => setImageFailed(true)}
          accessibilityLabel={t('view.postThumbnailA11y')}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.postTextWrap, { backgroundColor: c.bgSurface }]}>
          <Text style={[styles.postText, { color: c.textPrimary }]} numberOfLines={4}>{post.caption ?? ''}</Text>
        </View>
      )}
      {hasMultiplePhotos ? (
        <View style={styles.multiPhotoBadge}>
          <IconStack2 size={15} color={palette.textPrimary} strokeWidth={2.2} />
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

function EmptyState({
  icon, title, subtitle, actionLabel, onAction, accent,
}: {
  icon: React.ReactNode; title: string; subtitle: string; actionLabel?: string; onAction?: () => void; accent: string;
}) {
  const c = useThemeColors();
  return (
    <View style={styles.emptyState}>
      {icon}
      <Text style={[styles.emptyTitle, { color: c.textPrimary }]}>{title}</Text>
      <Text style={[styles.emptySubtitle, { color: c.textSecondary }]}>{subtitle}</Text>
      {actionLabel && onAction ? (
        <TouchableOpacity style={[styles.emptyAction, { backgroundColor: accent }]} onPress={onAction} accessibilityRole="button">
          <Text style={[styles.emptyActionText, { color: readableOn(accent) }]}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function SheetRow({ icon, label, color, borderColor, onPress }: { icon?: React.ReactNode; label: string; color: string; borderColor: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.sheetRow, { borderBottomColor: borderColor }]} onPress={onPress} accessibilityRole="button">
      {icon}<Text style={[styles.sheetRowText, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function ProfileScreen({ userId }: { userId?: string } = {}) {
  const c = useThemeColors();
  const colorScheme = useColorScheme();
  const { t } = useTranslation('profile');
  const insets = useSafeAreaInsets();
  const homeBarInset = useHomeBarInset();
  const { width: windowWidth } = useAppWindow();
  const cellSize = (windowWidth - GRID_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS;
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const route = useRoute<ProfileRoute>();
  const { user: authUser } = useAuth();
  // Opened as the sheet over the chat (route ProfileSheet): the sheet draws its own ✕, handle and top gap.
  const inSheet = route.name === 'ProfileSheet';
  const routeUserId = userId ?? route.params?.userId;
  const targetId = routeUserId ?? authUser?.id ?? null;
  const isOwnProfile = !routeUserId || routeUserId === authUser?.id;

  const [profile, setProfile] = useState<PublicProfileRow | null>(null);
  const [posts, setPosts] = useState<PostRow[]>([]);
  // Own profile: follow requests waiting for an answer (a dot on "Edit profile").
  const [pendingRequests, setPendingRequests] = useState(0);
  // The compact header replaces the buttons over the cover once the big name has scrolled out of sight.
  const [compact, setCompact] = useState(false);
  const compactRef = useRef(false);
  // Own profile only: my privacy choices for this page (the city).
  const [privacy, setPrivacy] = useState<ProfilePrivacyView>(() => parseProfilePrivacy(null));
  // False for a private account I don't follow (the grid is replaced by a notice). Default true:
  // if the check itself fails, RLS still decides what the posts query returns.
  const [canViewPosts, setCanViewPosts] = useState(true);
  const [initialLoading, setInitialLoading] = useState(true);
  // The skeleton is for the FIRST load only ('silent' reloads and pull-to-refresh keep the content), and only if it lasts 200 ms.
  const showSkeleton = useDelayedLoading(initialLoading);
  const contentOpacity = useArrivalFade(initialLoading);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completionDismissed, setCompletionDismissed] = useState<boolean | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [reportVisible, setReportVisible] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const hasLoadedRef = useRef(false);

  const {
    relation, loading: relationLoading, busy: relationBusy,
    follow, unfollow, cancelFollowRequest, unblock, refresh: refreshRelation,
  } = useFollowSystem(isOwnProfile ? null : targetId);
  const blocked = relation === 'blockedByMe';
  // One of the six themes (a theme id that no longer exists is mapped by getProfileTheme). It only paints the avatar
  // ring, the primary button, the active tab and the gradient at the top.
  const theme = getProfileTheme(profile?.profile_theme_id);

  // 'initial' shows the skeleton; 'pull' is the user's own pull-to-refresh (the only time the RefreshControl may
  // spin); 'silent' re-reads in the background (coming back to the tab, a private account unlocking). Setting
  // `refreshing` for a silent reload made iOS push the content down by the spinner height and leave it there
  // until the next touch.
  const loadProfile = useCallback(async (mode: 'initial' | 'silent' | 'pull' = 'initial') => {
    if (!targetId) { setInitialLoading(false); return; }
    if (mode === 'pull') setRefreshing(true); else if (mode === 'initial') setInitialLoading(true);
    setError(null);
    try {
      const [canView, profileRow, ownPrivacy, requests] = await Promise.all([
        isOwnProfile || !authUser?.id ? Promise.resolve(true) : canViewProfile(authUser.id, targetId).catch(() => true),
        getPublicProfile(targetId),
        // My privacy choices (the city) exist only on my own profile; a failure falls back to the safe defaults.
        isOwnProfile ? getOwnProfilePrivacy(targetId).catch(() => parseProfilePrivacy(null)) : Promise.resolve(parseProfilePrivacy(null)),
        // Requests waiting for an answer (my own profile only); a failure just means no dot.
        isOwnProfile ? listPendingRequests().then((rows) => rows.length).catch(() => 0) : Promise.resolve(0),
      ]);
      if (!profileRow) throw new Error(t('view.profileNotFound'));
      // Posts are only requested when the viewer may see them.
      const postRows = canView ? await getUserPosts(targetId) : [];
      setCanViewPosts(canView);
      setProfile(profileRow);
      setPosts(postRows);
      setPrivacy(ownPrivacy);
      setPendingRequests(requests);
    } catch (loadError) {
      setError(toUserMessage(loadError, 'profile:view.loadProfileError'));
    } finally {
      setInitialLoading(false);
      setRefreshing(false);
    }
  }, [authUser?.id, isOwnProfile, t, targetId]);

  // Following a private account (e.g. my request was accepted) unlocks its posts: reload.
  const previousRelationRef = useRef(relation);
  useEffect(() => {
    const previous = previousRelationRef.current;
    previousRelationRef.current = relation;
    if (!isOwnProfile && relation === 'following' && previous !== 'following' && !canViewPosts) {
      void loadProfile('silent');
    }
  }, [relation, isOwnProfile, canViewPosts, loadProfile]);

  useFocusEffect(useCallback(() => {
    void loadProfile(hasLoadedRef.current ? 'silent' : 'initial').finally(() => { hasLoadedRef.current = true; });
    if (!isOwnProfile) void refreshRelation(); // follow state / blocks may have changed while away
  }, [loadProfile, isOwnProfile, refreshRelation]));

  useEffect(() => {
    if (!isOwnProfile) {
      setCompletionDismissed(true);
      return;
    }
    let active = true;
    void AsyncStorage.getItem(PROFILE_COMPLETION_DISMISSED_KEY)
      .then((value) => { if (active) setCompletionDismissed(value === '1'); })
      .catch(() => { if (active) setCompletionDismissed(false); });
    return () => { active = false; };
  }, [isOwnProfile]);

  const shareProfile = useCallback(async () => {
    if (!profile) return;
    await shareContent({ message: t('actions.shareText', { username: profile.username }) });
  }, [profile, t]);

  // Another user's counters open THEIR lists, not mine.
  const openFriends = useCallback(
    (initialTab: 'followers' | 'following') =>
      navigation.navigate('Friends', { userId: isOwnProfile ? undefined : targetId ?? undefined, initialTab }),
    [isOwnProfile, navigation, targetId],
  );
  // Same rule as the lists themselves: only when the viewer may see this profile and nobody blocked anybody.
  const canSeeNetwork = !isOwnProfile && canViewPosts && relation !== 'blockedByMe' && relation !== 'blockedMe';
  const dismissCompletion = useCallback(() => {
    setCompletionDismissed(true);
    void AsyncStorage.setItem(PROFILE_COMPLETION_DISMISSED_KEY, '1').catch(() => undefined);
  }, []);
  const openMessage = useCallback(async () => {
    if (!authUser?.id || !targetId) return;
    try {
      const conversation = await getOrCreateConversation(authUser.id, targetId);
      navigation.navigate('DMs', { screen: 'DMChat', params: { conversationId: conversation.id, otherUserId: targetId } });
    } catch (messageError) {
      showAlert(t('actions.messageErrorTitle'), messageError instanceof DmGateError ? messageError.message : t('actions.messageError'));
    }
  }, [authUser?.id, navigation, t, targetId]);

  const handleFollow = useCallback(async () => {
    const result = await follow();
    if (result === null) { showAlert(t('actions.errorTitle'), t('follow.error')); return; }
  }, [follow, t]);

  const handleUnfollow = useCallback(() => {
    if (!profile) return;
    void confirm(t('follow.unfollowTitle', { username: profile.username }), t('follow.unfollowMessage'), { confirmText: t('follow.unfollowConfirm'), cancelText: t('actions.cancel'), destructive: true }).then((accepted) => {
      if (!accepted) return;
      void (async () => {
        const done = await unfollow();
        if (!done) showAlert(t('actions.errorTitle'), t('follow.error'));
      })();
    });
  }, [profile, unfollow, t]);

  const handleCancelRequest = useCallback(() => {
    void confirm(t('follow.cancelRequestTitle'), t('follow.cancelRequestMessage'), { confirmText: t('follow.cancelRequestConfirm'), cancelText: t('follow.keepRequest'), destructive: true }).then((accepted) => {
      if (!accepted) return;
      void (async () => {
        const done = await cancelFollowRequest();
        if (!done) showAlert(t('actions.errorTitle'), t('follow.error'));
      })();
    });
  }, [cancelFollowRequest, t]);

  const handleUnblock = useCallback(() => {
    if (!profile) return;
    void confirm(t('block.unblockTitle', { username: profile.username }), t('block.unblockMessage'), { confirmText: t('block.unblockConfirm'), cancelText: t('actions.cancel') }).then((accepted) => {
      if (!accepted) return;
      void (async () => {
        setMenuVisible(false);
        const done = await unblock();
        if (!done) { showAlert(t('actions.errorTitle'), t('block.error')); return; }
        void loadProfile('silent');
      })();
    });
  }, [profile, unblock, loadProfile, t]);

  const confirmBlock = useCallback(() => {
    if (!profile || !targetId || actionBusy || relationBusy) return; // double-tap guard
    if (blocked) { handleUnblock(); return; }
    void confirm(t('block.title', { username: profile.username }), t('block.message'), { confirmText: t('block.confirm'), cancelText: t('actions.cancel'), destructive: true }).then((accepted) => {
      if (!accepted) return;
      setActionBusy(true);
      void blockUser(targetId).then(() => { setMenuVisible(false); navigation.goBack(); }).catch(() => showAlert(t('actions.errorTitle'), t('block.error'))).finally(() => setActionBusy(false));
    });
  }, [actionBusy, blocked, handleUnblock, navigation, profile, relationBusy, t, targetId]);

  const topInset = inSheet ? 4 : insets.top + (route.name === 'Profile' ? homeBarInset : 0);
  if (initialLoading) {
    // Same container as the real screen (a ScrollView with the same bottom padding): only the content differs, so nothing jumps. The round glass buttons
    // are the real ones; the profile's own menu and share have nothing to act on yet.
    const loadingChrome = {
      isOwnProfile, showBack: route.name === 'UserProfile', hideBack: inSheet, topInset,
      onBack: () => navigation.goBack(), onOpenMenu: () => undefined, onShare: () => undefined, onSettings: () => navigation.navigate('Settings'),
    };
    const loadingBottom = route.name === 'Profile' ? TAB_BAR_LIFT + insets.bottom + BAR_HEIGHT + 24 : 24 + insets.bottom;
    return (
      <View style={[styles.root, { backgroundColor: c.bgBase }]}>
        {inSheet ? null : <StatusBar barStyle={colorScheme === 'light' ? 'dark-content' : 'light-content'} translucent backgroundColor="transparent" />}
        <ScrollView scrollEnabled={false} showsVerticalScrollIndicator={false} contentContainerStyle={[styles.scrollContent, { paddingBottom: loadingBottom }]}>
          <ProfileHeaderSkeleton {...loadingChrome} showBones={showSkeleton} capsuleCount={isOwnProfile && route.name !== 'Profile' ? 1 : 2} />
          <View style={styles.gridTop}><ProfileGridSkeleton cellSize={cellSize} showBones={showSkeleton} /></View>
        </ScrollView>
      </View>
    );
  }
  if (error || !profile) {
    return <View style={[styles.errorRoot, { backgroundColor: c.bgBase }]}><Text style={[styles.errorText, { color: c.dangerText }]}>{error ?? t('view.profileNotFound')}</Text></View>;
  }

  const renderPosts = () => !isOwnProfile && (relation === 'blockedByMe' || relation === 'blockedMe') ? null : !canViewPosts ? (
    <EmptyState icon={<IconLock size={42} color={c.textTertiary} />} title={t('private.title')} subtitle={t('private.subtitle')} accent={theme.accent} />
  ) : posts.length ? (
    <View style={styles.postsGrid}>{posts.map((post) => <PostCell key={post.id} post={post} size={cellSize} onPress={() => navigation.navigate('PostDetail', { postId: post.id })} />)}</View>
  ) : (
    <EmptyState icon={<IconPhoto size={42} color={c.textTertiary} />} title={isOwnProfile ? t('empty.ownPostsTitle') : t('empty.otherPostsTitle')} subtitle={isOwnProfile ? t('empty.ownPostsSubtitle') : t('empty.otherPostsSubtitle')} accent={theme.accent} />
  );

  // The city shows only when the owner allows it (the choice is read for my own profile).
  const shownCity = isOwnProfile && !privacy.showCity ? null : profile.city;
  // "+ Post" (the capsule that replaced the floating button) belongs to the own profile in the Profile tab.
  const showPublish = isOwnProfile && route.name === 'Profile';
  // The content passes behind the tab bar (the Profile tab) or just needs a margin at the bottom.
  const bottomPadding = route.name === 'Profile' ? TAB_BAR_LIFT + insets.bottom + BAR_HEIGHT + 24 : 24 + insets.bottom;
  // The status bar sits over the cover (light or dark icons, whichever the theme's cover needs); over the compact header it follows the system.
  const coverNeedsLightIcons = readableOn(theme.coverGradient[0]) === palette.onBrand;
  const statusBarStyle = compact ? (colorScheme === 'light' ? 'dark-content' : 'light-content') : coverNeedsLightIcons ? 'light-content' : 'dark-content';
  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = isCompactHeader(event.nativeEvent.contentOffset.y);
    if (next !== compactRef.current) { compactRef.current = next; setCompact(next); }
  };
  const chrome = {
    isOwnProfile, showBack: route.name === 'UserProfile', hideBack: inSheet, topInset,
    onBack: () => navigation.goBack(), onOpenMenu: () => setMenuVisible(true), onShare: () => void shareProfile(), onSettings: () => navigation.navigate('Settings'),
  };

  return (
    <View style={[styles.root, { backgroundColor: c.bgBase }]}>
      {inSheet ? null : <StatusBar barStyle={statusBarStyle} translucent backgroundColor="transparent" />}
      <Animated.View style={[styles.contentArea, { opacity: contentOpacity }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={32}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPadding }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadProfile('pull')} tintColor={c.brand} colors={[c.brand]} progressBackgroundColor={c.bgSurface} />}
      >
        <ProfileHeader
          {...chrome}
          displayName={profile.display_name} username={profile.username} avatarUrl={profile.avatar_url}
          bio={profile.bio} city={shownCity} isVerified={profile.is_verified} relation={relation} followBusy={relationLoading || relationBusy}
          completion={{ hasPhoto: Boolean(profile.avatar_url), hasBio: Boolean(profile.bio?.trim()), hasPost: posts.length > 0 }}
          completionVisible={completionDismissed === false} onDismissCompletion={dismissCompletion}
          pendingRequests={pendingRequests} onEditProfile={() => navigation.navigate('EditProfile')}
          onPublish={showPublish ? () => navigation.navigate('CreatePost') : undefined}
          onFollow={() => void handleFollow()} onUnfollow={handleUnfollow} onCancelRequest={handleCancelRequest} onUnblock={handleUnblock}
          onMessage={() => void openMessage()} theme={theme}
        />
        <View style={styles.gridTop}>{renderPosts()}</View>
      </ScrollView>
      </Animated.View>

      {compact ? (
        <ProfileCompactBar {...chrome} displayName={profile.display_name} username={profile.username} avatarUrl={profile.avatar_url} />
      ) : null}

      <AppModal visible={menuVisible} transparent animationType="slide" onRequestClose={() => setMenuVisible(false)}>
        <Pressable accessible={false} style={[styles.backdrop, { backgroundColor: c.scrim }]} onPress={() => setMenuVisible(false)} />
        <View style={[styles.sheet, { backgroundColor: c.bgSurface, borderColor: c.borderSubtle }]}>
          <View style={styles.sheetHandleWrap}><View style={[styles.sheetHandle, { backgroundColor: c.borderSubtle }]} /></View>
          <Text style={[styles.sheetTitle, { color: c.textPrimary }]}>@{profile.username}</Text>
          <SheetRow icon={<IconShare3 size={20} color={c.textPrimary} />} label={t('menu.share')} color={c.textPrimary} borderColor={c.borderSubtle} onPress={() => { setMenuVisible(false); void shareProfile(); }} />
          {canSeeNetwork ? (
            <>
              <SheetRow icon={<IconUsers size={20} color={c.textPrimary} />} label={t('menu.viewFollowers')} color={c.textPrimary} borderColor={c.borderSubtle} onPress={() => { setMenuVisible(false); openFriends('followers'); }} />
              <SheetRow icon={<IconUsers size={20} color={c.textPrimary} />} label={t('menu.viewFollowing')} color={c.textPrimary} borderColor={c.borderSubtle} onPress={() => { setMenuVisible(false); openFriends('following'); }} />
            </>
          ) : null}
          <SheetRow icon={<IconFlag size={20} color={c.dangerText} />} label={t('menu.report')} color={c.dangerText} borderColor={c.borderSubtle} onPress={() => { setMenuVisible(false); setReportVisible(true); }} />
          <SheetRow icon={<IconBan size={20} color={c.dangerText} />} label={blocked ? t('menu.unblock') : t('menu.block')} color={c.dangerText} borderColor={c.borderSubtle} onPress={confirmBlock} />
          <SheetRow icon={<IconX size={20} color={c.textSecondary} />} label={t('actions.cancel')} color={c.textSecondary} borderColor={c.borderSubtle} onPress={() => setMenuVisible(false)} />
        </View>
      </AppModal>

      <ReportReasonSheet
        visible={reportVisible}
        targetName={profile.display_name?.trim() || profile.username}
        contentType="user"
        contentId={targetId ?? ''}
        onClose={() => setReportVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 }, contentArea: { flex: 1 }, scrollContent: {}, errorRoot: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }, errorText: { textAlign: 'center', fontSize: 14 },
  gridTop: { marginTop: 12 },
  postsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP }, postCell: { overflow: 'hidden' }, postTextWrap: { alignItems: 'center', justifyContent: 'center', padding: 8 }, postText: { fontSize: 10, lineHeight: 14 },
  multiPhotoBadge: { position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.scrim },
  emptyState: { minHeight: 270, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 34, paddingVertical: 34 }, emptyTitle: { marginTop: 14, textAlign: 'center', fontSize: 18, fontWeight: '800' },
  emptySubtitle: { marginTop: 7, textAlign: 'center', fontSize: 14, lineHeight: 20 }, emptyAction: { marginTop: 18, minHeight: 44, borderRadius: 12, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' }, emptyActionText: { fontSize: 14, fontWeight: '700' },
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }, sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopWidth: 1, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 18, paddingBottom: 30 },
  sheetHandleWrap: { height: 28, alignItems: 'center', justifyContent: 'center' }, sheetHandle: { width: 42, height: 5, borderRadius: 3 }, sheetTitle: { fontSize: 17, fontWeight: '800', paddingBottom: 10 },
  sheetRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth }, sheetRowText: { flex: 1, fontSize: 15, fontWeight: '600' },
});
