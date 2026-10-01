import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ListRenderItemInfo,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  IconBell,
  IconHeart,
  IconMessage,
  IconMessage2,
  IconUserPlus,
  type Icon,
} from '@tabler/icons-react-native';
import { useTranslation } from 'react-i18next';

import ConversationList from '../../components/dms/ConversationList';
import SwipeToDelete from '../../components/common/SwipeToDelete';
import { useNotifications } from '../../hooks/useNotifications';
import type { MainStackParamList } from '../../navigation/AppNavigator';
import type { ConversationPreview } from '../../services/dms';
import {
  isSocialNotificationType,
  routeForNotification,
  type NotificationRow,
  type NotificationType,
} from '../../services/notifications';
import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import { formatSocialTime } from '../../utils/formatSocialTime';

type MessagesNavigation = NativeStackNavigationProp<MainStackParamList>;

const NOTIFICATION_ICONS: Record<NotificationType, Icon> = {
  follower: IconUserPlus,
  dm: IconMessage,
  like: IconHeart,
  comment: IconMessage2,
  work_alert: IconBell,
};

function actorName(payload: Record<string, unknown> | null, fallback: string): string {
  for (const key of ['actor_name', 'from_name', 'username', 'display_name'] as const) {
    const value = payload?.[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return fallback;
}

export default function MessagesScreen() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const navigation = useNavigation<MessagesNavigation>();
  const translation = useTranslation('social');
  const [dmUnreadCount, setDmUnreadCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const { notifications, markRead, refresh, remove } = useNotifications({ passive: true });

  const socialNotifications = useMemo(
    () => notifications.filter((notification) => isSocialNotificationType(notification.type)),
    [notifications],
  );
  const clearSurface = `${colors.bgSurface}00`;

  useFocusEffect(useCallback(() => {
    void refresh();
  }, [refresh]));

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const openConversation = useCallback((conversation: ConversationPreview) => {
    navigation.navigate('DMs', {
      screen: 'DMChat',
      params: {
        conversationId: conversation.id,
        otherUserId: conversation.otherUser.id,
      },
    });
  }, [navigation]);

  const openNotification = useCallback((notification: NotificationRow) => {
    void markRead(notification.id);
    if (!isSocialNotificationType(notification.type)) return;
    const route = routeForNotification(notification.type, notification.payload);
    if (!route) return;
    if (route.screen === 'DMs') navigation.navigate('DMs', route.params);
    else if (route.screen === 'UserProfile') navigation.navigate('UserProfile', route.params);
    else navigation.navigate('PostDetail', route.params);
  }, [markRead, navigation]);

  const notificationText = useCallback((notification: NotificationRow) => {
    if (!isSocialNotificationType(notification.type)) return '';
    return translation.t(`messages.notif.${notification.type === 'work_alert' ? 'workAlert' : notification.type}`, {
      name: actorName(notification.payload, translation.t('messages.someone')),
    });
  }, [translation]);

  const removeNotification = useCallback((id: string) => {
    void remove(id).catch(() => {
      Alert.alert(translation.t('state.error', { ns: 'common' }));
    });
  }, [remove, translation]);

  const renderNotification = useCallback(({ item }: ListRenderItemInfo<NotificationRow>) => {
    if (!isSocialNotificationType(item.type)) return null;
    const NotificationIcon = NOTIFICATION_ICONS[item.type];
    return (
      <SwipeToDelete
        deleteLabel={translation.t('actions.delete', { ns: 'common' })}
        onDelete={() => removeNotification(item.id)}
      >
        <Pressable
          accessibilityRole="button"
          onPress={() => openNotification(item)}
          style={[
            styles.notificationRow,
            {
              backgroundColor: item.is_read ? colors.bgBase : colors.bgElevated,
              borderBottomColor: colors.borderSubtle,
            },
          ]}
        >
          <View style={[styles.notificationIcon, { backgroundColor: colors.brandLight }]}>
            <NotificationIcon
              color={item.type === 'work_alert' ? colors.warning : colors.brand}
              size={21}
              strokeWidth={2}
            />
          </View>
          <View style={styles.notificationContent}>
            <Text style={[styles.notificationText, { color: colors.textPrimary }]}>
              {notificationText(item)}
            </Text>
            <Text style={[styles.notificationTime, { color: colors.textTertiary }]}>
              {formatSocialTime(item.created_at, translation.i18n.language, translation.t)}
            </Text>
          </View>
          {!item.is_read ? <View style={[styles.notificationUnread, { backgroundColor: colors.danger }]} /> : null}
        </Pressable>
      </SwipeToDelete>
    );
  }, [colors, notificationText, openNotification, removeNotification, translation]);

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: colors.bgBase,
          paddingBottom: 102 + insets.bottom,
          paddingTop: insets.top,
        },
      ]}
    >
      <Text style={[styles.title, { color: colors.textPrimary }]}>{translation.t('inbox.title')}</Text>

      <View
        style={[
          styles.privateCard,
          {
            backgroundColor: colors.bgSurface,
            borderColor: colors.borderSubtle,
            height: height * 0.45,
          },
        ]}
      >
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            {translation.t('messages.privateTitle')}
          </Text>
          {dmUnreadCount > 0 ? (
            <View style={[styles.newChip, { backgroundColor: colors.danger }]}>
              <Text style={[styles.newChipText, { color: palette.bgSurfaceLight }]}>
                {translation.t('messages.newCount', { count: dmUnreadCount })}
              </Text>
            </View>
          ) : null}
        </View>
        <View style={styles.conversationArea}>
          <ConversationList
            nestedScrollEnabled
            onConversationPress={openConversation}
            onUnreadCountChange={setDmUnreadCount}
          />
          <LinearGradient
            colors={[clearSurface, colors.bgSurface]}
            pointerEvents="none"
            style={styles.scrollHint}
          />
        </View>
      </View>

      <Text style={[styles.notificationsTitle, { color: colors.textPrimary }]}>
        {translation.t('messages.notificationsTitle')}
      </Text>
      <FlatList
        contentContainerStyle={socialNotifications.length === 0 ? styles.emptyNotifications : undefined}
        data={socialNotifications}
        keyExtractor={(item) => item.id}
        refreshControl={(
          <RefreshControl
            colors={[colors.brand]}
            onRefresh={() => { void handleRefresh(); }}
            refreshing={refreshing}
            tintColor={colors.brand}
          />
        )}
        renderItem={renderNotification}
        ListEmptyComponent={(
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            {translation.t('messages.emptyNotifications')}
          </Text>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 16 },
  title: { fontSize: 28, fontWeight: '800', paddingBottom: 14, paddingTop: 12 },
  privateCard: { borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  sectionHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  sectionTitle: { fontSize: 17, fontWeight: '700' },
  newChip: { borderRadius: 12, paddingHorizontal: 9, paddingVertical: 4 },
  newChipText: { fontSize: 11, fontWeight: '800' },
  conversationArea: { flex: 1 },
  scrollHint: { bottom: 0, height: 36, left: 0, position: 'absolute', right: 0 },
  notificationsTitle: { fontSize: 19, fontWeight: '800', paddingBottom: 8, paddingTop: 18 },
  notificationRow: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', minHeight: 66, paddingHorizontal: 10, paddingVertical: 10 },
  notificationIcon: { alignItems: 'center', borderRadius: 20, height: 40, justifyContent: 'center', width: 40 },
  notificationContent: { flex: 1, gap: 3, marginLeft: 11 },
  notificationText: { fontSize: 14, lineHeight: 19 },
  notificationTime: { fontSize: 11 },
  notificationUnread: { borderRadius: 4, height: 8, marginLeft: 8, width: 8 },
  emptyNotifications: { flexGrow: 1, justifyContent: 'center' },
  emptyText: { fontSize: 14, lineHeight: 20, paddingHorizontal: 28, textAlign: 'center' },
});
