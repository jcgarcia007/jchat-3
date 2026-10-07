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
import * as Notifications from 'expo-notifications';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import ConversationList from '../../components/dms/ConversationList';
import SwipeToDelete from '../../components/common/SwipeToDelete';
import { useNotifications } from '../../hooks/useNotifications';
import {
  NOTIFICATION_ICONS,
  openNotificationRoute,
  useNotificationPresenter,
} from '../../hooks/useNotificationPresenter';
import type { MainStackParamList } from '../../navigation/AppNavigator';
import type { ConversationPreview } from '../../services/dms';
import {
  isSocialNotificationType,
  routeForNotification,
  type NotificationRow,
} from '../../services/notifications';
import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import { formatSocialTime } from '../../utils/formatSocialTime';
import { useHomeBarInset } from '../../components/venue/HomeBarInset';

type MessagesNavigation = NativeStackNavigationProp<MainStackParamList>;

export default function MessagesScreen() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const homeBarInset = useHomeBarInset();
  const { height } = useWindowDimensions();
  const navigation = useNavigation<MessagesNavigation>();
  const translation = useTranslation('social');
  const [dmUnreadCount, setDmUnreadCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const { notifications, markRead, refresh, remove } = useNotifications({ passive: true });

  const { visible: socialNotifications, textFor: notificationText } = useNotificationPresenter(notifications);
  const clearSurface = `${colors.bgSurface}00`;

  useFocusEffect(useCallback(() => {
    void refresh();
    void Notifications.setBadgeCountAsync(0).catch(() => {});
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
    openNotificationRoute(navigation as unknown as { navigate: (screen: string, params?: unknown) => void }, route);
  }, [markRead, navigation]);

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
          paddingBottom: 102 + insets.bottom + homeBarInset,
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
