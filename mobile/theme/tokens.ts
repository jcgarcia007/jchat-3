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
  /** Modal/backdrop scrim — intentionally dark in both color schemes. */
  scrim: 'rgba(0,0,0,0.72)',
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

  // 1.5 Foreground on filled / image surfaces (theme-independent)
  /** Text / icon on a brand, danger or success filled surface. */
  onBrand: '#FFFFFF',
  /** Text / icon over a photo or a scrim. */
  onImage: '#FFFFFF',
  /** Shadow color (shadowColor). */
  shadow: '#000000',

  // 1.6 Black scrim scale (modal backdrops, image darkening). `scrim` (.72) is above.
  scrimSoft: 'rgba(0,0,0,0.30)',
  scrimMedium: 'rgba(0,0,0,0.55)',

  // 1.7 White overlays on images
  onImageFaint: 'rgba(255,255,255,0.40)',
  onImageMuted: 'rgba(255,255,255,0.72)',
  onImageStrong: 'rgba(255,255,255,0.90)',

  // 1.8 Tints with alpha
  successTint: '#1D9E7522',
  brandPurpleTint: '#7C3AED22',
  dangerTint: 'rgba(239,68,68,0.10)',
  dangerBorder: 'rgba(239,68,68,0.35)',
  warningTint: 'rgba(245,158,11,0.10)',
  warningBorder: 'rgba(245,158,11,0.35)',
  /** Neutral hairlines that work on light and dark surfaces. */
  neutralLine: 'rgba(128,128,128,0.25)',
  neutralBorder: 'rgba(128,128,128,0.5)',

  // 1.9 Rating star
  ratingStar: '#FFCC00',

  // 1.10 Brand art (Splash / Welcome / Onboarding): fixed artwork, not theme-driven
  brandArtBase: '#060810',
  brandArtMid: '#0d1030',
  brandArtDeepA: '#080d1a',
  brandArtDeepB: '#0a0814',
  brandArtDeepC: '#0d1120',
  brandArtSlate: '#111827',
  brandArtLine: '#2a2d4a',
  brandArtCoral: '#D85A30',
  brandArtGlowBrand: 'rgba(92,124,250,0.18)',
  brandArtGlowBrandStrong: 'rgba(92,124,250,0.45)',
  brandArtGlowPurple: 'rgba(124,58,237,0.12)',
  brandArtGlowSuccess: 'rgba(29,158,117,0.10)',

  // 1.4 Heatmap
  heatHot: '#FF3B30',
  heatWarm: '#FF9500',
  heatMild: '#FFCC00',
  heatCool: '#34C759',
} as const;

export type Palette = typeof palette;
export type PaletteToken = keyof Palette;
