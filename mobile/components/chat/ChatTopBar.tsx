/**
 * JChat 3.0 — ChatTopBar (Task 2.4)
 *
 * The header area of a chat room:
 *   [Back] [Business icon + name]   [active count]   [Menu icon — only if menu_enabled]
 *
 * Layout below the top bar:
 *   - SubRoomTabs (horizontal scroll of sub-rooms)
 *   - User avatars row (horizontal scroll of users currently in the room)
 *
 * The menu icon has a left divider and is only rendered when
 * `business.menu_enabled === true`.
 *
 * Props:
 *   business       — business data (name, icon_emoji, menu_enabled)
 *   activeCount    — number of users currently in the room
 *   theme          — active ChatTheme
 *   usersInRoom    — list of user summaries for the avatar row
 *   onBack         — called when the back button is pressed
 *   onMenuPress    — called when the menu icon is pressed
 *   onUserPress    — called when an avatar in the row is tapped (opens quick card)
 *   children       — SubRoomTabs (rendered between top bar and avatar row)
 */

import React, { useCallback, useRef } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  IconArrowLeft,
  IconMenuDeep,
  IconUser,
} from '@tabler/icons-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { ChatTheme } from '../../theme/chatThemes';
import type { UserAnchor } from './MessageBubble';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface BusinessSummary {
  id: string;
  name: string;
  icon_emoji: string | null;
  menu_enabled: boolean;
}

export interface UserSummary {
  id: string;
  display_name: string;
  avatar_url: string | null;
  /** True when the user entered the room as incognito */
  is_incognito?: boolean;
  /** Nickname to show when incognito */
  nickname?: string;
}

export interface ChatTopBarProps {
  business: BusinessSummary;
  activeCount: number;
  theme: ChatTheme;
  usersInRoom: UserSummary[];
  onBack: () => void;
  onMenuPress: () => void;
  onUserPress: (userId: string, displayName: string, anchor: UserAnchor) => void;
  children?: React.ReactNode;
}

// ── Compact user avatar ────────────────────────────────────────────────────────

interface UserAvatarProps {
  user: UserSummary;
  theme: ChatTheme;
  onPressUser: (userId: string, displayName: string, anchor: UserAnchor) => void;
}

function UserAvatar({ user, theme, onPressUser }: UserAvatarProps) {
  const { t } = useTranslation('chat');
  const displayName =
    user.is_incognito && user.nickname ? user.nickname : user.display_name;
  const ref = useRef<View>(null);

  // Tap → measure the avatar rect (window coords) and open the anchored quick card.
  const handlePress = useCallback(() => {
    const node = ref.current;
    if (node && typeof node.measureInWindow === 'function') {
      node.measureInWindow((x, y, width, height) => {
        onPressUser(user.id, displayName, { x, y, width, height });
      });
    } else {
      onPressUser(user.id, displayName, { x: 0, y: 0, width: 0, height: 0 });
    }
  }, [onPressUser, user.id, displayName]);

  return (
    <Pressable
      ref={ref}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={t('topBar.userTapA11y', { name: displayName })}
      style={avatarStyles.wrap}
    >
      {!user.is_incognito && user.avatar_url ? (
        <Image
          source={{ uri: user.avatar_url }}
          style={[avatarStyles.img, { borderColor: theme.border }]}
        />
      ) : (
        <View style={[avatarStyles.img, avatarStyles.fallback, { backgroundColor: theme.bubbleInBg, borderColor: theme.border }]}>
          <Text style={[avatarStyles.initial, { color: theme.bubbleInText }]}>
            {displayName.charAt(0).toUpperCase()}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const avatarStyles = StyleSheet.create({
  wrap: {
    marginHorizontal: 3,
  },
  img: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: {
    fontSize: 15,
    fontWeight: '700',
  },
});

// ── Main component ─────────────────────────────────────────────────────────────

export function ChatTopBar({
  business,
  activeCount,
  theme,
  usersInRoom,
  onBack,
  onMenuPress,
  onUserPress,
  children,
}: ChatTopBarProps) {
  const { t } = useTranslation('chat');
  const insets = useSafeAreaInsets();

  return (
    <View style={[topBarStyles.wrapper, { backgroundColor: theme.topBg, paddingTop: insets.top }]}>
      {/* ── Main header row ──────────────────────────────────────────────── */}
      <View style={[topBarStyles.headerRow, { borderBottomColor: theme.border }]}>
        {/* Back button */}
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel={t('topBar.back')}
          hitSlop={10}
          style={({ pressed }) => [topBarStyles.backBtn, pressed && topBarStyles.btnPressed]}
        >
          <IconArrowLeft size={22} color={theme.tabActive} />
        </Pressable>

        {/* Business icon + name + active count */}
        <View style={topBarStyles.titleArea}>
          <Text style={topBarStyles.emoji}>
            {business.icon_emoji ?? '🏪'}
          </Text>
          <View style={topBarStyles.titleText}>
            <Text style={[topBarStyles.businessName, { color: theme.bubbleInText }]} numberOfLines={1}>
              {business.name}
            </Text>
            <Text style={[topBarStyles.activeCount, { color: theme.tabInactive }]}>
              {t('topBar.peopleHere', { count: activeCount })}
            </Text>
          </View>
        </View>

        {/* Menu icon — only when business.menu_enabled */}
        {business.menu_enabled && (
          <View style={[topBarStyles.menuSection, { borderLeftColor: theme.border }]}>
            <Pressable
              onPress={onMenuPress}
              accessibilityRole="button"
              accessibilityLabel={t('topBar.openMenu')}
              hitSlop={10}
              style={({ pressed }) => [topBarStyles.menuBtn, pressed && topBarStyles.btnPressed]}
            >
              <IconMenuDeep size={22} color={theme.tabActive} />
            </Pressable>
          </View>
        )}
      </View>

      {/* ── SubRoomTabs slot ─────────────────────────────────────────────── */}
      {children}

      {/* ── User avatars row ─────────────────────────────────────────────── */}
      {usersInRoom.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={topBarStyles.avatarsContent}
          style={[topBarStyles.avatarsScroll, { borderBottomColor: theme.border }]}
          accessibilityRole="list"
          accessibilityLabel={t('topBar.peopleList')}
        >
          {usersInRoom.map((u) => (
            <UserAvatar
              key={u.id}
              user={u}
              theme={theme}
              onPressUser={onUserPress}
            />
          ))}
          {usersInRoom.length === 0 && (
            <View style={topBarStyles.emptyAvatars}>
              <IconUser size={16} color={theme.tabInactive} />
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const topBarStyles = StyleSheet.create({
  wrapper: {
    zIndex: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 10,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    padding: 6,
    borderRadius: 8,
  },
  btnPressed: {
    opacity: 0.6,
  },
  titleArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    overflow: 'hidden',
  },
  emoji: {
    fontSize: 22,
    lineHeight: 26,
  },
  titleText: {
    flex: 1,
    gap: 1,
  },
  businessName: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  activeCount: {
    fontSize: 12,
  },
  menuSection: {
    borderLeftWidth: StyleSheet.hairlineWidth,
    paddingLeft: 8,
  },
  menuBtn: {
    padding: 6,
    borderRadius: 8,
  },
  avatarsScroll: {
    flexGrow: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  avatarsContent: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  emptyAvatars: {
    paddingHorizontal: 4,
    opacity: 0.5,
  },
});
