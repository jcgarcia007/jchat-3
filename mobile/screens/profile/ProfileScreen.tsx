import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert, Animated, Image, Modal, Pressable, RefreshControl, ScrollView,
  Share, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import {
  IconBan, IconFlag, IconLock, IconPhoto, IconShare3, IconStack2, IconX,
} from '@tabler/icons-react-native';

import type { MainStackParamList } from '../../navigation/AppNavigator';
import { useAuth } from '../../context/AuthContext';
import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import { getProfileTheme } from '../../theme/profileThemes';
import type { ProfileTheme } from '../../theme/profileThemes';
import { canViewProfile, getPublicProfile, getProfileCounts, reportUser, type ProfileCounts } from '../../services/users';
import type { PublicProfileRow } from '../../services/users';
import { getUserPosts } from '../../services/posts';
import type { PostRow } from '../../services/posts';
import { getOrCreateConversation, DmGateError } from '../../services/dms';
import { blockUser } from '../../services/blocks';
import { useFollowSystem } from '../../hooks/useFollowSystem';
import ProfileHeader, { ProfileTopBar } from '../../components/profile/ProfileHeader';
import { toUserMessage } from '../../utils/errors';
import { useHomeBarInset } from '../../components/venue/HomeBarInset';

type ProfileRoute = RouteProp<{ UserProfile: { userId?: string } }, 'UserProfile'>;

const REPORT_REASONS = ['spam', 'harassment', 'inappropriate', 'impersonation', 'other'] as const;
const GRID_COLUMNS = 3;
const GRID_GAP = 2;
const PROFILE_COMPLETION_DISMISSED_KEY = 'profile.completionDismissed';

function ProfileSkeleton({ theme, topInset }: { theme: ProfileTheme; topInset: number }) {
  const opacity = useRef(new Animated.Value(0.38)).current;
  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.82, duration: 650, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.38, duration: 650, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);
  const block = { backgroundColor: theme.statsBorder };
  return (
    <View style={[styles.skeletonRoot, { backgroundColor: theme.statsBg, paddingTop: topInset + 12 }]}>
      <Animated.View style={[styles.skeletonTop, block, { opacity }]} />
      <Animated.View style={[styles.skeletonCover, block, { opacity }]} />
      <Animated.View style={[styles.skeletonAvatar, { backgroundColor: theme.coverBg, borderColor: theme.statsBg, opacity }]} />
      <Animated.View style={[styles.skeletonName, block, { opacity }]} />
      <Animated.View style={[styles.skeletonHandle, block, { opacity }]} />
      <Animated.View style={[styles.skeletonStats, block, { opacity }]} />
      <View style={styles.skeletonGrid}>
        {Array.from({ length: 6 }).map((_, index) => <Animated.View key={index} style={[styles.skeletonCell, block, { opacity }]} />)}
      </View>
    </View>
  );
}

function PostCell({ post, theme, size, onPress }: { post: PostRow; theme: ProfileTheme; size: number; onPress: () => void }) {
  const { t } = useTranslation('profile');
  const [imageFailed, setImageFailed] = useState(false);
  const media = post.media_urls?.[0];
  const hasMultiplePhotos = (post.media_urls?.length ?? 0) > 1;
  return (
    <TouchableOpacity
      style={[styles.postCell, { width: size, height: size, backgroundColor: theme.cellColors[1] }]}
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
        <View style={[StyleSheet.absoluteFill, styles.postTextWrap, { backgroundColor: theme.cellColors[1] }]}>
          <Text style={[styles.postText, { color: theme.bodyText }]} numberOfLines={4}>{post.caption ?? ''}</Text>
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
  icon, title, subtitle, actionLabel, onAction, theme,
}: {
  icon: React.ReactNode; title: string; subtitle: string; actionLabel?: string; onAction?: () => void; theme: ProfileTheme;
}) {
  return (
    <View style={styles.emptyState}>
      {icon}
      <Text style={[styles.emptyTitle, { color: theme.bodyText }]}>{title}</Text>
      <Text style={[styles.emptySubtitle, { color: theme.bodyTextSecondary }]}>{subtitle}</Text>
      {actionLabel && onAction ? (
        <TouchableOpacity style={[styles.emptyAction, { backgroundColor: theme.btn1Bg }]} onPress={onAction} accessibilityRole="button">
          <Text style={[styles.emptyActionText, { color: theme.btn1Color }]}>{actionLabel}</Text>
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
  const { t } = useTranslation('profile');
  const insets = useSafeAreaInsets();
  const homeBarInset = useHomeBarInset();
  const { width: windowWidth } = useWindowDimensions();
  const cellSize = (windowWidth - GRID_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS;
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const route = useRoute<ProfileRoute>();
  const { user: authUser } = useAuth();
  const routeUserId = userId ?? route.params?.userId;
  const targetId = routeUserId ?? authUser?.id ?? null;
  const isOwnProfile = !routeUserId || routeUserId === authUser?.id;

  const [profile, setProfile] = useState<PublicProfileRow | null>(null);
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [counts, setCounts] = useState<ProfileCounts>({ followers: 0, following: 0, posts: 0 });
  // False for a private account I don't follow (the grid is replaced by a notice). Default true:
  // if the check itself fails, RLS still decides what the posts query returns.
  const [canViewPosts, setCanViewPosts] = useState(true);
  const [initialLoading, setInitialLoading] = useState(true);
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
  const theme = getProfileTheme(profile?.profile_theme_id ?? 1);

  // 'initial' shows the skeleton; 'pull' is the user's own pull-to-refresh (the only time the RefreshControl may
  // spin); 'silent' re-reads in the background (coming back to the tab, a private account unlocking). Setting
  // `refreshing` for a silent reload made iOS push the content down by the spinner height and leave it there
  // until the next touch.
  const loadProfile = useCallback(async (mode: 'initial' | 'silent' | 'pull' = 'initial') => {
    if (!targetId) { setInitialLoading(false); return; }
    if (mode === 'pull') setRefreshing(true); else if (mode === 'initial') setInitialLoading(true);
    setError(null);
    try {
      const [canView, profileRow, profileCounts] = await Promise.all([
        isOwnProfile || !authUser?.id ? Promise.resolve(true) : canViewProfile(authUser.id, targetId).catch(() => true),
        getPublicProfile(targetId),
        // A counters failure must not take the whole profile down: keep what we had.
        getProfileCounts(targetId).catch(() => null),
      ]);
      if (!profileRow) throw new Error(t('view.profileNotFound'));
      // Posts are only requested when the viewer may see them.
      const postRows = canView ? await getUserPosts(targetId) : [];
      setCanViewPosts(canView);
      setProfile(profileRow);
      setPosts(postRows);
      if (profileCounts) setCounts(profileCounts);
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
    await Share.share({ message: t('actions.shareText', { username: profile.username }) });
  }, [profile, t]);

  // Another user's counters open THEIR lists, not mine.
  const openFriends = useCallback(
    (initialTab: 'followers' | 'following') =>
      navigation.navigate('Friends', { userId: isOwnProfile ? undefined : targetId ?? undefined, initialTab }),
    [isOwnProfile, navigation, targetId],
  );
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
      Alert.alert(t('actions.messageErrorTitle'), messageError instanceof DmGateError ? messageError.message : t('actions.messageError'));
    }
  }, [authUser?.id, navigation, t, targetId]);

  // Optimistic ±1 on the follower counter, then the server's number replaces it.
  const reconcileCounts = useCallback(() => {
    if (!targetId) return;
    void getProfileCounts(targetId).then(setCounts).catch(() => undefined);
  }, [targetId]);

  const handleFollow = useCallback(async () => {
    const result = await follow();
    if (result === null) { Alert.alert(t('actions.errorTitle'), t('follow.error')); return; }
    // 'requested' (private account) does NOT add a follower yet.
    if (result === 'following') setCounts((value) => ({ ...value, followers: value.followers + 1 }));
    reconcileCounts();
  }, [follow, reconcileCounts, t]);

  const handleUnfollow = useCallback(() => {
    if (!profile) return;
    Alert.alert(t('follow.unfollowTitle', { username: profile.username }), t('follow.unfollowMessage'), [
      { text: t('actions.cancel'), style: 'cancel' },
      { text: t('follow.unfollowConfirm'), style: 'destructive', onPress: () => {
        void (async () => {
          const done = await unfollow();
          if (!done) { Alert.alert(t('actions.errorTitle'), t('follow.error')); return; }
          setCounts((value) => ({ ...value, followers: Math.max(0, value.followers - 1) }));
          reconcileCounts();
        })();
      } },
    ]);
  }, [profile, unfollow, reconcileCounts, t]);

  const handleCancelRequest = useCallback(() => {
    Alert.alert(t('follow.cancelRequestTitle'), t('follow.cancelRequestMessage'), [
      { text: t('follow.keepRequest'), style: 'cancel' },
      { text: t('follow.cancelRequestConfirm'), style: 'destructive', onPress: () => {
        void (async () => {
          const done = await cancelFollowRequest();
          if (!done) Alert.alert(t('actions.errorTitle'), t('follow.error'));
        })();
      } },
    ]);
  }, [cancelFollowRequest, t]);

  const handleUnblock = useCallback(() => {
    if (!profile) return;
    Alert.alert(t('block.unblockTitle', { username: profile.username }), t('block.unblockMessage'), [
      { text: t('actions.cancel'), style: 'cancel' },
      { text: t('block.unblockConfirm'), onPress: () => {
        void (async () => {
          setMenuVisible(false);
          const done = await unblock();
          if (!done) { Alert.alert(t('actions.errorTitle'), t('block.error')); return; }
          void loadProfile('silent');
        })();
      } },
    ]);
  }, [profile, unblock, loadProfile, t]);

  const submitReport = useCallback(async (reason: typeof REPORT_REASONS[number]) => {
    if (!authUser?.id || !targetId || actionBusy) return;
    setActionBusy(true);
    try {
      await reportUser(authUser.id, targetId, reason);
      setReportVisible(false);
      Alert.alert(t('report.thanksTitle'), t('report.thanksMessage'));
    } catch {
      Alert.alert(t('actions.errorTitle'), t('report.error'));
    } finally { setActionBusy(false); }
  }, [actionBusy, authUser?.id, t, targetId]);

  const confirmBlock = useCallback(() => {
    if (!profile || !targetId || actionBusy || relationBusy) return; // double-tap guard
    if (blocked) { handleUnblock(); return; }
    Alert.alert(t('block.title', { username: profile.username }), t('block.message'), [
      { text: t('actions.cancel'), style: 'cancel' },
      { text: t('block.confirm'), style: 'destructive', onPress: () => {
        setActionBusy(true);
        void blockUser(targetId).then(() => { setMenuVisible(false); navigation.goBack(); }).catch(() => Alert.alert(t('actions.errorTitle'), t('block.error'))).finally(() => setActionBusy(false));
      } },
    ]);
  }, [actionBusy, blocked, handleUnblock, navigation, profile, relationBusy, t, targetId]);

  if (initialLoading) return <ProfileSkeleton theme={theme} topInset={insets.top} />;
  if (error || !profile) {
    return <View style={[styles.errorRoot, { backgroundColor: c.bgBase }]}><Text style={[styles.errorText, { color: c.danger }]}>{error ?? t('view.profileNotFound')}</Text></View>;
  }

  const renderPosts = () => !isOwnProfile && (relation === 'blockedByMe' || relation === 'blockedMe') ? null : !canViewPosts ? (
    <EmptyState icon={<IconLock size={42} color={theme.tabInactiveText} />} title={t('private.title')} subtitle={t('private.subtitle')} theme={theme} />
  ) : posts.length ? (
    <View style={styles.postsGrid}>{posts.map((post) => <PostCell key={post.id} post={post} theme={theme} size={cellSize} onPress={() => navigation.navigate('PostDetail', { postId: post.id })} />)}</View>
  ) : (
    <EmptyState icon={<IconPhoto size={42} color={theme.tabInactiveText} />} title={isOwnProfile ? t('empty.ownPostsTitle') : t('empty.otherPostsTitle')} subtitle={isOwnProfile ? t('empty.ownPostsSubtitle') : t('empty.otherPostsSubtitle')} actionLabel={isOwnProfile ? t('empty.createPost') : undefined} onAction={isOwnProfile ? () => navigation.navigate('CreatePost') : undefined} theme={theme} />
  );

  return (
    <View style={[styles.root, { backgroundColor: theme.statsBg }]}>
      <ProfileTopBar
        isOwnProfile={isOwnProfile} showBack={route.name === 'UserProfile'} username={profile.username} topInset={insets.top}
        onBack={() => navigation.goBack()} onOpenMenu={() => setMenuVisible(true)} onShare={() => void shareProfile()}
        onSettings={() => navigation.navigate('Settings')} onCreatePost={() => navigation.navigate('CreatePost')} theme={theme}
      />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 102 + insets.bottom + (route.name === 'UserProfile' ? 0 : homeBarInset) }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadProfile('pull')} tintColor={theme.tabActive} colors={[theme.tabActive]} progressBackgroundColor={theme.statsBg} />}
      >
        <ProfileHeader
          isOwnProfile={isOwnProfile} displayName={profile.display_name} username={profile.username} avatarUrl={profile.avatar_url} coverUrl={profile.cover_url}
          bio={profile.bio} city={profile.city} isVerified={profile.is_verified} postCount={counts.posts} followerCount={counts.followers}
          followingCount={counts.following} relation={relation} followBusy={relationLoading || relationBusy}
          completion={{ hasPhoto: Boolean(profile.avatar_url), hasBio: Boolean(profile.bio?.trim()), hasPost: posts.length > 0 }}
          completionVisible={completionDismissed === false} onDismissCompletion={dismissCompletion}
          onShare={() => void shareProfile()} onEditProfile={() => navigation.navigate('EditProfile')} onCreatePost={() => navigation.navigate('CreatePost')}
          onOpenFollowers={() => openFriends('followers')} onOpenFollowing={() => openFriends('following')}
          onFollow={() => void handleFollow()} onUnfollow={handleUnfollow} onCancelRequest={handleCancelRequest} onUnblock={handleUnblock}
          onMessage={() => void openMessage()} theme={theme}
        />
        {renderPosts()}
      </ScrollView>

      <Modal visible={menuVisible} transparent animationType="slide" onRequestClose={() => setMenuVisible(false)}>
        <Pressable style={[styles.backdrop, { backgroundColor: c.scrim }]} onPress={() => setMenuVisible(false)} />
        <View style={[styles.sheet, { backgroundColor: theme.statsBg, borderColor: theme.statsBorder }]}>
          <View style={styles.sheetHandleWrap}><View style={[styles.sheetHandle, { backgroundColor: theme.statsBorder }]} /></View>
          <Text style={[styles.sheetTitle, { color: theme.bodyText }]}>@{profile.username}</Text>
          <SheetRow icon={<IconShare3 size={20} color={theme.bodyText} />} label={t('menu.share')} color={theme.bodyText} borderColor={theme.statsBorder} onPress={() => { setMenuVisible(false); void shareProfile(); }} />
          <SheetRow icon={<IconFlag size={20} color={c.danger} />} label={t('menu.report')} color={c.danger} borderColor={theme.statsBorder} onPress={() => { setMenuVisible(false); setReportVisible(true); }} />
          <SheetRow icon={<IconBan size={20} color={c.danger} />} label={blocked ? t('menu.unblock') : t('menu.block')} color={c.danger} borderColor={theme.statsBorder} onPress={confirmBlock} />
          <SheetRow icon={<IconX size={20} color={theme.bodyTextSecondary} />} label={t('actions.cancel')} color={theme.bodyTextSecondary} borderColor={theme.statsBorder} onPress={() => setMenuVisible(false)} />
        </View>
      </Modal>

      <Modal visible={reportVisible} transparent animationType="slide" onRequestClose={() => setReportVisible(false)}>
        <Pressable style={[styles.backdrop, { backgroundColor: c.scrim }]} onPress={() => setReportVisible(false)} />
        <View style={[styles.sheet, { backgroundColor: theme.statsBg, borderColor: theme.statsBorder }]}>
          <View style={styles.sheetHandleWrap}><View style={[styles.sheetHandle, { backgroundColor: theme.statsBorder }]} /></View>
          <Text style={[styles.sheetTitle, { color: theme.bodyText }]}>{t('report.title')}</Text>
          {REPORT_REASONS.map((reason) => <SheetRow key={reason} label={t(`report.reasons.${reason}`)} color={theme.bodyText} borderColor={theme.statsBorder} onPress={() => void submitReport(reason)} />)}
          <SheetRow label={t('actions.cancel')} color={theme.bodyTextSecondary} borderColor={theme.statsBorder} onPress={() => setReportVisible(false)} />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 }, scrollContent: {}, errorRoot: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }, errorText: { textAlign: 'center', fontSize: 14 },
  skeletonRoot: { flex: 1 }, skeletonTop: { width: 150, height: 18, borderRadius: 9, marginLeft: 16 }, skeletonCover: { height: 120, marginHorizontal: 16, marginTop: 18, borderRadius: 20 },
  skeletonAvatar: { width: 104, height: 104, borderRadius: 52, borderWidth: 4, marginLeft: 28, marginTop: -48 }, skeletonName: { width: 180, height: 22, borderRadius: 8, marginLeft: 20, marginTop: 12 },
  skeletonHandle: { width: 110, height: 14, borderRadius: 7, marginLeft: 20, marginTop: 8 }, skeletonStats: { height: 70, borderRadius: 16, marginHorizontal: 16, marginTop: 28 },
  skeletonGrid: { marginTop: 24, flexDirection: 'row', flexWrap: 'wrap', gap: 2 }, skeletonCell: { width: '32.9%', aspectRatio: 1 },
  postsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP }, postCell: { overflow: 'hidden' }, postTextWrap: { alignItems: 'center', justifyContent: 'center', padding: 8 }, postText: { fontSize: 10, lineHeight: 14 },
  multiPhotoBadge: { position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.scrim },
  emptyState: { minHeight: 270, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 34, paddingVertical: 34 }, emptyTitle: { marginTop: 14, textAlign: 'center', fontSize: 18, fontWeight: '800' },
  emptySubtitle: { marginTop: 7, textAlign: 'center', fontSize: 14, lineHeight: 20 }, emptyAction: { marginTop: 18, minHeight: 44, borderRadius: 12, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' }, emptyActionText: { fontSize: 14, fontWeight: '700' },
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }, sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopWidth: 1, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 18, paddingBottom: 30 },
  sheetHandleWrap: { height: 28, alignItems: 'center', justifyContent: 'center' }, sheetHandle: { width: 42, height: 5, borderRadius: 3 }, sheetTitle: { fontSize: 17, fontWeight: '800', paddingBottom: 10 },
  sheetRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth }, sheetRowText: { flex: 1, fontSize: 15, fontWeight: '600' },
});
