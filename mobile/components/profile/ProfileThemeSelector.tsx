/**
 * JChat 3.0 — ProfileThemeSelector (Task 0.5)
 *
 * Renders a 3-column grid of 15 miniature profile-card previews, one per
 * theme.  Each card shows the cover color/gradient (solid fallback), an
 * avatar circle with the theme's avatarBorder, a name strip in nameColor,
 * and a compact stats row in statsBg.  The currently selected card gains an
 * accent-colored outer border.
 *
 * Props:
 *   selectedId — the currently active theme id (1–15)
 *   onSelect   — called with the tapped theme id
 *
 * TODO(Stage 1): persist profile_theme_id to users table via Supabase.
 *
 * Design rules:
 *   - Colors come exclusively from ProfileTheme objects — no hardcoded hex
 *     outside this file's layout constants (padding/radius/size numbers only).
 *   - No network calls, no Supabase client.
 *   - Uses only react-native core primitives (no third-party deps).
 */

import React from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { PROFILE_THEMES, ProfileTheme } from '../../theme/profileThemes';

// ─── Layout constants (numbers only — no colors here) ────────────────────────
const COLUMNS = 3;
const CARD_BORDER_RADIUS = 10;
const CARD_COVER_HEIGHT = 44;
const AVATAR_SIZE = 20;
const SELECTED_RING_WIDTH = 2.5;
const CELL_SIZE = 10;
const CELL_GAP = 3;

// ─── Types ────────────────────────────────────────────────────────────────────
interface ProfileThemeSelectorProps {
  selectedId: number;
  onSelect: (id: number) => void;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

interface ThemeCardProps {
  theme: ProfileTheme;
  isSelected: boolean;
  onPress: () => void;
}

function ThemeCard({ theme, isSelected, onPress }: ThemeCardProps): React.JSX.Element {
  const ringColor = isSelected ? theme.avatarBorder : 'transparent';

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.card,
        {
          borderColor: ringColor,
          borderWidth: SELECTED_RING_WIDTH,
        },
      ]}
      accessibilityRole="radio"
      accessibilityState={{ checked: isSelected }}
      accessibilityLabel={`${theme.name} theme${isSelected ? ', selected' : ''}`}
    >
      {/* Cover */}
      <View
        style={[
          styles.cover,
          { backgroundColor: theme.coverBg },
        ]}
      >
        {/* Avatar circle */}
        <View
          style={[
            styles.avatar,
            {
              borderColor: theme.avatarBorder,
              backgroundColor: theme.statsBg,
            },
          ]}
        />
      </View>

      {/* Stats strip */}
      <View style={[styles.statsStrip, { backgroundColor: theme.statsBg, borderTopColor: theme.statsBorder }]}>
        {/* Name line */}
        <Text
          style={[styles.nameText, { color: theme.nameColor === '#ffffff' ? theme.statsValColor : theme.nameColor }]}
          numberOfLines={1}
        >
          {theme.name}
        </Text>

        {/* Post grid placeholder cells */}
        <View style={styles.cellRow}>
          {theme.cellColors.slice(0, 3).map((color, idx) => (
            <View
              key={idx}
              style={[styles.cell, { backgroundColor: color }]}
            />
          ))}
        </View>
      </View>
    </Pressable>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ProfileThemeSelector({
  selectedId,
  onSelect,
}: ProfileThemeSelectorProps): React.JSX.Element {
  const renderItem = ({ item }: { item: ProfileTheme }) => (
    <ThemeCard
      theme={item}
      isSelected={item.id === selectedId}
      onPress={() => onSelect(item.id)}
    />
  );

  return (
    <FlatList<ProfileTheme>
      data={PROFILE_THEMES}
      renderItem={renderItem}
      keyExtractor={(item) => String(item.id)}
      numColumns={COLUMNS}
      columnWrapperStyle={styles.row}
      contentContainerStyle={styles.container}
      scrollEnabled={false}
      showsVerticalScrollIndicator={false}
    />
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    paddingVertical: 8,
  },
  row: {
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  card: {
    flex: 1,
    marginHorizontal: 4,
    borderRadius: CARD_BORDER_RADIUS,
    overflow: 'hidden',
  },
  cover: {
    height: CARD_COVER_HEIGHT,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 4,
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: 2,
  },
  statsStrip: {
    paddingHorizontal: 6,
    paddingTop: 5,
    paddingBottom: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  nameText: {
    fontSize: 8,
    fontWeight: '600',
    marginBottom: 5,
  },
  cellRow: {
    flexDirection: 'row',
    gap: CELL_GAP,
  },
  cell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    borderRadius: 2,
  },
});
