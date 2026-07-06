/**
 * JChat 3.0 — SubRoomTabs (Task 2.4)
 *
 * A horizontal scroll of sub-room tabs shown in the top bar.
 * Selecting a password-protected sub-room triggers the PasswordEntrySheet
 * before switching (parent controls the sheet visibility via `onSelectProtected`).
 *
 * Props:
 *   rooms            — list of sub-rooms (including the main room)
 *   activeRoomId     — currently selected room id
 *   theme            — active ChatTheme
 *   unlockedRoomIds  — set of sub-room ids the user has already unlocked
 *   onSelect         — called when a non-protected room tab is tapped
 *   onSelectProtected — called when a password-protected room is tapped;
 *                       parent should show PasswordEntrySheet then call onSelect
 *
 * // TODO(i18n)
 */

import React, { useCallback } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { IconLock } from '@tabler/icons-react-native';
import type { ChatTheme } from '../../theme/chatThemes';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface SubRoom {
  id: string;
  name: string;
  is_main: boolean;
  is_password_protected: boolean;
  sort: number;
  /** Per-room chat theme; drives the active theme when this sub-room is selected. */
  chat_theme_id: number;
}

export interface SubRoomTabsProps {
  rooms: SubRoom[];
  activeRoomId: string;
  theme: ChatTheme;
  /** Room IDs the user has successfully unlocked this session. */
  unlockedRoomIds: Set<string>;
  onSelect: (room: SubRoom) => void;
  onSelectProtected: (room: SubRoom) => void;
}

// ── Component ──────────────────────────────────────────────────────────────────

export function SubRoomTabs({
  rooms,
  activeRoomId,
  theme,
  unlockedRoomIds,
  onSelect,
  onSelectProtected,
}: SubRoomTabsProps) {
  const handlePress = useCallback(
    (room: SubRoom) => {
      if (room.id === activeRoomId) return;

      const needsPassword =
        room.is_password_protected && !unlockedRoomIds.has(room.id);

      if (needsPassword) {
        onSelectProtected(room);
      } else {
        onSelect(room);
      }
    },
    [activeRoomId, unlockedRoomIds, onSelect, onSelectProtected],
  );

  // Only render if there are sub-rooms (more than 1 room total)
  if (rooms.length <= 1) return null;

  const sorted = [...rooms].sort((a, b) => a.sort - b.sort);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={tabStyles.scrollContent}
      style={[tabStyles.scroll, { borderBottomColor: theme.border }]}
      accessibilityRole="tablist"
    >
      {sorted.map((room) => {
        const isActive = room.id === activeRoomId;
        const locked = room.is_password_protected && !unlockedRoomIds.has(room.id);

        return (
          <Pressable
            key={room.id}
            onPress={() => handlePress(room)}
            accessibilityRole="tab"
            accessibilityLabel={`${room.name}${locked ? ' — password protected' : ''}`} // TODO(i18n)
            accessibilityState={{ selected: isActive }}
            style={({ pressed }) => [
              tabStyles.tab,
              isActive && { borderBottomColor: theme.tabActive, borderBottomWidth: 2 },
              pressed && !isActive && tabStyles.tabPressed,
            ]}
          >
            <View style={tabStyles.labelRow}>
              {locked && (
                <IconLock size={11} color={isActive ? theme.tabActive : theme.tabInactive} />
              )}
              <Text
                style={[
                  tabStyles.label,
                  { color: isActive ? theme.tabActive : theme.tabInactive },
                  isActive && tabStyles.labelActive,
                ]}
                numberOfLines={1}
              >
                {room.name}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const tabStyles = StyleSheet.create({
  scroll: {
    flexGrow: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  scrollContent: {
    paddingHorizontal: 12,
    gap: 4,
  },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabPressed: {
    opacity: 0.7,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
  },
  labelActive: {
    fontWeight: '700',
  },
});
