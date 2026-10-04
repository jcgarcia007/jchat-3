/**
 * JChat 3.0 — "My activity" (Fase D6)
 *
 * Three tabs backed by match_get_activity: My likes (I can delete one or all — deleting a like
 * that produced a match removes that match silently), Liked me (who, Super Likes first and
 * highlighted) and Matches (open the chat or delete the match). Every row links to the person's
 * Match profile. Everything here is erased when leaving the venue.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { IconArrowLeft, IconMessageCircle, IconTrash, IconUser } from '@tabler/icons-react-native';

import type { MainStackParamList } from '../../navigation/AppNavigator';
import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import {
  clearLikes,
  deleteLike,
  deleteMatch,
  getMatchActivity,
} from '../../services/matchDeck';
import type { MatchActivity } from '../../services/matchDeck';
import { signedPhotoUrls } from '../../services/matchProfile';
import { cardName } from '../../services/matchTypes';
import type { MatchCard } from '../../services/matchTypes';

type Nav = NativeStackNavigationProp<MainStackParamList, 'MatchActivity'>;
type Tab = 'likes' | 'likedMe' | 'matches';

interface Row {
  key: string;
  user: MatchCard;
  isSuper: boolean;
  createdAt: string;
  swipeId?: string;
  matchId?: string;
  conversationId?: string | null;
}

function timeLabel(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function MatchActivityScreen() {
  const c = useThemeColors();
  const { t } = useTranslation('match');
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<MainStackParamList, 'MatchActivity'>>();

  const [tab, setTab] = useState<Tab>(params.tab ?? 'likes');
  const [activity, setActivity] = useState<MatchActivity | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const a = await getMatchActivity(params.businessId);
      setActivity(a);
      const firstPhotos = [...a.likes_given, ...a.liked_me, ...a.matches].flatMap((r) => r.user.photos.slice(0, 1));
      setUrls(await signedPhotoUrls(firstPhotos));
    } catch {
      Alert.alert(t('activity.loadError'));
    } finally {
      setLoading(false);
    }
  }, [params.businessId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows: Row[] = !activity
    ? []
    : tab === 'likes'
      ? activity.likes_given.map((r) => ({
          key: r.swipe_id,
          user: r.user,
          isSuper: r.action === 'super',
          createdAt: r.created_at,
          swipeId: r.swipe_id,
        }))
      : tab === 'likedMe'
        ? [...activity.liked_me]
            // Super Likes first, then most recent.
            .sort((a, b) => Number(b.action === 'super') - Number(a.action === 'super') || b.created_at.localeCompare(a.created_at))
            .map((r) => ({ key: `${r.user.id}-${r.created_at}`, user: r.user, isSuper: r.action === 'super', createdAt: r.created_at }))
        : activity.matches.map((r) => ({
            key: r.match_id,
            user: r.user,
            isSuper: r.is_super,
            createdAt: r.created_at,
            matchId: r.match_id,
            conversationId: r.conversation_id,
          }));

  const run = useCallback(
    async (action: () => Promise<void>) => {
      setBusy(true);
      try {
        await action();
        await load();
      } catch {
        Alert.alert(t('activity.actionError'));
      } finally {
        setBusy(false);
      }
    },
    [load, t],
  );

  const confirmDeleteLike = useCallback(
    (row: Row) => {
      if (!row.swipeId) return;
      const swipeId = row.swipeId;
      Alert.alert(t('activity.deleteLikeTitle'), t('activity.deleteLikeBody'), [
        { text: t('menu.cancel'), style: 'cancel' },
        { text: t('activity.delete'), style: 'destructive', onPress: () => void run(() => deleteLike(swipeId)) },
      ]);
    },
    [run, t],
  );

  const confirmClearAll = useCallback(() => {
    Alert.alert(t('activity.clearAllTitle'), t('activity.clearAllBody'), [
      { text: t('menu.cancel'), style: 'cancel' },
      { text: t('activity.clearAll'), style: 'destructive', onPress: () => void run(() => clearLikes(params.businessId)) },
    ]);
  }, [params.businessId, run, t]);

  const confirmDeleteMatch = useCallback(
    (row: Row) => {
      if (!row.matchId) return;
      const matchId = row.matchId;
      Alert.alert(t('activity.deleteMatchTitle'), t('activity.deleteMatchBody'), [
        { text: t('menu.cancel'), style: 'cancel' },
        { text: t('activity.delete'), style: 'destructive', onPress: () => void run(() => deleteMatch(matchId)) },
      ]);
    },
    [run, t],
  );

  const openChat = useCallback(
    (row: Row) => {
      if (!row.conversationId) return;
      navigation.navigate('DMs', { screen: 'DMChat', params: { conversationId: row.conversationId, otherUserId: row.user.id } });
    },
    [navigation],
  );

  const openProfile = useCallback(
    (row: Row) => {
      navigation.navigate('MatchProfile', {
        businessId: params.businessId,
        userId: row.user.id,
        businessName: params.businessName,
        card: row.user,
      });
    },
    [navigation, params.businessId, params.businessName],
  );

  const tabs: { key: Tab; label: string }[] = [
    { key: 'likes', label: t('activity.tabs.likes') },
    { key: 'likedMe', label: t('activity.tabs.likedMe') },
    { key: 'matches', label: t('activity.tabs.matches') },
  ];

  const renderRow = ({ item }: { item: Row }) => {
    const name = cardName(item.user) ?? t('card.unknownName');
    const photo = item.user.photos[0] ? urls[item.user.photos[0]] : null;
    return (
      <View
        style={[
          styles.row,
          { backgroundColor: c.bgElevated, borderColor: item.isSuper ? c.brand : c.borderSubtle },
          item.isSuper && styles.rowSuper,
        ]}
      >
        <Pressable
          onPress={() => openProfile(item)}
          accessibilityRole="button"
          accessibilityLabel={t('activity.openProfile', { name })}
          style={styles.rowMain}
        >
          <View style={[styles.avatar, { backgroundColor: c.bgSurface }]}>
            {photo ? (
              <Image source={{ uri: photo }} style={StyleSheet.absoluteFill} contentFit="cover" />
            ) : (
              <IconUser size={24} color={c.textTertiary} />
            )}
          </View>
          <View style={styles.rowTexts}>
            <Text style={[styles.rowName, { color: c.textPrimary }]} numberOfLines={1}>
              {name}
            </Text>
            <View style={styles.rowMeta}>
              {item.isSuper && (
                <View style={[styles.superPill, { backgroundColor: c.brand }]}>
                  <Text style={[styles.superPillText, { color: palette.onBrand }]}>{t('card.superLikedMe')}</Text>
                </View>
              )}
              <Text style={[styles.rowTime, { color: c.textTertiary }]}>{timeLabel(item.createdAt)}</Text>
            </View>
          </View>
        </Pressable>

        {tab === 'likes' && (
          <Pressable
            onPress={() => confirmDeleteLike(item)}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={t('activity.deleteLikeA11y', { name })}
            style={styles.iconBtn}
          >
            <IconTrash size={20} color={c.danger} />
          </Pressable>
        )}
        {tab === 'matches' && (
          <>
            <Pressable
              onPress={() => openChat(item)}
              disabled={!item.conversationId}
              accessibilityRole="button"
              accessibilityLabel={t('activity.openChatA11y', { name })}
              style={[styles.iconBtn, { opacity: item.conversationId ? 1 : 0.4 }]}
            >
              <IconMessageCircle size={22} color={c.brand} />
            </Pressable>
            <Pressable
              onPress={() => confirmDeleteMatch(item)}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={t('activity.deleteMatchA11y', { name })}
              style={styles.iconBtn}
            >
              <IconTrash size={20} color={c.danger} />
            </Pressable>
          </>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: c.bgBase }]}>
      <View style={[styles.header, { borderBottomColor: c.borderSubtle }]}>
        <Pressable
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel={t('home.back')}
          hitSlop={10}
          style={styles.iconBtn}
        >
          <IconArrowLeft size={22} color={c.textPrimary} />
        </Pressable>
        <Text style={[styles.title, { color: c.textPrimary }]} accessibilityRole="header">
          {t('activity.title')}
        </Text>
        <View style={styles.iconBtn} />
      </View>

      <View style={[styles.tabs, { borderBottomColor: c.borderSubtle }]} accessibilityRole="tablist">
        {tabs.map((item) => {
          const active = tab === item.key;
          return (
            <Pressable
              key={item.key}
              onPress={() => setTab(item.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              style={[styles.tab, active && { borderBottomColor: c.brand }]}
            >
              <Text style={[styles.tabText, { color: active ? c.brand : c.textSecondary }]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={c.brand} />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(row) => row.key}
          renderItem={renderRow}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            tab === 'likes' && rows.length > 0 ? (
              <Pressable
                onPress={confirmClearAll}
                disabled={busy}
                accessibilityRole="button"
                style={styles.clearAll}
              >
                <Text style={[styles.clearAllText, { color: c.danger }]}>{t('activity.clearAll')}</Text>
              </Pressable>
            ) : null
          }
          ListEmptyComponent={
            <Text style={[styles.empty, { color: c.textSecondary }]}>{t(`activity.empty.${tab}`)}</Text>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    minHeight: 52,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconBtn: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '700' },
  tabs: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  tab: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 3, borderBottomColor: 'transparent' },
  tabText: { fontSize: 14, fontWeight: '700' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 16, gap: 10 },
  clearAll: { alignSelf: 'flex-end', minHeight: 44, justifyContent: 'center', marginBottom: 4 },
  clearAllText: { fontSize: 14, fontWeight: '700' },
  empty: { textAlign: 'center', fontSize: 14, lineHeight: 20, marginTop: 32, paddingHorizontal: 24 },
  row: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 16, paddingRight: 4 },
  rowSuper: { borderWidth: 2 },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, minHeight: 64 },
  avatar: { width: 48, height: 48, borderRadius: 24, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  rowTexts: { flex: 1, gap: 2 },
  rowName: { fontSize: 16, fontWeight: '700' },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowTime: { fontSize: 12 },
  superPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  superPillText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },
});
