/**
 * JChat 3.0 — DM Inbox Screen (Task 1.12)
 *
 * Shows a list of all direct-message conversations for the current user.
 * Each row displays:
 *   - Avatar (initials fallback)
 *   - Display name / username
 *   - Last-message preview
 *   - Relative timestamp
 *   - Unread badge (count of unread messages)
 *
 * Pull-to-refresh reloads conversations.
 * Realtime: subscribes to dm_messages INSERT events to keep previews live;
 * unsubscribes on unmount.
 *
 * TODO(Task 1.13/1.15): filter blocked users + respect DM-permission setting.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RealtimeChannel } from '@supabase/supabase-js';

import { useAuth } from '../../context/AuthContext';
import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import { supabase, isSupabaseConfigured } from '../../services/supabase';
import {
  listConversations,
  type ConversationPreview,
} from '../../services/dms';
import type { DMStackParamList } from '../../navigation/DMStack';

// ─── Nav type ────────────────────────────────────────────────────────────────

type InboxNav = NativeStackNavigationProp<DMStackParamList, 'DMInbox'>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function initials(name: string | null, username: string): string {
  const src = name ?? username;
  return src
    .split(/\s+/)
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function relativeTime(iso: string | null, nowLabel: string): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return nowLabel;
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

// ─── Row component ───────────────────────────────────────────────────────────

interface RowProps {
  item: ConversationPreview;
  onPress: () => void;
}

function ConversationRow({ item, onPress }: RowProps) {
  const c = useThemeColors();
  const { t } = useTranslation('social');
  const { otherUser, lastMessageBody, lastMessageAt, unreadCount } = item;
  const name = otherUser.display_name ?? otherUser.username;
  const hasUnread = unreadCount > 0;

  return (
    <TouchableOpacity
      style={[styles.row, { borderBottomColor: c.borderSubtle }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {/* Avatar */}
      <View style={[styles.avatar, { backgroundColor: palette.brandLight }]}>
        {otherUser.avatar_url ? (
          // Using initials as fallback; real image would need expo-image
          <Text style={[styles.avatarInitials, { color: palette.brand }]}>
            {initials(otherUser.display_name, otherUser.username)}
          </Text>
        ) : (
          <Text style={[styles.avatarInitials, { color: palette.brand }]}>
            {initials(otherUser.display_name, otherUser.username)}
          </Text>
        )}
      </View>

      {/* Content */}
      <View style={styles.rowContent}>
        <View style={styles.rowTop}>
          <Text
            style={[
              styles.rowName,
              {
                color: c.textPrimary,
                fontWeight: hasUnread ? '700' : '500',
              },
            ]}
            numberOfLines={1}
          >
            {name}
          </Text>
          <Text style={[styles.rowTime, { color: c.textTertiary }]}>
            {relativeTime(lastMessageAt, t('inbox.now'))}
          </Text>
        </View>

        <View style={styles.rowBottom}>
          <Text
            style={[
              styles.rowPreview,
              {
                color: hasUnread ? c.textPrimary : c.textSecondary,
                fontWeight: hasUnread ? '500' : '400',
              },
            ]}
            numberOfLines={1}
          >
            {lastMessageBody ?? t('inbox.noMessagesYet')}
          </Text>
          {hasUnread && (
            <View style={[styles.badge, { backgroundColor: palette.brand }]}>
              <Text style={styles.badgeText}>
                {unreadCount > 99 ? '99+' : String(unreadCount)}
              </Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function DMInboxScreen() {
  const c = useThemeColors();
  const { t } = useTranslation('social');
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<InboxNav>();
  const { user } = useAuth();

  const [conversations, setConversations] = useState<ConversationPreview[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);

  // ── Data fetch ──────────────────────────────────────────────────────────────

  const fetchConversations = useCallback(async () => {
    if (!user) return;
    try {
      const data = await listConversations(user.id);
      setConversations(data);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[DMInbox] fetch error', err);
    }
  }, [user]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchConversations();
    setRefreshing(false);
  }, [fetchConversations]);

  // ── Initial load ────────────────────────────────────────────────────────────

  useEffect(() => {
    fetchConversations().finally(() => setLoading(false));
  }, [fetchConversations]);

  // ── Realtime subscription ────────────────────────────────────────────────────

  useEffect(() => {
    if (!isSupabaseConfigured || !user) return;

    const channel = supabase
      .channel(`dm_inbox_${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'dm_messages' },
        () => {
          // Re-fetch previews on any new message (keeps unread count + preview fresh)
          fetchConversations();
        },
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      // Unsubscribe on unmount
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, [user, fetchConversations]);

  // ── Navigation ──────────────────────────────────────────────────────────────

  const openChat = useCallback(
    (item: ConversationPreview) => {
      navigation.navigate('DMChat', {
        conversationId: item.id,
        otherUserId: item.otherUser.id,
      });
    },
    [navigation],
  );

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: c.bgBase, paddingTop: insets.top },
      ]}
    >
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: c.borderSubtle }]}>
        <Text style={[styles.headerTitle, { color: c.textPrimary }]}>
          {t('inbox.title')}
        </Text>
      </View>

      {/* List */}
      {loading && conversations.length === 0 ? (
        <View style={styles.center}>
          <Text style={[styles.emptyText, { color: c.textTertiary }]}>
            {t('state.loading', { ns: 'common' })}
          </Text>
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ConversationRow item={item} onPress={() => openChat(item)} />
          )}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={palette.brand}
            />
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={[styles.emptyText, { color: c.textTertiary }]}>
                {t('inbox.empty')}
              </Text>
            </View>
          }
          contentContainerStyle={
            conversations.length === 0 ? styles.emptyContainer : undefined
          }
        />
      )}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarInitials: {
    fontSize: 18,
    fontWeight: '700',
  },
  rowContent: {
    flex: 1,
  },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  rowName: {
    fontSize: 16,
    flex: 1,
    marginRight: 8,
  },
  rowTime: {
    fontSize: 12,
  },
  rowBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowPreview: {
    fontSize: 14,
    flex: 1,
    marginRight: 8,
  },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyContainer: {
    flexGrow: 1,
  },
  emptyText: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
});
