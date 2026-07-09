/**
 * JChat 3.0 — Profile Screen (Task 1.7)
 *
 * Full user-profile view with:
 *   - ProfileHeader (cover, avatar, name, bio, stats, action buttons)
 *   - 5 icon-only content tabs with theme-accent active underline:
 *       0 IconGridDots  → Posts (3-col square grid)
 *       1 IconMovie     → Reels/Stories (TODO stub)
 *       2 IconMapPin    → Places (check-in history, NO timestamps)
 *       3 IconGift      → Gifts (GiftsReceivedScreen)
 *       4 IconBookmark  → Saved (TODO stub)
 *
 * Loading the profile:
 *   - Own profile:  uses AuthContext `user.id`
 *   - Other user:   reads `userId` from route params
 *
 * Profile theme: getProfileTheme(profileData.profile_theme_id)
 *
 * Privacy rules enforced:
 *   - Places tab: uses getCheckInHistory() which strips created_at
 *   - GPS never exposed on profile
 *
 * TODO(nav): when Task 1.8 (EditProfileScreen) lands, wire onEditProfile.
 * TODO(nav): when DMs screen (Task 1.12) exposes a "start DM" API, wire onMessage.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  IconGridDots,
  IconGift,
  IconBookmark,
  IconMapPin,
  IconMovie,
} from '@tabler/icons-react-native';
import { useTranslation } from 'react-i18next';

import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../../context/AuthContext';
import type { MainStackParamList } from '../../navigation/AppNavigator';
import { useThemeColors } from '../../theme/colors';
import { getProfileTheme } from '../../theme/profileThemes';
import type { ProfileTheme } from '../../theme/profileThemes';
import { palette } from '../../theme/tokens';

import { getPublicProfile } from '../../services/users';
import type { PublicProfileRow } from '../../services/users';
import { getUserPosts } from '../../services/posts';
import type { PostRow } from '../../services/posts';
import { getCheckInHistory } from '../../services/checkIn';
import type { CheckInPlace } from '../../services/checkIn';

import { useFollowSystem } from '../../hooks/useFollowSystem';

import ProfileHeader from '../../components/profile/ProfileHeader';
import GiftsReceivedScreen from './GiftsReceivedScreen';

// ── Constants ────────────────────────────────────────────────────────────────

const SCREEN_W = Dimensions.get('window').width;
const GRID_GAP = 2;
const GRID_COLS = 3;
const CELL_SIZE = (SCREEN_W - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS;

// ── Tab definition ───────────────────────────────────────────────────────────

type TabId = 'posts' | 'reels' | 'places' | 'gifts' | 'saved';

type TabA11yKey =
  | 'view.postsTab'
  | 'view.reelsTab'
  | 'view.placesTab'
  | 'view.giftsTab'
  | 'view.savedTab';

interface TabConfig {
  id: TabId;
  Icon: React.ComponentType<{ size: number; color: string }>;
  a11yKey: TabA11yKey;
}

const TABS: TabConfig[] = [
  { id: 'posts',  Icon: IconGridDots, a11yKey: 'view.postsTab'  },
  { id: 'reels',  Icon: IconMovie,    a11yKey: 'view.reelsTab'  },
  { id: 'places', Icon: IconMapPin,   a11yKey: 'view.placesTab' },
  { id: 'gifts',  Icon: IconGift,     a11yKey: 'view.giftsTab'  },
  { id: 'saved',  Icon: IconBookmark, a11yKey: 'view.savedTab'  },
];

// ── Sub-components ────────────────────────────────────────────────────────────

/** 3-column square grid cell for a post thumbnail */
function PostCell({ post }: { post: PostRow }) {
  const c = useThemeColors();
  const { t } = useTranslation('profile');
  const firstMedia = post.media_urls?.[0] ?? null;

  return (
    <View
      style={[
        styles.gridCell,
        { width: CELL_SIZE, height: CELL_SIZE, backgroundColor: c.bgSurface },
      ]}
    >
      {firstMedia ? (
        <Image
          source={{ uri: firstMedia }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          accessibilityLabel={t('view.postThumbnailA11y')}
        />
      ) : (
        /* Text-only post placeholder */
        <View style={[StyleSheet.absoluteFill, styles.textPostPlaceholder, { backgroundColor: c.bgOverlay }]}>
          <Text style={[styles.textPostCaption, { color: c.textSecondary }]} numberOfLines={4}>
            {post.caption ?? ''}
          </Text>
        </View>
      )}
    </View>
  );
}

/** Tab bar icon button */
interface TabIconProps {
  config: TabConfig;
  isActive: boolean;
  theme: ProfileTheme;
  onPress: () => void;
}

function TabIcon({ config, isActive, theme, onPress }: TabIconProps) {
  const { Icon } = config;
  const { t } = useTranslation('profile');
  return (
    <TouchableOpacity
      style={styles.tabBtn}
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityLabel={t(config.a11yKey)}
      accessibilityState={{ selected: isActive }}
    >
      <Icon
        size={22}
        color={isActive ? theme.tabActive : theme.tabInactive}
      />
      {isActive && (
        <View style={[styles.tabUnderline, { backgroundColor: theme.tabActive }]} />
      )}
    </TouchableOpacity>
  );
}

/** Empty state for Places tab */
function PlacesEmpty({ theme }: { theme: ProfileTheme }) {
  const { t } = useTranslation('profile');
  return (
    <View style={styles.emptyTab}>
      <IconMapPin size={40} color={theme.tabInactive} />
      <Text style={[styles.emptyTabText, { color: theme.tabInactive }]}>
        {t('view.noPlacesYet')}
      </Text>
    </View>
  );
}

/** Empty state for generic tabs */
function GenericEmpty({ theme, label }: { theme: ProfileTheme; label: string }) {
  return (
    <View style={styles.emptyTab}>
      <Text style={[styles.emptyTabText, { color: theme.tabInactive }]}>{label}</Text>
    </View>
  );
}

// ── Places tab content ────────────────────────────────────────────────────────

interface PlacesTabProps {
  places: CheckInPlace[];
  theme: ProfileTheme;
}

function PlacesTab({ places, theme }: PlacesTabProps) {
  const c = useThemeColors();
  const { t } = useTranslation('profile');
  if (places.length === 0) return <PlacesEmpty theme={theme} />;

  return (
    <FlatList<CheckInPlace>
      data={places}
      keyExtractor={(item) => item.checkInId}
      scrollEnabled={false}
      renderItem={({ item }) => (
        <View
          style={[
            styles.placeRow,
            {
              backgroundColor: c.bgSurface,
              borderBottomColor: c.borderSubtle,
            },
          ]}
        >
          {/* Logo / fallback circle */}
          {item.businessLogoUrl ? (
            <Image
              source={{ uri: item.businessLogoUrl }}
              style={[styles.placeLogo, { backgroundColor: c.bgOverlay }]}
              resizeMode="cover"
              accessibilityLabel={t('view.businessLogoA11y', { name: item.businessName })}
            />
          ) : (
            <View style={[styles.placeLogo, styles.placeLogoFallback, { backgroundColor: theme.btn1Bg }]}>
              <IconMapPin size={16} color={theme.btn1Color} />
            </View>
          )}

          <View style={styles.placeInfo}>
            <Text style={[styles.placeName, { color: c.textPrimary }]} numberOfLines={1}>
              {item.businessName}
            </Text>
            {(item.businessCategory || item.businessCity) ? (
              <Text style={[styles.placeMeta, { color: c.textTertiary }]} numberOfLines={1}>
                {[item.businessCategory, item.businessCity].filter(Boolean).join(' · ')}
              </Text>
            ) : null}
          </View>
        </View>
      )}
      contentContainerStyle={styles.placesList}
    />
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

interface ProfileScreenProps {
  /** Optional — when provided, shows another user's profile. */
  userId?: string;
}

export default function ProfileScreen({ userId: routeUserId }: ProfileScreenProps = {}) {
  const c = useThemeColors();
  const { t } = useTranslation('profile');
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { user: authUser, signOut } = useAuth();

  // Determine whose profile to show
  const targetId = routeUserId ?? authUser?.id ?? null;
  const isOwnProfile = !routeUserId || routeUserId === authUser?.id;

  // ── Profile data ──────────────────────────────────────────────────────────
  const [profile, setProfile] = useState<PublicProfileRow | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);

  // ── Posts (tab 0) ─────────────────────────────────────────────────────────
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);

  // ── Places (tab 2) ────────────────────────────────────────────────────────
  const [places, setPlaces] = useState<CheckInPlace[]>([]);
  const [placesLoading, setPlacesLoading] = useState(false);
  const placesLoaded = useRef(false);

  // ── Active tab ────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<TabId>('posts');

  // ── Follow system ─────────────────────────────────────────────────────────
  const {
    isFollowing,
    isPending,
    followerCount,
    followingCount,
    loading: followLoading,
    follow,
    unfollow,
  } = useFollowSystem(isOwnProfile ? null : targetId);

  // ── Load profile ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!targetId) {
      setProfileLoading(false);
      return;
    }

    let cancelled = false;
    async function loadProfile() {
      setProfileLoading(true);
      setProfileError(null);
      try {
        const row = await getPublicProfile(targetId as string);
        if (!cancelled) setProfile(row);
      } catch (err) {
        if (!cancelled)
          setProfileError(err instanceof Error ? err.message : t('view.loadProfileError'));
      } finally {
        if (!cancelled) setProfileLoading(false);
      }
    }
    void loadProfile();
    return () => { cancelled = true; };
  }, [targetId, t]);

  // ── Load posts on mount ───────────────────────────────────────────────────
  useEffect(() => {
    if (!targetId) return;
    let cancelled = false;
    async function loadPosts() {
      setPostsLoading(true);
      try {
        const rows = await getUserPosts(targetId as string);
        if (!cancelled) setPosts(rows);
      } catch {
        // silently fail; show empty grid
      } finally {
        if (!cancelled) setPostsLoading(false);
      }
    }
    void loadPosts();
    return () => { cancelled = true; };
  }, [targetId]);

  // ── Load places lazily when tab is first opened ───────────────────────────
  useEffect(() => {
    if (activeTab !== 'places' || placesLoaded.current || !targetId) return;
    placesLoaded.current = true;
    let cancelled = false;
    async function loadPlaces() {
      setPlacesLoading(true);
      try {
        const rows = await getCheckInHistory(targetId as string);
        if (!cancelled) setPlaces(rows);
      } catch {
        // silently fail; show empty list
      } finally {
        if (!cancelled) setPlacesLoading(false);
      }
    }
    void loadPlaces();
    return () => { cancelled = true; };
  }, [activeTab, targetId]);

  // ── Derive theme from loaded profile ──────────────────────────────────────
  const theme: ProfileTheme = getProfileTheme(profile?.profile_theme_id ?? 1);

  // ── Animated scroll ref so content scrolls behind a sticky header ─────────
  const scrollY = useRef(new Animated.Value(0)).current;

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleFollow = useCallback(async () => {
    await follow();
  }, [follow]);

  const handleUnfollow = useCallback(async () => {
    await unfollow();
  }, [unfollow]);

  const handleMessage = useCallback(() => {
    // TODO(nav Task 1.12): navigate to DM thread with targetId
  }, []);

  const handleEditProfile = useCallback(() => {
    navigation.navigate('EditProfile');
  }, [navigation]);

  const handleEditCover = useCallback(() => {
    // TODO(Task 1.8): open cover photo picker
  }, []);

  const handleSignOut = useCallback(async () => {
    await signOut();
  }, [signOut]);

  // ── Loading / error states ─────────────────────────────────────────────────

  if (profileLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: c.bgBase }]}>
        <ActivityIndicator size="large" color={palette.brand} />
      </View>
    );
  }

  if (profileError || !profile) {
    return (
      <View style={[styles.centered, { backgroundColor: c.bgBase }]}>
        <Text style={[styles.errorText, { color: palette.danger }]}>
          {profileError ?? t('view.profileNotFound')}
        </Text>
      </View>
    );
  }

  // ── Tab content ──────────────────────────────────────────────────────────

  function renderTabContent() {
    switch (activeTab) {
      case 'posts':
        if (postsLoading) {
          return (
            <View style={styles.tabLoading}>
              <ActivityIndicator color={theme.tabActive} />
            </View>
          );
        }
        if (posts.length === 0) {
          return <GenericEmpty theme={theme} label={t('view.noPostsYet')} />;
        }
        return (
          <View style={styles.grid}>
            {posts.map((post) => (
              <PostCell key={post.id} post={post} />
            ))}
          </View>
        );

      case 'reels':
        // TODO: Reels/Stories data source not yet implemented
        return <GenericEmpty theme={theme} label={t('view.reelsSoon')} />;

      case 'places':
        if (placesLoading) {
          return (
            <View style={styles.tabLoading}>
              <ActivityIndicator color={theme.tabActive} />
            </View>
          );
        }
        return <PlacesTab places={places} theme={theme} />;

      case 'gifts':
        return <GiftsReceivedScreen userId={profile?.id} />;

      case 'saved':
        // TODO: Saved posts data source not yet implemented
        return <GenericEmpty theme={theme} label={t('view.savedSoon')} />;

      default:
        return null;
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: theme.statsBg }]}
      contentContainerStyle={{ paddingBottom: 40 }}
      showsVerticalScrollIndicator={false}
      onScroll={Animated.event(
        [{ nativeEvent: { contentOffset: { y: scrollY } } }],
        { useNativeDriver: false },
      )}
      scrollEventThrottle={16}
    >
      {/* ── Profile header ──────────────────────────────────────────────────── */}
      <ProfileHeader
        userId={profile.id}
        isOwnProfile={isOwnProfile}
        displayName={profile.display_name}
        username={profile.username}
        avatarUrl={profile.avatar_url}
        coverUrl={null}  // TODO(Task 1.8): add cover_url column to users table
        bio={profile.bio}
        isVerified={profile.is_verified}
        postCount={posts.length}
        followerCount={isOwnProfile ? followerCount : followerCount}
        followingCount={isOwnProfile ? followingCount : followingCount}
        isFollowing={isFollowing}
        isPending={isPending}
        followLoading={followLoading}
        onFollow={handleFollow}
        onUnfollow={handleUnfollow}
        onMessage={handleMessage}
        onEditProfile={handleEditProfile}
        onEditCover={handleEditCover}
        onSignOut={handleSignOut}
        theme={theme}
      />

      {/* ── Icon-only tab bar ───────────────────────────────────────────────── */}
      <View
        style={[
          styles.tabBar,
          {
            backgroundColor: theme.statsBg,
            borderTopColor: theme.statsBorder,
            borderBottomColor: theme.statsBorder,
          },
        ]}
      >
        {TABS.map((tab) => (
          <TabIcon
            key={tab.id}
            config={tab}
            isActive={activeTab === tab.id}
            theme={theme}
            onPress={() => setActiveTab(tab.id)}
          />
        ))}
      </View>

      {/* ── Tab content ─────────────────────────────────────────────────────── */}
      <View style={[styles.tabContent, { backgroundColor: theme.statsBg }]}>
        {renderTabContent()}
      </View>
    </ScrollView>
  );
}

// ── Styles (numbers only) ────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 24,
  },

  // Tab bar
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tabBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    position: 'relative',
  },
  tabUnderline: {
    position: 'absolute',
    bottom: 0,
    left: '20%',
    right: '20%',
    height: 2,
    borderRadius: 1,
  },

  // Tab content area
  tabContent: {
    minHeight: 300,
  },
  tabLoading: {
    paddingTop: 40,
    alignItems: 'center',
  },

  // Posts grid
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_GAP,
  },
  gridCell: {
    overflow: 'hidden',
  },
  textPostPlaceholder: {
    padding: 8,
    justifyContent: 'center',
  },
  textPostCaption: {
    fontSize: 10,
    lineHeight: 14,
  },

  // Places list
  placesList: {
    paddingTop: 4,
  },
  placeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  placeLogo: {
    width: 44,
    height: 44,
    borderRadius: 10,
  },
  placeLogoFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeInfo: {
    flex: 1,
    gap: 3,
  },
  placeName: {
    fontSize: 15,
    fontWeight: '600',
  },
  placeMeta: {
    fontSize: 12,
  },

  // Empty states
  emptyTab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
    paddingHorizontal: 40,
    gap: 12,
  },
  emptyTabText: {
    fontSize: 15,
    fontWeight: '500',
    textAlign: 'center',
  },
});
