/**
 * JChat 3.0 — Friends Screen (Social Fase A+B, sub-parte 2)
 *
 * Three tabs — Seguidores / Siguiendo / Solicitudes — over the RPC-backed follow
 * system (migration 040). Opened with no params it shows MY lists; opened with
 * { userId } it shows the Seguidores / Siguiendo of THAT user (read-only, no requests tab),
 * unless the account is private and I don't follow it, or there is a block between us.
 *   - Seguidores: quien me sigue → "Quitar" (remove_follower RPC).
 *   - Siguiendo:  a quién sigo    → "Dejar de seguir" (unfollowUser).
 *   - Solicitudes: pending requests to me → "Aceptar" (accept_follow_request) /
 *     "Rechazar" (reject_follow_request).
 * Tapping a row opens that user's profile.
 *
 * RLS (can_view_profile) already gates what the lists can read.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  View,
  Text,
  Image,
  Pressable,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { IconArrowLeft, IconLock, IconUser } from '@tabler/icons-react-native';
import type { MainStackParamList } from '../../navigation/AppNavigator';
import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import { useAuth } from '../../context/AuthContext';
import { canViewProfile, unfollowUser } from '../../services/users';
import { getBlockRelations } from '../../services/blocks';
import {
  listFollowers,
  listFollowing,
  listPendingRequests,
  removeFollower,
  acceptRequest,
  rejectRequest,
  type SocialUser,
  type PendingRequest,
} from '../../services/follows';

type TabId = 'followers' | 'following' | 'requests';

type TabLabelKey =
  | 'friends.tabFollowers'
  | 'friends.tabFollowing'
  | 'friends.tabRequests';

const TABS: { id: TabId; labelKey: TabLabelKey }[] = [
  { id: 'followers', labelKey: 'friends.tabFollowers' },
  { id: 'following', labelKey: 'friends.tabFollowing' },
  { id: 'requests', labelKey: 'friends.tabRequests' },
];

type EmptyCopyKey =
  | 'friends.emptyFollowers'
  | 'friends.emptyFollowing'
  | 'friends.emptyRequests'
  | 'friends.emptyOtherFollowers'
  | 'friends.emptyOtherFollowing';

/** Whether I may see the lists of the viewed user. */
type Access = 'checking' | 'ok' | 'private' | 'blocked';

// ── User row ──────────────────────────────────────────────────────────────────

interface RowAction {
  label: string;
  onPress: () => void;
  destructive?: boolean;
}

function UserRow({
  profile,
  actions,
  busy,
  onPress,
}: {
  profile: SocialUser | null;
  actions: RowAction[];
  busy: boolean;
  /** Opens the user's profile. */
  onPress?: () => void;
}) {
  const c = useThemeColors();
  const { t } = useTranslation('social');
  const name = profile?.display_name ?? profile?.username ?? t('friends.userFallback');
  const handle = profile?.username ? `@${profile.username}` : '';

  return (
    <View style={[styles.row, { borderBottomColor: c.borderSubtle }]}>
      <Pressable
        accessibilityLabel={name}
        accessibilityRole="button"
        disabled={!onPress}
        onPress={onPress}
        style={styles.rowMain}
      >
        {profile?.avatar_url ? (
          <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: c.bgElevated }]}>
            <IconUser size={20} color={c.textTertiary} />
          </View>
        )}
        <View style={styles.rowText}>
          <Text style={[styles.name, { color: c.textPrimary }]} numberOfLines={1}>
            {name}
          </Text>
          {handle ? (
            <Text style={[styles.handle, { color: c.textTertiary }]} numberOfLines={1}>
              {handle}
            </Text>
          ) : null}
        </View>
      </Pressable>
      <View style={styles.actions}>
        {busy ? (
          <ActivityIndicator size="small" color={c.brand} />
        ) : (
          actions.map((a) => (
            <Pressable
              key={a.label}
              onPress={a.onPress}
              accessibilityRole="button"
              accessibilityLabel={a.label}
              style={[
                styles.actionBtn,
                a.destructive
                  ? { borderColor: c.borderSubtle, backgroundColor: 'transparent' }
                  : { backgroundColor: c.brand },
              ]}
            >
              <Text
                style={[
                  styles.actionText,
                  { color: a.destructive ? c.textSecondary : palette.bgSurfaceLight },
                ]}
              >
                {a.label}
              </Text>
            </Pressable>
          ))
        )}
      </View>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function FriendsScreen() {
  const c = useThemeColors();
  const { t } = useTranslation('social');
  const commonTranslation = useTranslation('common');
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList, 'Friends'>>();
  const route = useRoute<RouteProp<MainStackParamList, 'Friends'>>();
  const { user } = useAuth();
  const myId = user?.id ?? null;

  // Whose lists: mine by default, or another user's when a userId is passed.
  const viewedId = route.params?.userId ?? myId;
  const isOwn = !viewedId || viewedId === myId;
  const visibleTabs = isOwn ? TABS : TABS.filter((tabItem) => tabItem.id !== 'requests');

  const requestedTab = route.params?.initialTab;
  const [tab, setTab] = useState<TabId>(
    requestedTab && visibleTabs.some((tabItem) => tabItem.id === requestedTab) ? requestedTab : 'followers',
  );
  const [followers, setFollowers] = useState<SocialUser[]>([]);
  const [following, setFollowing] = useState<SocialUser[]>([]);
  const [requests, setRequests] = useState<PendingRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [access, setAccess] = useState<Access>(isOwn ? 'ok' : 'checking');
  // Latest load wins: switching tabs quickly must not let an old answer overwrite a newer one.
  const requestRef = useRef(0);

  // Another user's lists: private accounts I don't follow (and blocks) show a notice instead.
  useEffect(() => {
    if (isOwn || !myId || !viewedId) {
      setAccess('ok');
      return;
    }
    let active = true;
    setAccess('checking');
    void (async () => {
      try {
        if (await canViewProfile(myId, viewedId)) {
          if (active) setAccess('ok');
          return;
        }
        const blockedPeople = await getBlockRelations().catch(() => new Set<string>());
        if (active) setAccess(blockedPeople.has(viewedId) ? 'blocked' : 'private');
      } catch {
        if (active) setAccess('ok'); // can't tell: RLS still decides what the lists return
      }
    })();
    return () => { active = false; };
  }, [isOwn, myId, viewedId]);

  const load = useCallback(
    async (which: TabId, asRefresh = false) => {
      if (!viewedId) return;
      const requestId = ++requestRef.current;
      if (asRefresh) setRefreshing(true); else setLoading(true);
      setLoadFailed(false);
      try {
        if (which === 'followers') {
          const rows = await listFollowers(viewedId);
          if (requestId === requestRef.current) setFollowers(rows);
        } else if (which === 'following') {
          const rows = await listFollowing(viewedId);
          if (requestId === requestRef.current) setFollowing(rows);
        } else {
          const rows = await listPendingRequests();
          if (requestId === requestRef.current) setRequests(rows);
        }
      } catch (error) {
        console.warn('[friends] load error:', error);
        if (requestId === requestRef.current) setLoadFailed(true);
      } finally {
        if (requestId === requestRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [viewedId],
  );

  useEffect(() => {
    if (access === 'ok') void load(tab);
  }, [tab, load, access]);

  // ── Actions: run, tell the user if it failed, then reload the tab ────────────
  const withBusy = useCallback(
    async (id: string, fn: () => Promise<void>, reload: TabId) => {
      if (busyId) return; // one row action at a time (double-tap guard)
      setBusyId(id);
      try {
        await fn();
      } catch (error) {
        console.warn('[friends] action error:', error);
        Alert.alert(t('friends.actionErrorTitle'), t('friends.actionError'));
      } finally {
        setBusyId(null);
        void load(reload);
      }
    },
    [busyId, load, t],
  );

  const openProfile = useCallback(
    (userId: string) => navigation.navigate('UserProfile', { userId }),
    [navigation],
  );

  const renderItem = useCallback(
    ({ item }: { item: SocialUser | PendingRequest }) => {
      if (tab === 'requests') {
        const req = item as PendingRequest;
        return (
          <UserRow
            profile={req.requester}
            busy={busyId === req.requester_id}
            onPress={() => openProfile(req.requester_id)}
            actions={[
              {
                label: t('friends.accept'),
                onPress: () =>
                  void withBusy(req.requester_id, () => acceptRequest(req.requester_id), 'requests'),
              },
              {
                label: t('friends.reject'),
                destructive: true,
                onPress: () =>
                  void withBusy(req.requester_id, () => rejectRequest(req.requester_id), 'requests'),
              },
            ]}
          />
        );
      }

      const u = item as SocialUser;
      // Another user's lists are read-only: just open the profile.
      if (!isOwn) {
        return <UserRow profile={u} busy={false} actions={[]} onPress={() => openProfile(u.id)} />;
      }
      if (tab === 'followers') {
        return (
          <UserRow
            profile={u}
            busy={busyId === u.id}
            onPress={() => openProfile(u.id)}
            actions={[
              {
                label: t('friends.remove'),
                destructive: true,
                onPress: () => void withBusy(u.id, () => removeFollower(u.id), 'followers'),
              },
            ]}
          />
        );
      }
      // following
      return (
        <UserRow
          profile={u}
          busy={busyId === u.id}
          onPress={() => openProfile(u.id)}
          actions={[
            {
              label: t('friends.unfollow'),
              destructive: true,
              onPress: () => void withBusy(u.id, () => unfollowUser(myId as string, u.id), 'following'),
            },
          ]}
        />
      );
    },
    [tab, isOwn, busyId, withBusy, openProfile, myId, t],
  );

  const data: (SocialUser | PendingRequest)[] =
    tab === 'followers' ? followers : tab === 'following' ? following : requests;

  const emptyKey: EmptyCopyKey =
    tab === 'followers'
      ? isOwn ? 'friends.emptyFollowers' : 'friends.emptyOtherFollowers'
      : tab === 'following'
        ? isOwn ? 'friends.emptyFollowing' : 'friends.emptyOtherFollowing'
        : 'friends.emptyRequests';

  const keyExtractor = useCallback(
    (item: SocialUser | PendingRequest) =>
      'requester_id' in item ? item.requester_id : item.id,
    [],
  );

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.bgBase }]} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel={commonTranslation.t('back')}
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <IconArrowLeft size={24} color={c.textPrimary} strokeWidth={2} />
        </Pressable>
        <Text style={[styles.title, { color: c.textPrimary }]}>{t('friends.title')}</Text>
      </View>

      {/* Tabs */}
      <View style={[styles.tabBar, { borderBottomColor: c.borderSubtle }]}>
        {visibleTabs.map((tabItem) => {
          const active = tabItem.id === tab;
          return (
            <Pressable
              key={tabItem.id}
              onPress={() => setTab(tabItem.id)}
              style={styles.tabItem}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.tabLabel, { color: active ? c.textPrimary : c.textTertiary }]}>
                {t(tabItem.labelKey)}
              </Text>
              <View
                style={[
                  styles.tabUnderline,
                  { backgroundColor: active ? c.brand : 'transparent' },
                ]}
              />
            </Pressable>
          );
        })}
      </View>

      {/* Body */}
      {access === 'checking' ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={c.brand} />
        </View>
      ) : access !== 'ok' ? (
        <View style={styles.center}>
          <IconLock size={42} color={c.textTertiary} />
          <Text style={[styles.empty, styles.noticeTitle, { color: c.textPrimary }]}>
            {access === 'private' ? t('friends.privateTitle') : t('friends.blockedTitle')}
          </Text>
          {access === 'private' ? (
            <Text style={[styles.empty, { color: c.textTertiary }]}>{t('friends.privateSubtitle')}</Text>
          ) : null}
        </View>
      ) : loadFailed && data.length === 0 ? (
        <View style={styles.center}>
          <Text style={[styles.empty, { color: c.textTertiary }]}>{t('friends.loadError')}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void load(tab)}
            style={[styles.retryBtn, { backgroundColor: c.brand }]}
          >
            <Text style={[styles.actionText, { color: palette.bgSurfaceLight }]}>{t('friends.retry')}</Text>
          </Pressable>
        </View>
      ) : loading && data.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={c.brand} />
        </View>
      ) : data.length === 0 ? (
        <View style={styles.center}>
          <Text style={[styles.empty, { color: c.textTertiary }]}>{t(emptyKey)}</Text>
        </View>
      ) : (
        <FlatList
          data={data}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.listContent}
          refreshControl={(
            <RefreshControl
              colors={[c.brand]}
              onRefresh={() => void load(tab, true)}
              refreshing={refreshing}
              tintColor={c.brand}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: {
    flex: 1,
    fontSize: 24,
    fontWeight: '700',
    paddingTop: 8,
    paddingBottom: 12,
  },
  tabBar: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  tabItem: { flex: 1, alignItems: 'center' },
  tabLabel: { fontSize: 14, fontWeight: '600', paddingVertical: 12 },
  tabUnderline: { height: 2, width: '60%', borderRadius: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  empty: { fontSize: 15, textAlign: 'center', marginTop: 8 },
  noticeTitle: { fontSize: 17, fontWeight: '700' },
  retryBtn: { marginTop: 16, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10 },
  listContent: { paddingBottom: 24 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  rowText: { flex: 1, marginLeft: 12 },
  name: { fontSize: 15, fontWeight: '600' },
  handle: { fontSize: 13, marginTop: 1 },
  actions: { flexDirection: 'row', gap: 8, marginLeft: 8 },
  actionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  actionText: { fontSize: 13, fontWeight: '600' },
});
