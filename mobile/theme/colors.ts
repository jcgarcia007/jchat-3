/**
 * JChat 3.0 — Theme-aware color tokens (Task 0.2)
 * Builds light/dark theme objects from ./tokens and exposes a hook that
 * switches automatically via React Native's useColorScheme.
 *
 * Usage:
 *   const c = useThemeColors();
 *   <View style={{ backgroundColor: c.bgBase }}>
 */

import { useColorScheme } from 'react-native';
import { palette } from './tokens';

/** Theme-independent tokens shared by both schemes. */
const shared = {
  brand: palette.brand,
  brandDark: palette.brandDark,
  brandLight: palette.brandLight,
  brandPurple: palette.brandPurple,
  success: palette.success,
  warning: palette.warning,
  danger: palette.danger,
  gold: palette.gold,

  // Map + heatmap colors are explicitly named per scheme in the Design System,
  // so they are not remapped — exposed as-is for the map layers.
  mapLightBase: palette.mapLightBase,
  mapLightRoads: palette.mapLightRoads,
  mapLightBlocks: palette.mapLightBlocks,
  mapLightParks: palette.mapLightParks,
  mapLightWater: palette.mapLightWater,
  mapDarkBase: palette.mapDarkBase,
  mapDarkRoads: palette.mapDarkRoads,
  mapDarkBlocks: palette.mapDarkBlocks,
  mapDarkParks: palette.mapDarkParks,
  mapDarkWater: palette.mapDarkWater,
  heatHot: palette.heatHot,
  heatWarm: palette.heatWarm,
  heatMild: palette.heatMild,
  heatCool: palette.heatCool,
};

export const darkColors = {
  ...shared,
  bgBase: palette.bgBase,
  bgSurface: palette.bgSurface,
  bgElevated: palette.bgElevated,
  bgOverlay: palette.bgOverlay,
  borderSubtle: palette.borderSubtle,
  textPrimary: palette.textPrimary,
  textSecondary: palette.textSecondary,
  textTertiary: palette.textTertiary,
};

/** All color values widen to `string` so light/dark share one shape. */
export type ThemeColors = { [K in keyof typeof darkColors]: string };

export const lightColors: ThemeColors = {
  ...shared,
  bgBase: palette.bgBaseLight,
  bgSurface: palette.bgSurfaceLight,
  bgElevated: palette.bgElevatedLight,
  // Section 1 defines no light overlay; reuse the light elevated surface.
  bgOverlay: palette.bgElevatedLight,
  borderSubtle: palette.borderSubtleLight,
  textPrimary: palette.textPrimaryLight,
  textSecondary: palette.textSecondaryLight,
  textTertiary: palette.textTertiaryLight,
};

export type ColorScheme = 'light' | 'dark';

/** Resolve a theme object for a given scheme (defaults to dark). */
export function getColors(scheme: string | null | undefined): ThemeColors {
  return scheme === 'light' ? lightColors : darkColors;
}

/** Hook: returns the active theme colors, switching with the OS color scheme. */
export function useThemeColors(): ThemeColors {
  return getColors(useColorScheme());
}
