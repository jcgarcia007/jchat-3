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
  /** Fill behind white text / icons (buttons, selected chips): 5.0:1 with white. #5C7CFA stays the brand colour for logos, large accents and decoration (3.67:1 with white). */
  brandFill: '#4263EB',
  /** Brand blue as TEXT / ICON on light surfaces: 4.7:1 on #e8eaf0. Dark mode keeps #5C7CFA (5.2:1 on the dark background). */
  brandTextLight: '#3B5BDB',
  /** Brand blue as TEXT / ICON on dark surfaces: 4.5:1+ on every dark surface incl. the overlay (#5C7CFA is 3.9:1 there). */
  brandTextDark: '#6B8AFB',
  brandLight: 'rgba(92,124,250,0.12)',
  brandPurple: '#7C3AED',
  success: '#1D9E75',
  warning: '#f59e0b',
  /** Warning as TEXT / ICON on light surfaces: 5.4:1+ on white, the base and the elevated surface (#f59e0b is 1.9-2.2:1). */
  warningTextLight: '#A04A06',
  /** Warning as TEXT / ICON on dark surfaces: #f59e0b already passes there (8:1+), so dark keeps it. */
  warningTextDark: '#f59e0b',
  danger: '#ef4444',
  /** Danger as TEXT / ICON on light surfaces: 5.6:1 on white (#ef4444 is 3.76:1). Dark mode keeps #ef4444. */
  dangerTextLight: '#C62828',
  /** Danger as TEXT / ICON on dark surfaces: 4.5:1+ even on the overlay surface (#ef4444 is 3.8:1 there). */
  dangerTextDark: '#F87171',
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
  textTertiary: '#919195',

  // 1.3 Light Mode Surface Colors
  bgBaseLight: '#f9f9fb',
  bgSurfaceLight: '#ffffff',
  bgElevatedLight: '#f2f2f7',
  borderSubtleLight: '#e5e5ea',
  textPrimaryLight: '#1d1d1f',
  textSecondaryLight: '#55555a',
  textTertiaryLight: '#6d6d72',

  // 1.3b The tab bar "glass" fills (NotchTabBar) are derived from bgSurface / bgSurfaceLight in `glass` below.

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
  /** Fullscreen image viewer background — pure black in both color schemes. */
  imageViewerBg: '#000000',

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

/** "#rrggbb" + an alpha → "rgba(r,g,b,a)". Derived tokens use it so they follow the colour they come from, never a hand-written rgba. */
export function withAlpha(color: string, alpha: number): string {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color);
  if (!hex) throw new Error(`withAlpha: "${color}" is not a #rgb / #rrggbb colour`);
  const full = hex[1].length === 3 ? [...hex[1]].map((x) => x + x).join('') : hex[1];
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  return `rgba(${r},${g},${b},${Math.round(alpha * 1000) / 1000})`;
}

/**
 * "Liquid glass" tokens of the tab bar, the profile buttons and the offers button. Every colour is calculated with `withAlpha` from a
 * palette colour (brand ones from brand / brandFill, so they follow it). The bar fill is 82 %: at 72 % the labels do not reach 4.5:1 on the
 * worst background (a black photo behind the light bar, a white one behind the dark bar) — see scripts/glass-contrast.test.mjs.
 */
export const glass = {
  /** Bar fill over the iOS blur; Android has no blur, so it is nearly opaque. */
  barAlpha: 0.82,
  barAlphaAndroid: 0.94,
  tabBarLight: withAlpha(palette.bgSurfaceLight, 0.82),
  tabBarDark: withAlpha(palette.bgSurface, 0.82),
  tabBarLightAndroid: withAlpha(palette.bgSurfaceLight, 0.94),
  tabBarDarkAndroid: withAlpha(palette.bgSurface, 0.94),
  /** 1 pt contour of the bar, and the 1.2 pt bright line on its top half. */
  edgeLineLight: withAlpha(palette.shadow, 0.06),
  edgeLineDark: withAlpha(palette.onImage, 0.1),
  edgeHighlightLight: withAlpha(palette.onImage, 0.95),
  edgeHighlightDark: withAlpha(palette.onImage, 0.22),
  /** Round buttons over the cover. */
  buttonFillLight: withAlpha(palette.onImage, 0.3),
  buttonFillDark: withAlpha(palette.onImage, 0.16),
  buttonBorderLight: withAlpha(palette.onImage, 0.65),
  buttonBorderDark: withAlpha(palette.onImage, 0.28),
  /** "Edit profile" capsule on the sheet. */
  sheetButtonFillLight: withAlpha(palette.onImage, 0.7),
  sheetButtonFillDark: withAlpha(palette.onImage, 0.16),
  /** Offers button: brand fill (92 %), soft highlight up-left, 1 pt border. */
  brandFillGlass: withAlpha(palette.brandFill, 0.92),
  reflect: withAlpha(palette.onImage, 0.35),
  offersBorderLight: withAlpha(palette.onImage, 0.6),
  offersBorderDark: withAlpha(palette.onImage, 0.3),
  /** "Publish" capsule: brand at 96 % (86 % gave 3.9:1 with white text on a light page). */
  brandFillSoft: withAlpha(palette.brandFill, 0.96),
  /** Active tab bubble. */
  tabPillActive: withAlpha(palette.brand, 0.14),
  /** Shadows (numbers, not colours): the bar's is wide and neutral; the offers button's is brand-coloured and only downwards. */
  barShadow: { opacityLight: 0.16, opacityDark: 0.55, radius: 22, offsetY: 10 },
  offersShadow: { opacityLight: 0.35, opacityDark: 0.45, radius: 14, offsetY: 6, color: palette.brandFill },
} as const;
