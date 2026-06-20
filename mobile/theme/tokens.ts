/**
 * JChat 3.0 — Core Color Tokens (Task 0.2)
 * Source of truth: JCHAT_3.0_DESIGN_SYSTEM.docx · Section 1
 * Values are identical to web/styles/tokens.css. NEVER hardcode hex in
 * components — import from here (or use the theme objects in ./colors).
 */

export const palette = {
  // 1.1 Brand Colors (theme-independent)
  brand: '#5C7CFA',
  brandDark: '#4A6AE8',
  brandLight: 'rgba(92,124,250,0.12)',
  brandPurple: '#7C3AED',
  success: '#1D9E75',
  warning: '#f59e0b',
  danger: '#ef4444',
  gold: '#D97706',

  // 1.2 Dark Mode Surface Colors
  bgBase: '#0f0f11',
  bgSurface: '#18181b',
  bgElevated: '#1a1d2e',
  bgOverlay: '#2a2a2e',
  borderSubtle: '#2a2a2e',
  textPrimary: '#f5f5f7',
  textSecondary: '#aeaeb2',
  textTertiary: '#636366',

  // 1.3 Light Mode Surface Colors
  bgBaseLight: '#f9f9fb',
  bgSurfaceLight: '#ffffff',
  bgElevatedLight: '#f2f2f7',
  borderSubtleLight: '#e5e5ea',
  textPrimaryLight: '#1d1d1f',
  textSecondaryLight: '#8e8e93',
  textTertiaryLight: '#c7c7cc',

  // 1.4 Map Colors — light
  mapLightBase: '#eef1f8',
  mapLightRoads: '#ffffff',
  mapLightBlocks: '#e0e5f0',
  mapLightParks: '#c8e6c9',
  mapLightWater: '#b3d9f5',

  // 1.4 Map Colors — dark
  mapDarkBase: '#111827',
  mapDarkRoads: '#252d3d',
  mapDarkBlocks: '#1a2030',
  mapDarkParks: '#162412',
  mapDarkWater: '#0d2035',

  // 1.4 Heatmap
  heatHot: '#FF3B30',
  heatWarm: '#FF9500',
  heatMild: '#FFCC00',
  heatCool: '#34C759',
} as const;

export type Palette = typeof palette;
export type PaletteToken = keyof Palette;
