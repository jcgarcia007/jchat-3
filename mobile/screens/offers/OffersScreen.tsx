import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  type ListRenderItemInfo,
} from 'react-native';
import { Spinner } from '../../components/common/Spinner';
import { SkeletonGroup, useArrivalFade, useDelayedLoading } from '../../components/common/Skeleton';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BAR_HEIGHT } from '../../components/navigation/NotchTabBar';
import { IconArrowLeft, IconMapPin, IconSpeakerphone } from '@tabler/icons-react-native';
import { useTranslation } from 'react-i18next';

import { useHomeBarInset } from '../../components/venue/HomeBarInset';
import MegaphoneOfferCard, { MegaphoneOfferCardSkeleton } from '../../components/megaphone/MegaphoneOfferCard';
import MegaphonePostCard, { MegaphonePostCardSkeleton } from '../../components/megaphone/MegaphonePostCard';
import RadiusSheet from '../../components/megaphone/RadiusSheet';
import { useAuth } from '../../context/AuthContext';
import type { MainStackParamList } from '../../navigation/AppNavigator';
import {
  MEGAPHONE_PAGE_SIZE,
  fetchMegaphoneFeed,
  getFeedCoords,
  getLastKnownFeedCoords,
  type MegaphoneItem,
} from '../../services/megaphone';
import { haversineMeters, requestForegroundPermission } from '../../services/geofence';
import { likePost, unlikePost } from '../../services/posts';
import { loadUserSettings, updateMySettings } from '../../services/userSettings';
import { useThemeColors } from '../../theme/colors';
import {
  DEFAULT_FEED_RADIUS_MILES,
  formatRadius,
  isFeedRadiusMiles,
  type FeedRadiusMiles,
} from '../../utils/distanceUnits';
import { showAlert } from '../../utils/dialog';

type OffersNavigation = NativeStackNavigationProp<MainStackParamList, 'Offers'>;

const itemKey = (item: MegaphoneItem) => `${item.kind}:${item.id}`;
/** Re-focusing within this window keeps the loaded pages and scroll position. */
const REFOCUS_STALE_MS = 60_000;

export default function OffersScreen() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  // The venue bar floats over the top while a venue session is active: the header starts below it.
  const homeBarInset = useHomeBarInset();
  const navigation = useNavigation<OffersNavigation>();
  const { user } = useAuth();
  const translation = useTranslation('offers');
  const commonTranslation = useTranslation('common');

  // null until the saved preference is read, so the feed loads once with the right radius.
  const [savedRadius, setSavedRadius] = useState<FeedRadiusMiles | null>(null);
  const [radiusSheetOpen, setRadiusSheetOpen] = useState(false);
  const radiusMiles = savedRadius ?? DEFAULT_FEED_RADIUS_MILES;
  const [items, setItems] = useState<MegaphoneItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [hasLocation, setHasLocation] = useState(false);
  const requestRef = useRef(0);
  const coordsRef = useRef<{ lat: number; lng: number } | null>(null);
  const firstLoadPendingRef = useRef(false);
  const lastLoadedAtRef = useRef(0);
  const likesInFlightRef = useRef(new Set<string>());
  // `loading` is true only until the FIRST page has come back (refreshes use `refreshing`, and re-focusing keeps the loaded pages), so it is exactly
  // "first load without data". The skeleton shows only if that lasts 200 ms; the header and the radius chip stay on screen.
  const showSkeleton = useDelayedLoading(loading);
  const contentOpacity = useArrivalFade(loading);

  /**
   * First page. It does NOT wait for the position: it paints with the last known one (or none) and, when the
   * fresh fix arrives, refreshes in the background if it moved the feed (new coordinates or none before).
   * Never prompts for permission.
   */
  const loadFirst = useCallback(async () => {
    const requestId = ++requestRef.current;
    firstLoadPendingRef.current = true;
    const fix = getFeedCoords();
    const apply = (coords: { lat: number; lng: number } | null, rows: MegaphoneItem[]) => {
      coordsRef.current = coords;
      setHasLocation(coords !== null);
      setItems(rows);
      setHasMore(rows.length === MEGAPHONE_PAGE_SIZE);
      lastLoadedAtRef.current = Date.now();
    };
    try {
      const initial = coordsRef.current ?? (await getLastKnownFeedCoords());
      const rows = await fetchMegaphoneFeed({ lat: initial?.lat ?? null, lng: initial?.lng ?? null, radiusMiles });
      if (requestId !== requestRef.current) return;
      apply(initial, rows);

      // Background refresh once the fresh fix is in (not awaited: pull-to-refresh and the spinner end now).
      void fix.then(async (fresh) => {
        if (!fresh || requestId !== requestRef.current) return;
        const moved = !initial || haversineMeters(initial.lat, initial.lng, fresh.lat, fresh.lng) > 250;
        if (!moved) return;
        try {
          const freshRows = await fetchMegaphoneFeed({ lat: fresh.lat, lng: fresh.lng, radiusMiles });
          if (requestId === requestRef.current) apply(fresh, freshRows);
        } catch (error) {
          console.warn('[megaphone] refresh with fresh position failed:', error);
        }
      });
    } catch (error) {
      console.warn('[megaphone] fetch error:', error);
    } finally {
      if (requestId === requestRef.current) firstLoadPendingRef.current = false;
    }
  }, [radiusMiles]);

  // B.1: read the saved radius (default 50 when missing or on any failure).
  useEffect(() => {
    let active = true;
    const done = (radius: FeedRadiusMiles) => { if (active) setSavedRadius(radius); };
    if (!user?.id) {
      done(DEFAULT_FEED_RADIUS_MILES);
      return () => { active = false; };
    }
    loadUserSettings(user.id)
      .then((settings) => done(isFeedRadiusMiles(settings.feedRadiusMiles) ? settings.feedRadiusMiles : DEFAULT_FEED_RADIUS_MILES))
      .catch(() => done(DEFAULT_FEED_RADIUS_MILES));
    return () => { active = false; };
  }, [user?.id]);

  // B.2: save the new radius (rolls back with an alert if it fails); the feed reloads.
  const selectRadius = useCallback(async (next: FeedRadiusMiles) => {
    setRadiusSheetOpen(false);
    if (next === radiusMiles) return;
    const previous = radiusMiles;
    lastLoadedAtRef.current = 0; // force the reload for the new radius
    setSavedRadius(next);
    try {
      await updateMySettings({ feedRadiusMiles: next });
    } catch (error) {
      console.warn('[megaphone] radius save error:', error);
      lastLoadedAtRef.current = 0;
      setSavedRadius(previous);
      showAlert(translation.t('radiusSaveErrorTitle'), translation.t('radiusSaveErrorMessage'));
    }
  }, [radiusMiles, translation]);

  useFocusEffect(
    useCallback(() => {
      if (savedRadius === null) return;
      if (Date.now() - lastLoadedAtRef.current < REFOCUS_STALE_MS) return;
      void loadFirst().finally(() => setLoading(false));
    }, [loadFirst, savedRadius]),
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await loadFirst();
    setRefreshing(false);
  }, [loadFirst]);

  // Web only: the feed never prompts, so without a position the person can ask for it from a tap (the browser's prompt
  // needs a gesture). Denied → the hint stays and the radius chip keeps working (the feed shows what has no distance).
  const isWeb = Platform.OS === 'web';
  const allowLocation = useCallback(async () => {
    await requestForegroundPermission();
    lastLoadedAtRef.current = 0;
    await refresh();
  }, [refresh]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || items.length === 0 || firstLoadPendingRef.current) return;
    const requestId = requestRef.current;
    setLoadingMore(true);
    try {
      const coords = coordsRef.current;
      const rows = await fetchMegaphoneFeed({
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
        radiusMiles,
        before: items[items.length - 1].created_at,
      });
      if (requestId !== requestRef.current) return;
      setItems((previous) => {
        const seen = new Set(previous.map(itemKey));
        return [...previous, ...rows.filter((row) => !seen.has(itemKey(row)))];
      });
      setHasMore(rows.length === MEGAPHONE_PAGE_SIZE);
    } catch (error) {
      console.warn('[megaphone] load more error:', error);
      setHasMore(false); // stop the auto-retry loop; pull-to-refresh starts over
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, items, loadingMore, radiusMiles]);

  const enterBusiness = useCallback((item: MegaphoneItem) => {
    navigation.navigate('ChatRoom', { id: item.room_id ?? item.business_id });
  }, [navigation]);

  const openComments = useCallback((item: MegaphoneItem) => {
    navigation.navigate('PostDetail', { postId: item.id });
  }, [navigation]);

  /** Optimistic like / unlike; rolls back to the previous values if the request fails. */
  const toggleLike = useCallback(async (item: MegaphoneItem) => {
    if (!user?.id) return;
    const key = itemKey(item);
    if (likesInFlightRef.current.has(key)) return; // one request per post at a time
    likesInFlightRef.current.add(key);
    const nextLiked = item.liked_by_me !== true;
    const apply = (liked: boolean, count: number) => setItems((previous) => previous.map((row) => (
      itemKey(row) === itemKey(item) ? { ...row, liked_by_me: liked, like_count: count } : row
    )));
    const previousLiked = item.liked_by_me === true;
    const previousCount = item.like_count ?? 0;

    apply(nextLiked, Math.max(0, previousCount + (nextLiked ? 1 : -1)));
    try {
      if (nextLiked) await likePost(item.id, user.id);
      else await unlikePost(item.id, user.id);
    } catch (error) {
      console.warn('[megaphone] like error:', error);
      apply(previousLiked, previousCount);
    } finally {
      likesInFlightRef.current.delete(key);
    }
  }, [user?.id]);

  const renderItem = useCallback(({ item }: ListRenderItemInfo<MegaphoneItem>) => (
    item.kind === 'post' ? (
      <MegaphonePostCard
        item={item}
        onEnter={enterBusiness}
        onOpenComments={openComments}
        onToggleLike={(post) => { void toggleLike(post); }}
      />
    ) : (
      <MegaphoneOfferCard item={item} onEnter={enterBusiness} />
    )
  ), [enterBusiness, openComments, toggleLike]);

  return (
    <View style={[styles.root, { backgroundColor: colors.bgBase, paddingTop: insets.top + homeBarInset }]}>
      <View style={[styles.header, { borderBottomColor: colors.borderSubtle }]}>
        <Pressable
          accessibilityLabel={commonTranslation.t('back')}
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <IconArrowLeft size={24} color={colors.textPrimary} strokeWidth={2} />
        </Pressable>
        <Text adjustsFontSizeToFit minimumFontScale={0.5} numberOfLines={2} style={[styles.headerTitle, { color: colors.textPrimary }]}>{translation.t('title')}</Text>
        <Pressable
          accessibilityLabel={translation.t('radiusChipA11y', { radius: formatRadius(radiusMiles) })}
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => setRadiusSheetOpen(true)}
          style={[styles.radiusChip, { backgroundColor: colors.brandLight }]}
        >
          <IconMapPin size={15} color={colors.brandText} strokeWidth={2.2} />
          <Text style={[styles.radiusChipText, { color: colors.brand }]}>{formatRadius(radiusMiles)}</Text>
        </Pressable>
      </View>

      <RadiusSheet
        onClose={() => setRadiusSheetOpen(false)}
        onSelect={(miles) => { void selectRadius(miles); }}
        value={radiusMiles}
        visible={radiusSheetOpen}
      />

      {loading ? (
        showSkeleton ? (
          // One post card (header + 4:5 photo) and two offer cards, in the list's own padding and gap.
          <View style={styles.skeletonViewport}>
            <SkeletonGroup style={styles.skeletonList} testID="offers-skeleton">
              <MegaphonePostCardSkeleton />
              <MegaphoneOfferCardSkeleton />
              <MegaphoneOfferCardSkeleton />
            </SkeletonGroup>
          </View>
        ) : (
          <View style={styles.center} />
        )
      ) : (
        <Animated.View needsOffscreenAlphaCompositing style={[styles.contentArea, { opacity: contentOpacity }]}>
        <FlatList
          contentContainerStyle={[styles.list, items.length === 0 && styles.emptyList, { paddingBottom: 26 + insets.bottom + (isWeb ? 0 : BAR_HEIGHT + 16) }]}
          data={items}
          ListHeaderComponent={isWeb && !hasLocation ? (
            <View testID="web-offers-location" style={[styles.locationHint, { backgroundColor: colors.bgSurface, borderColor: colors.borderSubtle }]}>
              <IconMapPin size={20} color={colors.textSecondary} strokeWidth={2} />
              <Text style={[styles.locationHintText, { color: colors.textSecondary }]}>{translation.t('webLocationHint')}</Text>
              <Pressable
                testID="web-offers-allow-location"
                accessibilityRole="button"
                onPress={() => { void allowLocation(); }}
                style={[styles.locationButton, { backgroundColor: colors.brandLight }]}
              >
                <Text style={[styles.locationButtonText, { color: colors.brand }]}>{translation.t('webAllowLocation')}</Text>
              </Pressable>
            </View>
          ) : null}
          keyExtractor={itemKey}
          ListFooterComponent={loadingMore ? <Spinner color={colors.brandText} style={styles.footer} /> : null}
          onEndReached={() => { void loadMore(); }}
          onEndReachedThreshold={0.5}
          renderItem={renderItem}
          refreshControl={(
            <RefreshControl
              colors={[colors.brand]}
              onRefresh={() => { void refresh(); }}
              refreshing={refreshing}
              tintColor={colors.brand}
            />
          )}
          ListEmptyComponent={(
            <View style={styles.empty}>
              <IconSpeakerphone size={46} color={colors.textTertiary} strokeWidth={1.5} />
              <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
                {hasLocation
                  ? translation.t('emptyNearTitle', { radius: formatRadius(radiusMiles) })
                  : translation.t('emptyTitle')}
              </Text>
              <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                {hasLocation ? translation.t('emptyNearSubtitle') : translation.t('emptySubtitle')}
              </Text>
            </View>
          )}
        />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 58,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  backButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  headerTitle: { flex: 1, fontSize: 22, fontWeight: '700', marginLeft: 4 },
  radiusChip: { alignItems: 'center', borderRadius: 16, flexDirection: 'row', gap: 4, paddingHorizontal: 12, paddingVertical: 7 },
  radiusChipText: { fontSize: 13, fontWeight: '700' },
  center: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  contentArea: { flex: 1 },
  skeletonViewport: { flex: 1, overflow: 'hidden' },
  skeletonList: { gap: 12, padding: 16 },
  list: { gap: 12, padding: 16, paddingBottom: 36 },
  emptyList: { flexGrow: 1 },
  footer: { paddingVertical: 16 },
  empty: { alignItems: 'center', flex: 1, gap: 10, justifyContent: 'center', paddingHorizontal: 36 },
  emptyTitle: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  emptySubtitle: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  locationHint: { alignItems: 'center', borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, gap: 8, marginBottom: 4, padding: 14 },
  locationHintText: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  locationButton: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8 },
  locationButtonText: { fontSize: 13, fontWeight: '700' },
});
