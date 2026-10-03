import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  type ListRenderItemInfo,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconArrowLeft, IconSpeakerphone } from '@tabler/icons-react-native';
import { useTranslation } from 'react-i18next';

import MegaphoneOfferCard from '../../components/megaphone/MegaphoneOfferCard';
import MegaphonePostCard from '../../components/megaphone/MegaphonePostCard';
import { useAuth } from '../../context/AuthContext';
import type { MainStackParamList } from '../../navigation/AppNavigator';
import {
  MEGAPHONE_PAGE_SIZE,
  fetchMegaphoneFeed,
  getFeedCoords,
  type MegaphoneItem,
} from '../../services/megaphone';
import { likePost, unlikePost } from '../../services/posts';
import { useThemeColors } from '../../theme/colors';
import { DEFAULT_FEED_RADIUS_MILES, formatRadius } from '../../utils/distanceUnits';

type OffersNavigation = NativeStackNavigationProp<MainStackParamList, 'Offers'>;

const itemKey = (item: MegaphoneItem) => `${item.kind}:${item.id}`;
/** Re-focusing within this window keeps the loaded pages and scroll position. */
const REFOCUS_STALE_MS = 60_000;

export default function OffersScreen() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<OffersNavigation>();
  const { user } = useAuth();
  const translation = useTranslation('offers');
  const commonTranslation = useTranslation('common');

  const radiusMiles = DEFAULT_FEED_RADIUS_MILES;
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

  /** First page. Also re-reads the position (without ever prompting for permission). */
  const loadFirst = useCallback(async () => {
    const requestId = ++requestRef.current;
    firstLoadPendingRef.current = true;
    try {
      const coords = await getFeedCoords();
      const rows = await fetchMegaphoneFeed({
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
        radiusMiles,
      });
      if (requestId !== requestRef.current) return;
      coordsRef.current = coords;
      setHasLocation(coords !== null);
      setItems(rows);
      setHasMore(rows.length === MEGAPHONE_PAGE_SIZE);
      lastLoadedAtRef.current = Date.now();
    } catch (error) {
      console.warn('[megaphone] fetch error:', error);
    } finally {
      if (requestId === requestRef.current) firstLoadPendingRef.current = false;
    }
  }, [radiusMiles]);

  useFocusEffect(
    useCallback(() => {
      if (Date.now() - lastLoadedAtRef.current < REFOCUS_STALE_MS) return;
      void loadFirst().finally(() => setLoading(false));
    }, [loadFirst]),
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await loadFirst();
    setRefreshing(false);
  }, [loadFirst]);

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
    <View style={[styles.root, { backgroundColor: colors.bgBase, paddingTop: insets.top }]}>
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
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>{translation.t('title')}</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} size="large" />
        </View>
      ) : (
        <FlatList
          contentContainerStyle={[styles.list, items.length === 0 && styles.emptyList]}
          data={items}
          keyExtractor={itemKey}
          ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.brand} style={styles.footer} /> : null}
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
  },
  backButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  headerTitle: { flex: 1, fontSize: 22, fontWeight: '700', marginLeft: 4 },
  center: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  list: { gap: 12, padding: 16, paddingBottom: 36 },
  emptyList: { flexGrow: 1 },
  footer: { paddingVertical: 16 },
  empty: { alignItems: 'center', flex: 1, gap: 10, justifyContent: 'center', paddingHorizontal: 36 },
  emptyTitle: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  emptySubtitle: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
});
