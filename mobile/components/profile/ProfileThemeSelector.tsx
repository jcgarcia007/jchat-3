/**
 * JChat 3.0 — ProfileThemeSelector
 *
 * Six circles, one per profile theme: the circle is the theme's accent colour (the avatar ring / active tab / primary
 * button colour) and the theme's name is under it. The selected one carries a check mark and a ring. A theme saved
 * under an id that no longer exists (see theme/profileThemes.ts LEGACY_THEME_MAP) highlights the theme it maps to.
 *
 * Props:
 *   selectedId — the stored theme id (any number; legacy ids are resolved)
 *   onSelect   — called with the tapped theme id
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { IconCheck } from '@tabler/icons-react-native';
import { useTranslation } from 'react-i18next';

import { PROFILE_THEMES, readableOn, resolveProfileThemeId, type ProfileTheme } from '../../theme/profileThemes';
import { useThemeColors } from '../../theme/colors';

const SWATCH_SIZE = 56;
const SELECTED_RING_WIDTH = 3;

interface ProfileThemeSelectorProps {
  selectedId: number;
  onSelect: (id: number) => void;
}

function ThemeOption({ theme, selected, onPress }: { theme: ProfileTheme; selected: boolean; onPress: () => void }): React.JSX.Element {
  const { t } = useTranslation('profile');
  const c = useThemeColors();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={selected ? t('themeSelector.themeOptionSelectedA11y', { name: theme.name }) : t('themeSelector.themeOptionA11y', { name: theme.name })}
      onPress={onPress}
      style={styles.option}
      testID={`profile-theme-${theme.id}`}
    >
      <View style={[styles.ring, { borderColor: selected ? c.textPrimary : 'transparent' }]}>
        <View style={[styles.swatch, { backgroundColor: theme.accent }]}>
          {selected ? <IconCheck size={26} color={readableOn(theme.accent)} strokeWidth={3} /> : null}
        </View>
      </View>
      <Text style={[styles.name, { color: selected ? c.textPrimary : c.textSecondary, fontWeight: selected ? '800' : '600' }]} numberOfLines={1}>
        {theme.name}
      </Text>
    </Pressable>
  );
}

export default function ProfileThemeSelector({ selectedId, onSelect }: ProfileThemeSelectorProps): React.JSX.Element {
  const shownId = resolveProfileThemeId(selectedId);
  return (
    <View accessibilityRole="radiogroup" style={styles.grid}>
      {PROFILE_THEMES.map((theme) => (
        <ThemeOption key={theme.id} theme={theme} selected={theme.id === shownId} onPress={() => onSelect(theme.id)} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingVertical: 12 },
  option: { alignItems: 'center', gap: 8, paddingVertical: 10, width: '33.333%' },
  ring: { alignItems: 'center', borderRadius: (SWATCH_SIZE + SELECTED_RING_WIDTH * 4) / 2, borderWidth: SELECTED_RING_WIDTH, justifyContent: 'center', padding: SELECTED_RING_WIDTH },
  swatch: { alignItems: 'center', borderRadius: SWATCH_SIZE / 2, height: SWATCH_SIZE, justifyContent: 'center', width: SWATCH_SIZE },
  name: { fontSize: 13, textAlign: 'center' },
});
