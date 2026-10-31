import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  Animated,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import SwipeToDelete from '../common/SwipeToDelete';
import { Skeleton, SkeletonGroup, useArrivalFade, useDelayedLoading } from '../common/Skeleton';
import { useAuth } from '../../context/AuthContext';
import {
  hideConversation,
  listConversations,
  type ConversationPreview,
} from '../../services/dms';
import { isSupabaseConfigured, supabase, channelTopic } from '../../services/supabase';
import { subscribeBlockChanges } from '../../services/blocks';
import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import { formatSocialTime } from '../../utils/formatSocialTime';
import { getInitials } from '../../utils/initials';
import { confirm, showAlert } from '../../utils/dialog';

interface ConversationListProps {
  contentContainerStyle?: StyleProp<ViewStyle>;
  nestedScrollEnabled?: boolean;
  onConversationPress: (conversation: ConversationPreview) => void;
  onUnreadCountChange?: (count: number) => void;
}

function initials(name: string | null, username: string): string {
  return getInitials(name ?? username, 2);
}

/** Six placeholder rows with the SAME padding, avatar and borders as a real row (so nothing jumps when the data arrives). */
function ConversationSkeleton() {
  const colors = useThemeColors();
  return (
    <SkeletonGroup testID="dm-list-skeleton">
      {Array.from({ length: 6 }).map((_, index) => (
        <View key={index} style={[styles.row, { backgroundColor: colors.bgSurface, borderBottomColor: colors.borderSubtle }]}>
          <Skeleton circle height={48} style={styles.skeletonAvatar} />
          <View style={styles.rowContent}>
            <Skeleton width="55%" height={12} style={styles.skeletonName} />
            <Skeleton width="85%" height={10} />
          </View>
        </View>
      ))}
    </SkeletonGroup>
  );
}

function ConversationRow({
  conversation,
  onPress,
}: {
  conversation: ConversationPreview;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  const translation = useTranslation('social');
  const { otherUser, lastMessageBody, lastMessageKind, lastMessageAt, unreadCount, matchBusinessName } = conversation;
  const previewText =
    lastMessageKind === 'photo' ? translation.t('inbox.previewPhoto')
    : lastMessageKind === 'voice' ? translation.t('inbox.previewVoice')
    : lastMessageKind === 'gift' ? translation.t('inbox.previewGift')
    : lastMessageBody ?? translation.t('inbox.noMessagesYet');
  const hasUnread = unreadCount > 0;

  return (
    <TouchableOpacity
      testID={`dm-row-${otherUser.id}`}
      activeOpacity={0.7}
      onPress={onPress}
      style={[
        styles.row,
        {
          backgroundColor: colors.bgSurface,
          borderBottomColor: colors.borderSubtle,
        },
      ]}
    >
      <View style={[styles.avatar, { backgroundColor: colors.brandLight }]}>
        <Text style={[styles.avatarInitials, { color: colors.brandText }]}>
          {initials(otherUser.display_name, otherUser.username)}
        </Text>
      </View>
      <View style={styles.rowContent}>
        <View style={styles.rowTop}>
          <Text
            numberOfLines={1}
            style={[styles.rowName, { color: colors.textPrimary, fontWeight: hasUnread ? '700' : '500' }]}
          >
            {otherUser.display_name ?? otherUser.username}
          </Text>
          <Text style={[styles.rowTime, { color: colors.textTertiary }]}>
            {formatSocialTime(lastMessageAt, translation.i18n.language, translation.t)}
          </Text>
        </View>
        {matchBusinessName != null && (
          <Text numberOfLines={1} style={[styles.matchTag, { color: colors.brandText }]}>
            {matchBusinessName
              ? translation.t('chat.listTag', { ns: 'match', business: matchBusinessName })
              : translation.t('chat.listTagShort', { ns: 'match' })}
          </Text>
        )}
        <View style={styles.rowBottom}>
          <Text
            numberOfLines={1}
            style={[styles.rowPreview, { color: hasUnread ? colors.textPrimary : colors.textSecondary, fontWeight: hasUnread ? '500' : '400' }]}
          >
            {previewText}
          </Text>
          {hasUnread ? (
            <View style={[styles.badge, { backgroundColor: colors.brandFill }]}>
              <Text style={[styles.badgeText, { color: palette.bgSurfaceLight }]}>
                {unreadCount > 99 ? '99+' : String(unreadCount)}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function ConversationList({
  contentContainerStyle,
  nestedScrollEnabled = false,
  onConversationPress,
  onUnreadCountChange,
}: ConversationListProps) {
  const colors = useThemeColors();
  const translation = useTranslation('social');
  const { user } = useAuth();
  const [conversations, setConversations] = useState<ConversationPreview[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // The skeleton shows only for the FIRST load with nothing to show yet (and only if it lasts 200 ms): a reload with conversations in memory
  // shows them, never the skeleton.
  const waitingFirstLoad = loading && conversations.length === 0;
  const showSkeleton = useDelayedLoading(waitingFirstLoad);
  const contentOpacity = useArrivalFade(waitingFirstLoad);

  const load = useCallback(async () => {
    if (!user?.id) return;
    try {
      setConversations(await listConversations(user.id));
    } catch (error) {
      console.warn('[ConversationList] fetch error:', error);
    }
  }, [user?.id]);

  useEffect(() => {
    void load().finally(() => setLoading(false));
  }, [load]);

  // The Messages tab stays mounted, so it must reload when it comes back into focus (a block, unblock or new chat made
  // elsewhere). The first focus is skipped: the mount effect above already loads.
  const hasFocusedRef = useRef(false);
  useFocusEffect(useCallback(() => {
    if (!hasFocusedRef.current) {
      hasFocusedRef.current = true;
      return;
    }
    void load();
  }, [load]));

  // Blocking hides the conversation at once (the server already filters it on the next load); unblocking reloads it.
  useEffect(() => {
    return subscribeBlockChanges(({ userId, blocked }) => {
      if (blocked) {
        setConversations((prev) => prev.filter((conversation) => conversation.otherUser.id !== userId));
      } else {
        void load();
      }
    });
  }, [load]);

  useEffect(() => {
    onUnreadCountChange?.(
      conversations.reduce((total, conversation) => total + conversation.unreadCount, 0),
    );
  }, [conversations, onUnreadCountChange]);

  useEffect(() => {
    if (!isSupabaseConfigured || !user?.id) return;
    const channel = supabase
      .channel(channelTopic(`conversation_list_${user.id}`))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'dm_messages' }, () => {
        void load();
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load, user?.id]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const removeConversation = useCallback(async (conversation: ConversationPreview) => {
    const originalIndex = conversations.findIndex((item) => item.id === conversation.id);
    if (originalIndex < 0) return;

    setConversations((prev) => prev.filter((item) => item.id !== conversation.id));
    try {
      await hideConversation(conversation.id);
    } catch (error) {
      console.warn('[ConversationList] hide error:', error);
      setConversations((prev) => {
        if (prev.some((item) => item.id === conversation.id)) return prev;
        const restored = [...prev];
        restored.splice(Math.min(originalIndex, restored.length), 0, conversation);
        return restored;
      });
      showAlert(translation.t('state.error', { ns: 'common' }));
    }
  }, [conversations, translation]);

  const confirmRemoveConversation = useCallback((conversation: ConversationPreview) => {
    void confirm(translation.t('messages.deleteConversationTitle'), translation.t('messages.deleteConversationBody'), { confirmText: translation.t('actions.delete', { ns: 'common' }), cancelText: translation.t('actions.cancel', { ns: 'common' }), destructive: true }).then((accepted) => {
      if (!accepted) return;
      void removeConversation(conversation); 
    });
  }, [removeConversation, translation]);

  if (waitingFirstLoad) {
    return showSkeleton ? <ConversationSkeleton /> : <View style={styles.center} />;
  }

  return (
    <Animated.View style={[styles.fill, { opacity: contentOpacity }]}>
    <FlatList
      contentContainerStyle={[
        contentContainerStyle,
        conversations.length === 0 && styles.emptyContainer,
      ]}
      data={conversations}
      keyExtractor={(item) => item.id}
      nestedScrollEnabled={nestedScrollEnabled}
      refreshControl={(
        <RefreshControl
          onRefresh={() => { void refresh(); }}
          refreshing={refreshing}
          tintColor={palette.brand}
        />
      )}
      renderItem={({ item }) => (
        <SwipeToDelete
          deleteLabel={translation.t('actions.delete', { ns: 'common' })}
          onDelete={() => confirmRemoveConversation(item)}
        >
          <ConversationRow conversation={item} onPress={() => onConversationPress(item)} />
        </SwipeToDelete>
      )}
      ListEmptyComponent={(
        <View style={styles.center}>
          <Text style={[styles.emptyText, { color: colors.textTertiary }]}>
            {translation.t('inbox.empty')}
          </Text>
        </View>
      )}
    />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  avatar: { alignItems: 'center', borderRadius: 24, height: 48, justifyContent: 'center', marginRight: 12, width: 48 },
  avatarInitials: { fontSize: 18, fontWeight: '700' },
  rowContent: { flex: 1 },
  rowTop: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  rowName: { flex: 1, fontSize: 16, marginRight: 8 },
  matchTag: { fontSize: 12, fontWeight: '600', marginBottom: 2 },
  rowTime: { fontSize: 12 },
  rowBottom: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  rowPreview: { flex: 1, fontSize: 14, marginRight: 8 },
  badge: { alignItems: 'center', borderRadius: 10, height: 20, justifyContent: 'center', minWidth: 20, paddingHorizontal: 5 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  skeletonAvatar: { marginRight: 12 },
  skeletonName: { marginBottom: 8 },
  fill: { flex: 1 },
  center: { alignItems: 'center', flex: 1, justifyContent: 'center', paddingHorizontal: 32 },
  emptyContainer: { flexGrow: 1 },
  emptyText: { fontSize: 15, lineHeight: 22, textAlign: 'center' },
});
