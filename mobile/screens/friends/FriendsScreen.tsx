/**
 * JChat 3.0 — Friends Screen (Social Fase A+B, sub-parte 2)
 *
 * Three tabs — Seguidores / Siguiendo / Solicitudes — over the RPC-backed follow
 * system (migration 040). Operates on the current authenticated user.
 *   - Seguidores: quien me sigue → "Quitar" (remove_follower RPC).
 *   - Siguiendo:  a quién sigo    → "Dejar de seguir" (unfollowUser).
 *   - Solicitudes: pending requests to me → "Aceptar" / "Rechazar".
 *
 * RLS (can_view_profile) already gates what the lists can read.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  Pressable,
  FlatList,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { IconUser } from '@tabler/icons-react-native';
import { useThemeColors } from '../../theme/colors';
import { useAuth } from '../../context/AuthContext';
import { unfollowUser } from '../../services/users';
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

const TABS: { id: TabId; label: string }[] = [
  { id: 'followers', label: 'Seguidores' },
  { id: 'following', label: 'Siguiendo' },
  { id: 'requests', label: 'Solicitudes' },
];

const EMPTY_COPY: Record<TabId, string> = {
  followers: 'No tienes seguidores aún.',
  following: 'Todavía no sigues a nadie.',
  requests: 'No tienes solicitudes pendientes.',
};

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
}: {
  profile: SocialUser | null;
  actions: RowAction[];
  busy: boolean;
}) {
  const c = useThemeColors();
  const name = profile?.display_name ?? profile?.username ?? 'Usuario';
  const handle = profile?.username ? `@${profile.username}` : '';

  return (
    <View style={[styles.row, { borderBottomColor: c.borderSubtle }]}>
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
                  { color: a.destructive ? c.textSecondary : '#ffffff' },
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
  const { user } = useAuth();
  const myId = user?.id ?? null;

  const [tab, setTab] = useState<TabId>('followers');
  const [followers, setFollowers] = useState<SocialUser[]>([]);
  const [following, setFollowing] = useState<SocialUser[]>([]);
  const [requests, setRequests] = useState<PendingRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(
    async (which: TabId) => {
      if (!myId) return;
      setLoading(true);
      try {
        if (which === 'followers') setFollowers(await listFollowers(myId));
        else if (which === 'following') setFollowing(await listFollowing(myId));
        else setRequests(await listPendingRequests());
      } catch {
        // Leave the current list; empty state covers the no-data case.
      } finally {
        setLoading(false);
      }
    },
    [myId],
  );

  useEffect(() => {
    void load(tab);
  }, [tab, load]);

  // ── Actions: run then reload the active tab so the UI reflects true state ────
  const withBusy = useCallback(
    async (id: string, fn: () => Promise<void>, reload: TabId) => {
      setBusyId(id);
      try {
        await fn();
        await load(reload);
      } catch {
        // swallow; the list reload reflects the true state
      } finally {
        setBusyId(null);
      }
    },
    [load],
  );

  const renderItem = useCallback(
    ({ item }: { item: SocialUser | PendingRequest }) => {
      if (tab === 'requests') {
        const req = item as PendingRequest;
        return (
          <UserRow
            profile={req.requester}
            busy={busyId === req.requester_id}
            actions={[
              {
                label: 'Aceptar',
                onPress: () =>
                  withBusy(req.requester_id, () => acceptRequest(req.requester_id), 'requests'),
              },
              {
                label: 'Rechazar',
                destructive: true,
                onPress: () =>
                  withBusy(req.requester_id, () => rejectRequest(req.requester_id), 'requests'),
              },
            ]}
          />
        );
      }

      const u = item as SocialUser;
      if (tab === 'followers') {
        return (
          <UserRow
            profile={u}
            busy={busyId === u.id}
            actions={[
              {
                label: 'Quitar',
                destructive: true,
                onPress: () => withBusy(u.id, () => removeFollower(u.id), 'followers'),
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
          actions={[
            {
              label: 'Dejar de seguir',
              destructive: true,
              onPress: () => withBusy(u.id, () => unfollowUser(myId as string, u.id), 'following'),
            },
          ]}
        />
      );
    },
    [tab, busyId, withBusy, myId],
  );

  const data: (SocialUser | PendingRequest)[] =
    tab === 'followers' ? followers : tab === 'following' ? following : requests;

  const keyExtractor = useCallback(
    (item: SocialUser | PendingRequest) =>
      'requester_id' in item ? item.requester_id : item.id,
    [],
  );

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.bgBase }]} edges={['top']}>
      <Text style={[styles.title, { color: c.textPrimary }]}>Amigos</Text>

      {/* Tabs */}
      <View style={[styles.tabBar, { borderBottomColor: c.borderSubtle }]}>
        {TABS.map((t) => {
          const active = t.id === tab;
          return (
            <Pressable
              key={t.id}
              onPress={() => setTab(t.id)}
              style={styles.tabItem}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.tabLabel, { color: active ? c.textPrimary : c.textTertiary }]}>
                {t.label}
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

      {/* List */}
      {loading && data.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={c.brand} />
        </View>
      ) : data.length === 0 ? (
        <View style={styles.center}>
          <Text style={[styles.empty, { color: c.textTertiary }]}>{EMPTY_COPY[tab]}</Text>
        </View>
      ) : (
        <FlatList
          data={data}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.listContent}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  title: {
    fontSize: 24,
    fontWeight: '700',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  tabBar: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  tabItem: { flex: 1, alignItems: 'center' },
  tabLabel: { fontSize: 14, fontWeight: '600', paddingVertical: 12 },
  tabUnderline: { height: 2, width: '60%', borderRadius: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  empty: { fontSize: 15, textAlign: 'center' },
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
