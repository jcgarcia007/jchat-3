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
 *   onUserLongPress — called when an avatar in the row is long-pressed
 *   children       — SubRoomTabs (rendered between top bar and avatar row)
 *
 * // TODO(i18n)
 */

import React, { useCallback } from 'react';
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
import type { ChatTheme } from '../../theme/chatThemes';

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
  onUserLongPress: (userId: string, displayName: string) => void;
  children?: React.ReactNode;
}

// ── Compact user avatar ────────────────────────────────────────────────────────

interface UserAvatarProps {
  user: UserSummary;
  theme: ChatTheme;
  onLongPress: (userId: string, displayName: string) => void;
}

function UserAvatar({ user, theme, onLongPress }: UserAvatarProps) {
  const displayName =
    user.is_incognito && user.nickname ? user.nickname : user.display_name;

  const handleLongPress = useCallback(() => {
    onLongPress(user.id, displayName);
  }, [onLongPress, user.id, displayName]);

  return (
    <Pressable
      onLongPress={handleLongPress}
      delayLongPress={400}
      accessibilityRole="button"
      accessibilityLabel={`Long press for actions on ${displayName}`} // TODO(i18n)
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
  onUserLongPress,
  children,
}: ChatTopBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[topBarStyles.wrapper, { backgroundColor: theme.topBg, paddingTop: insets.top }]}>
      {/* ── Main header row ──────────────────────────────────────────────── */}
      <View style={[topBarStyles.headerRow, { borderBottomColor: theme.border }]}>
        {/* Back button */}
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Go back" // TODO(i18n)
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
              {/* TODO(i18n) */}
              {activeCount} {activeCount === 1 ? 'person' : 'people'} here
            </Text>
          </View>
        </View>

        {/* Menu icon — only when business.menu_enabled */}
        {business.menu_enabled && (
          <View style={[topBarStyles.menuSection, { borderLeftColor: theme.border }]}>
            <Pressable
              onPress={onMenuPress}
              accessibilityRole="button"
              accessibilityLabel="Open menu" // TODO(i18n)
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
          accessibilityLabel="People in this room" // TODO(i18n)
        >
          {usersInRoom.map((u) => (
            <UserAvatar
              key={u.id}
              user={u}
              theme={theme}
              onLongPress={onUserLongPress}
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
