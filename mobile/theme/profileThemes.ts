/**
 * JChat 3.0 — Profile Themes (Task 0.5)
 * Source of truth: JCHAT_3.0_DESIGN_SYSTEM.docx · Section 7
 *
 * This file intentionally holds literal hex values — it IS the token source
 * for profile-theme colors, not a consumer. All other files must use
 * getProfileTheme() / PROFILE_THEMES instead of inlining hex.
 *
 * Derivation rules for fields not listed explicitly in the Design System:
 *   avatarBorder   = accent color
 *   nameColor      = #ffffff on dark covers (luminance < 0.35); #1d1d1f on light covers
 *   statsValColor  = accent color
 *   bodyText       = high-contrast primary text on statsBg
 *   bodyTextSecondary = high-contrast secondary text on statsBg (>= 4.5:1)
 *   btn2Bg         = statsBg (same surface, renders as outline-style secondary)
 *   btn2Color      = high-contrast text on statsBg
 *   tabInactive    = legacy decorative tone; do not use for tab labels
 *   tabInactiveText = high-contrast inactive icon/label color on statsBg
 *   cellColors     = [statsBg, midpoint between statsBg and accent (eyeballed),
 *                     accent at 40% opacity emulated as hex blend, statsBorder]
 *                    3–4 placeholder cell shades that span the theme palette
 *
 * "sky" gradient stop for Theme 8 (Arctic Blue) = #87cefa
 */

export type ProfileTheme = {
  id: number;
  name: string;
  /** Solid fallback cover color (first gradient stop when gradient). */
  coverBg: string;
  /** Gradient stops; empty array when cover is solid. */
  coverGradient: string[];
  avatarBorder: string;
  nameColor: string;
  statsBg: string;
  statsBorder: string;
  statsValColor: string;
  bodyText: string;
  bodyTextSecondary: string;
  btn1Bg: string;
  btn1Color: string;
  btn2Bg: string;
  btn2Color: string;
  tabActive: string;
  tabInactive: string;
  tabInactiveText: string;
  /** 3–4 post-grid placeholder cell colors derived from the theme. */
  cellColors: string[];
};

export const PROFILE_THEMES: ProfileTheme[] = [
  // ── 1 Dark Blue ──────────────────────────────────────────────────────────
  {
    id: 1,
    name: 'Dark Blue',
    coverBg: '#1a1d2e',
    coverGradient: [],
    avatarBorder: '#378add',
    nameColor: '#ffffff',
    statsBg: '#1a1d2e',
    statsBorder: '#2a2a2e',
    statsValColor: '#378add',
    bodyText: '#ffffff',
    bodyTextSecondary: '#d1d5db',
    btn1Bg: '#1769aa',
    btn1Color: '#ffffff',
    btn2Bg: '#1a1d2e',
    btn2Color: '#ffffff',
    tabActive: '#ffffff',
    tabInactive: '#2a2a2e',
    tabInactiveText: '#d1d5db',
    cellColors: ['#1a1d2e', '#223050', '#2a3d68', '#2a2a2e'],
  },
  // ── 2 Light Purple ───────────────────────────────────────────────────────
  {
    id: 2,
    name: 'Light Purple',
    coverBg: '#534ab7',
    coverGradient: ['#534ab7', '#378add'],
    avatarBorder: '#534ab7',
    nameColor: '#ffffff',
    statsBg: '#ffffff',
    statsBorder: '#e5e5ea',
    statsValColor: '#534ab7',
    bodyText: '#1d1d1f',
    bodyTextSecondary: '#4a4a4f',
    btn1Bg: '#534ab7',
    btn1Color: '#ffffff',
    btn2Bg: '#ffffff',
    btn2Color: '#1d1d1f',
    tabActive: '#534ab7',
    tabInactive: '#e5e5ea',
    tabInactiveText: '#4a4a4f',
    cellColors: ['#f0eeff', '#d8d3f5', '#b8b0ec', '#e5e5ea'],
  },
  // ── 3 Mint Dark ──────────────────────────────────────────────────────────
  {
    id: 3,
    name: 'Mint Dark',
    coverBg: '#003320',
    coverGradient: [],
    avatarBorder: '#00ff88',
    nameColor: '#ffffff',
    statsBg: '#003320',
    statsBorder: '#006640',
    statsValColor: '#00ff88',
    bodyText: '#ffffff',
    bodyTextSecondary: '#d1d5db',
    btn1Bg: '#00ff88',
    btn1Color: '#010d0a',
    btn2Bg: '#003320',
    btn2Color: '#ffffff',
    tabActive: '#00ff88',
    tabInactive: '#006640',
    tabInactiveText: '#d1d5db',
    cellColors: ['#003320', '#004d30', '#006640', '#00994d'],
  },
  // ── 4 Pure White ─────────────────────────────────────────────────────────
  {
    id: 4,
    name: 'Pure White',
    coverBg: '#1d1d1f',
    coverGradient: [],
    avatarBorder: '#1d1d1f',
    nameColor: '#ffffff',
    statsBg: '#ffffff',
    statsBorder: '#f2f2f7',
    statsValColor: '#1d1d1f',
    bodyText: '#1d1d1f',
    bodyTextSecondary: '#4a4a4f',
    btn1Bg: '#1d1d1f',
    btn1Color: '#ffffff',
    btn2Bg: '#ffffff',
    btn2Color: '#1d1d1f',
    tabActive: '#1d1d1f',
    tabInactive: '#f2f2f7',
    tabInactiveText: '#4a4a4f',
    cellColors: ['#f9f9fb', '#f2f2f7', '#e5e5ea', '#d1d1d6'],
  },
  // ── 5 Royal Purple ───────────────────────────────────────────────────────
  {
    id: 5,
    name: 'Royal Purple',
    coverBg: '#2a1040',
    coverGradient: [],
    avatarBorder: '#7c3aed',
    nameColor: '#ffffff',
    statsBg: '#2a1040',
    statsBorder: '#4c1d95',
    statsValColor: '#7c3aed',
    bodyText: '#ffffff',
    bodyTextSecondary: '#d1d5db',
    btn1Bg: '#7c3aed',
    btn1Color: '#ede9fe',
    btn2Bg: '#2a1040',
    btn2Color: '#ffffff',
    tabActive: '#ffffff',
    tabInactive: '#4c1d95',
    tabInactiveText: '#d1d5db',
    cellColors: ['#2a1040', '#3d1860', '#4c1d95', '#6d28d9'],
  },
  // ── 6 Sunset Orange ──────────────────────────────────────────────────────
  {
    id: 6,
    name: 'Sunset Orange',
    coverBg: '#2a0d18',
    coverGradient: [],
    avatarBorder: '#ff6b35',
    nameColor: '#ffffff',
    statsBg: '#2a1520',
    statsBorder: '#4a1530',
    statsValColor: '#ff6b35',
    bodyText: '#ffffff',
    bodyTextSecondary: '#d1d5db',
    btn1Bg: '#c2410c',
    btn1Color: '#ffffff',
    btn2Bg: '#2a1520',
    btn2Color: '#ffffff',
    tabActive: '#ffffff',
    tabInactive: '#4a1530',
    tabInactiveText: '#d1d5db',
    cellColors: ['#2a1520', '#3d1825', '#4a1530', '#7a2840'],
  },
  // ── 7 Rose Gold ──────────────────────────────────────────────────────────
  {
    id: 7,
    name: 'Rose Gold',
    coverBg: '#221015',
    coverGradient: [],
    avatarBorder: '#c9826e',
    nameColor: '#ffffff',
    statsBg: '#2a1218',
    statsBorder: '#3a1a20',
    statsValColor: '#c9826e',
    bodyText: '#ffffff',
    bodyTextSecondary: '#d1d5db',
    btn1Bg: '#9f4f3d',
    btn1Color: '#ffffff',
    btn2Bg: '#2a1218',
    btn2Color: '#ffffff',
    tabActive: '#ffffff',
    tabInactive: '#3a1a20',
    tabInactiveText: '#d1d5db',
    cellColors: ['#2a1218', '#3a1a20', '#5a2a30', '#8a4a4a'],
  },
  // ── 8 Arctic Blue ────────────────────────────────────────────────────────
  {
    id: 8,
    name: 'Arctic Blue',
    coverBg: '#2a5fcf',
    coverGradient: ['#2a5fcf', '#87cefa'],
    avatarBorder: '#2a5fcf',
    nameColor: '#ffffff',
    statsBg: '#d0e0ff',
    statsBorder: '#c0d4f0',
    statsValColor: '#2a5fcf',
    bodyText: '#1d1d1f',
    bodyTextSecondary: '#4a4a4f',
    btn1Bg: '#2a5fcf',
    btn1Color: '#ffffff',
    btn2Bg: '#d0e0ff',
    btn2Color: '#1d1d1f',
    tabActive: '#1d1d1f',
    tabInactive: '#c0d4f0',
    tabInactiveText: '#4a4a4f',
    cellColors: ['#d0e0ff', '#b8d0f8', '#87cefa', '#c0d4f0'],
  },
  // ── 9 Gold Black ─────────────────────────────────────────────────────────
  {
    id: 9,
    name: 'Gold Black',
    coverBg: '#201800',
    coverGradient: [],
    avatarBorder: '#d97706',
    nameColor: '#ffffff',
    statsBg: '#2a2010',
    statsBorder: '#3a2c10',
    statsValColor: '#d97706',
    bodyText: '#ffffff',
    bodyTextSecondary: '#d1d5db',
    btn1Bg: '#d97706',
    btn1Color: '#1a1208',
    btn2Bg: '#2a2010',
    btn2Color: '#ffffff',
    tabActive: '#ffffff',
    tabInactive: '#3a2c10',
    tabInactiveText: '#d1d5db',
    cellColors: ['#2a2010', '#3a2c10', '#5a4010', '#8a6020'],
  },
  // ── 10 Soft Sage ─────────────────────────────────────────────────────────
  {
    id: 10,
    name: 'Soft Sage',
    coverBg: '#e8e3d8',
    coverGradient: [],
    avatarBorder: '#6b8f71',
    nameColor: '#1d1d1f',
    statsBg: '#ddd8ce',
    statsBorder: '#c8bfa8',
    statsValColor: '#6b8f71',
    bodyText: '#1d1d1f',
    bodyTextSecondary: '#4a4a4f',
    btn1Bg: '#426a49',
    btn1Color: '#ffffff',
    btn2Bg: '#ddd8ce',
    btn2Color: '#1d1d1f',
    tabActive: '#1d1d1f',
    tabInactive: '#c8bfa8',
    tabInactiveText: '#4a4a4f',
    cellColors: ['#ddd8ce', '#ccc8b8', '#b0c8b4', '#6b8f71'],
  },
  // ── 11 Neon Pink ─────────────────────────────────────────────────────────
  {
    id: 11,
    name: 'Neon Pink',
    coverBg: '#200030',
    coverGradient: [],
    avatarBorder: '#e040fb',
    nameColor: '#ffffff',
    statsBg: '#200030',
    statsBorder: '#5a0080',
    statsValColor: '#e040fb',
    bodyText: '#ffffff',
    bodyTextSecondary: '#d1d5db',
    btn1Bg: '#9c27b0',
    btn1Color: '#ffffff',
    btn2Bg: '#200030',
    btn2Color: '#ffffff',
    tabActive: '#ffffff',
    tabInactive: '#5a0080',
    tabInactiveText: '#d1d5db',
    cellColors: ['#200030', '#380050', '#5a0080', '#8800c0'],
  },
  // ── 12 Ocean Deep ────────────────────────────────────────────────────────
  {
    id: 12,
    name: 'Ocean Deep',
    coverBg: '#0a2530',
    coverGradient: [],
    avatarBorder: '#0d9488',
    nameColor: '#ffffff',
    statsBg: '#0a2530',
    statsBorder: '#0e4050',
    statsValColor: '#0d9488',
    bodyText: '#ffffff',
    bodyTextSecondary: '#d1d5db',
    btn1Bg: '#08766e',
    btn1Color: '#ffffff',
    btn2Bg: '#0a2530',
    btn2Color: '#ffffff',
    tabActive: '#ffffff',
    tabInactive: '#0e4050',
    tabInactiveText: '#d1d5db',
    cellColors: ['#0a2530', '#0e4050', '#0d6060', '#0d9488'],
  },
  // ── 13 Paper Cream ───────────────────────────────────────────────────────
  {
    id: 13,
    name: 'Paper Cream',
    coverBg: '#1a1a1a',
    coverGradient: [],
    avatarBorder: '#1a1a1a',
    nameColor: '#ffffff',
    statsBg: '#ede8dc',
    statsBorder: '#d4c9b0',
    statsValColor: '#1a1a1a',
    bodyText: '#1d1d1f',
    bodyTextSecondary: '#4a4a4f',
    btn1Bg: '#1a1a1a',
    btn1Color: '#f5f0e8',
    btn2Bg: '#ede8dc',
    btn2Color: '#1a1a1a',
    tabActive: '#1a1a1a',
    tabInactive: '#d4c9b0',
    tabInactiveText: '#4a4a4f',
    cellColors: ['#ede8dc', '#e0daca', '#d4c9b0', '#c8b898'],
  },
  // ── 14 Deep Space ────────────────────────────────────────────────────────
  {
    id: 14,
    name: 'Deep Space',
    coverBg: '#0d1535',
    coverGradient: [],
    avatarBorder: '#d4a820',
    nameColor: '#ffffff',
    statsBg: '#0d1535',
    statsBorder: '#1a2550',
    statsValColor: '#d4a820',
    bodyText: '#ffffff',
    bodyTextSecondary: '#d1d5db',
    btn1Bg: '#d4a820',
    btn1Color: '#050818',
    btn2Bg: '#0d1535',
    btn2Color: '#ffffff',
    tabActive: '#ffffff',
    tabInactive: '#1a2550',
    tabInactiveText: '#d1d5db',
    cellColors: ['#0d1535', '#1a2550', '#2a3870', '#d4a820'],
  },
  // ── 15 Cyber Cyan ────────────────────────────────────────────────────────
  {
    id: 15,
    name: 'Cyber Cyan',
    coverBg: '#001a22',
    coverGradient: [],
    avatarBorder: '#00f5ff',
    nameColor: '#ffffff',
    statsBg: '#001a22',
    statsBorder: '#005566',
    statsValColor: '#00f5ff',
    bodyText: '#ffffff',
    bodyTextSecondary: '#d1d5db',
    btn1Bg: '#00f5ff',
    btn1Color: '#020c12',
    btn2Bg: '#001a22',
    btn2Color: '#ffffff',
    tabActive: '#ffffff',
    tabInactive: '#005566',
    tabInactiveText: '#d1d5db',
    cellColors: ['#001a22', '#003344', '#005566', '#007788'],
  },
];

/**
 * Returns the ProfileTheme for the given id (1–15).
 * Falls back to theme 1 (Dark Blue) for out-of-range values.
 */
export function getProfileTheme(id: number): ProfileTheme {
  const theme = PROFILE_THEMES.find((t) => t.id === id);
  return theme ?? PROFILE_THEMES[0];
}
