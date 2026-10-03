/**
 * JChat 3.0 — Blocked users (Settings → Privacy).
 *
 * Lists the caller's own blocks (services/blocks.listBlocked: blocks RLS + public_profiles)
 * with photo and name, and lets the user unblock one after a confirmation (unblock_user RPC).
 * Never shows an email: the name is display_name, falling back to @username.
 */

import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { IconChevronLeft, IconUser } from '@tabler/icons-react-native';

import { palette } from '../../theme/tokens';
import { useThemeColors } from '../../theme/colors';
import { listBlocked, unblockUser } from '../../services/blocks';
import type { SocialUser } from '../../services/follows';

export default function BlockedUsersScreen() {
  const c = useThemeColors();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation('settings');
  const { t: tc } = useTranslation('common');
  const navigation = useNavigation();

  const [users, setUsers] = useState<SocialUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      setUsers(await listBlocked());
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const nameOf = useCallback(
    (u: SocialUser) => u.display_name?.trim() || (u.username ? `@${u.username}` : t('blockedUsers.unknownUser')),
    [t],
  );

  const confirmUnblock = useCallback(
    (u: SocialUser) => {
      const name = nameOf(u);
      Alert.alert(t('blockedUsers.confirmTitle', { name }), t('blockedUsers.confirmMessage'), [
        { text: tc('actions.cancel'), style: 'cancel' },
        {
          text: t('blockedUsers.unblock'),
          onPress: () => {
            setBusyId(u.id);
            unblockUser(u.id)
              .then(() => setUsers((prev) => prev.filter((x) => x.id !== u.id)))
              .catch(() => Alert.alert(t('blockedUsers.errorTitle'), t('blockedUsers.errorMessage')))
              .finally(() => setBusyId(null));
          },
        },
      ]);
    },
    [nameOf, t, tc],
  );

  const renderItem = useCallback(
    ({ item }: { item: SocialUser }) => (
      <View style={[styles.row, { borderBottomColor: c.borderSubtle }]}>
        {item.avatar_url ? (
          <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: c.bgElevated }]}>
            <IconUser size={20} color={c.textTertiary} />
          </View>
        )}
        <View style={styles.rowText}>
          <Text style={[styles.name, { color: c.textPrimary }]} numberOfLines={1}>
            {nameOf(item)}
          </Text>
          {item.display_name && item.username ? (
            <Text style={[styles.handle, { color: c.textTertiary }]} numberOfLines={1}>
              @{item.username}
            </Text>
          ) : null}
        </View>
        <Pressable
          onPress={() => confirmUnblock(item)}
          disabled={busyId === item.id}
          style={[styles.unblockBtn, { borderColor: c.brand, opacity: busyId === item.id ? 0.5 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel={t('blockedUsers.unblockA11y', { name: nameOf(item) })}
        >
          {busyId === item.id ? (
            <ActivityIndicator size="small" color={c.brand} />
          ) : (
            <Text style={[styles.unblockLabel, { color: c.brand }]}>{t('blockedUsers.unblock')}</Text>
          )}
        </Pressable>
      </View>
    ),
    [busyId, c, confirmUnblock, nameOf, t],
  );

  return (
    <View style={[styles.screen, { backgroundColor: c.bgBase }]}>
      <StatusBar barStyle={c.bgBase === palette.bgBase ? 'light-content' : 'dark-content'} />
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + 12, backgroundColor: c.bgBase, borderBottomColor: c.borderSubtle },
        ]}
      >
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel={tc('back')}
        >
          <IconChevronLeft size={24} color={c.brand} strokeWidth={2} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: c.textPrimary }]}>{t('blockedUsers.title')}</Text>
      </View>

      {loading && users.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={c.brand} />
        </View>
      ) : failed ? (
        <View style={styles.center}>
          <Text style={[styles.message, { color: c.textSecondary }]}>{t('blockedUsers.loadError')}</Text>
          <Pressable
            onPress={() => void load()}
            style={[styles.retry, { borderColor: c.brand }]}
            accessibilityRole="button"
          >
            <Text style={[styles.retryLabel, { color: c.brand }]}>{tc('actions.retry')}</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={(u) => u.id}
          renderItem={renderItem}
          contentContainerStyle={users.length === 0 ? styles.emptyContainer : styles.list}
          ListEmptyComponent={
            <Text style={[styles.message, { color: c.textTertiary }]}>{t('blockedUsers.empty')}</Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: { marginRight: 8, padding: 4 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '600' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  list: { paddingHorizontal: 16, paddingBottom: 40 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1 },
  name: { fontSize: 15, fontWeight: '600' },
  handle: { fontSize: 13, marginTop: 2 },
  unblockBtn: {
    minWidth: 96,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  unblockLabel: { fontSize: 13, fontWeight: '600' },
  message: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  retry: { marginTop: 16, height: 44, borderRadius: 12, borderWidth: 1, paddingHorizontal: 24, alignItems: 'center', justifyContent: 'center' },
  retryLabel: { fontSize: 15, fontWeight: '600' },
});
