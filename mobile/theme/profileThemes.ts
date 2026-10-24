/**
 * JChat 3.0 — Profile themes (6)
 *
 * A theme only paints two things on a profile: the ring around the avatar / the active tab / the primary button
 * (`accent`) and the 190 px gradient at the top that fades into the page (`headerGradient`). Page background, cards,
 * texts and borders come from useThemeColors() (the system light / dark), never from the theme.
 *
 * This file is the catalogue of those colours, so it holds literal hex values for them (accent and headerGradient):
 * every other file must read them through getProfileTheme(). The rest of the ProfileTheme fields are kept for the
 * files that still import the old shape (EditProfileScreen); they are DERIVED from the palette tokens and from the
 * accent, never written by hand.
 *
 * Themes that were removed (ids 3, 5, 7, 8, 9, 11, 13, 14, 15) can still be saved in users.profile_theme_id: the
 * database does not change, getProfileTheme() maps them to a surviving theme (LEGACY_THEME_MAP).
 */

import { palette } from './tokens';

export type ProfileTheme = {
  id: number;
  name: string;
  /** Ring of the avatar, active tab and primary button. */
  accent: string;
  /** Top gradient (two colours), faded into the page background. */
  headerGradient: [string, string];

  // ── Derived (old shape, kept for importers; not authored per theme) ───────────
  /** Solid colour behind the avatar when there is no photo: the first gradient stop. */
  coverBg: string;
  /** Gradient stops (the headerGradient). */
  coverGradient: string[];
  avatarBorder: string;
  nameColor: string;
  statsBg: string;
  statsBorder: string;
  statsValColor: string;
  bodyText: string;
  bodyTextSecondary: string;
  /** Primary button: the accent, with whichever of white / near-black reads best on it. */
  btn1Bg: string;
  btn1Color: string;
  btn2Bg: string;
  btn2Color: string;
  tabActive: string;
  tabInactive: string;
  tabInactiveText: string;
  cellColors: string[];
};

// ── Contrast helpers (WCAG) ───────────────────────────────────────────────────

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16) / 255);
  const [r, g, b] = channels.map((ch) => (ch <= 0.04045 ? ch / 12.92 : ((ch + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(foreground: string, background: string): number {
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** White or near-black, whichever has the better contrast on `background`. */
export function readableOn(background: string): string {
  return contrastRatio(palette.onBrand, background) >= contrastRatio(palette.bgBase, background) ? palette.onBrand : palette.bgBase;
}

function makeTheme(id: number, name: string, accent: string, headerGradient: [string, string]): ProfileTheme {
  return {
    id,
    name,
    accent,
    headerGradient,
    coverBg: headerGradient[0],
    coverGradient: headerGradient,
    avatarBorder: accent,
    nameColor: readableOn(headerGradient[0]),
    statsBg: palette.bgBase,
    statsBorder: palette.borderSubtle,
    statsValColor: accent,
    bodyText: palette.textPrimary,
    bodyTextSecondary: palette.textSecondary,
    btn1Bg: accent,
    btn1Color: readableOn(accent),
    btn2Bg: palette.bgBase,
    btn2Color: palette.textPrimary,
    tabActive: accent,
    tabInactive: palette.borderSubtle,
    tabInactiveText: palette.textSecondary,
    cellColors: [palette.bgBase, palette.bgSurface, palette.borderSubtle, accent],
  };
}

// ── The six themes (numbering kept from the original fifteen) ───────────────────

export const PROFILE_THEMES: ProfileTheme[] = [
  makeTheme(1, 'Dark Blue', '#378add', ['#1a3a5f', '#378add']),
  makeTheme(2, 'Light Purple', '#6d63da', ['#534ab7', '#9a93ee']),
  makeTheme(4, 'Pure White', '#6b7280', ['#d1d5db', '#f3f4f6']),
  makeTheme(6, 'Sunset Orange', '#e5541d', ['#ff6b35', '#ffb347']),
  makeTheme(10, 'Soft Sage', '#6b8f71', ['#8fb095', '#e8e3d8']),
  makeTheme(12, 'Ocean Deep', '#0d9488', ['#0a2530', '#0d9488']),
];

export const DEFAULT_PROFILE_THEME_ID = 1;

/** Ids that no longer exist → the theme that replaces them. users.profile_theme_id is not rewritten. */
export const LEGACY_THEME_MAP: Readonly<Record<number, number>> = {
  3: 12,
  5: 2,
  7: 6,
  8: 1,
  9: 1,
  11: 2,
  13: 4,
  14: 12,
  15: 12,
};

/** The id of the theme that is actually shown for a stored id: legacy ids are mapped, unknown ones become 1. */
export function resolveProfileThemeId(id: number | null | undefined): number {
  if (typeof id !== 'number' || !Number.isFinite(id)) return DEFAULT_PROFILE_THEME_ID;
  const mapped = LEGACY_THEME_MAP[id] ?? id;
  return PROFILE_THEMES.some((theme) => theme.id === mapped) ? mapped : DEFAULT_PROFILE_THEME_ID;
}

/**
 * The theme for a stored id: one of the six, a legacy id through LEGACY_THEME_MAP, or Dark Blue (1) for anything
 * unknown.
 */
export function getProfileTheme(id: number | null | undefined): ProfileTheme {
  const resolved = resolveProfileThemeId(id);
  return PROFILE_THEMES.find((theme) => theme.id === resolved) ?? PROFILE_THEMES[0];
}
