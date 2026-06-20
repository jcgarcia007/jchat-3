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
 *   btn2Bg         = statsBg (same surface, renders as outline-style secondary)
 *   btn2Color      = accent color
 *   tabInactive    = statsBorder (a muted tone that reads on the stats/page bg)
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
  btn1Bg: string;
  btn1Color: string;
  btn2Bg: string;
  btn2Color: string;
  tabActive: string;
  tabInactive: string;
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
    btn1Bg: '#378add',
    btn1Color: '#ffffff',
    btn2Bg: '#1a1d2e',
    btn2Color: '#378add',
    tabActive: '#378add',
    tabInactive: '#2a2a2e',
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
    btn1Bg: '#534ab7',
    btn1Color: '#ffffff',
    btn2Bg: '#ffffff',
    btn2Color: '#534ab7',
    tabActive: '#534ab7',
    tabInactive: '#e5e5ea',
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
    btn1Bg: '#00ff88',
    btn1Color: '#010d0a',
    btn2Bg: '#003320',
    btn2Color: '#00ff88',
    tabActive: '#00ff88',
    tabInactive: '#006640',
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
    btn1Bg: '#1d1d1f',
    btn1Color: '#ffffff',
    btn2Bg: '#ffffff',
    btn2Color: '#1d1d1f',
    tabActive: '#1d1d1f',
    tabInactive: '#f2f2f7',
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
    btn1Bg: '#7c3aed',
    btn1Color: '#ede9fe',
    btn2Bg: '#2a1040',
    btn2Color: '#7c3aed',
    tabActive: '#7c3aed',
    tabInactive: '#4c1d95',
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
    btn1Bg: '#ff6b35',
    btn1Color: '#ffffff',
    btn2Bg: '#2a1520',
    btn2Color: '#ff6b35',
    tabActive: '#ff6b35',
    tabInactive: '#4a1530',
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
    btn1Bg: '#c9826e',
    btn1Color: '#ffffff',
    btn2Bg: '#2a1218',
    btn2Color: '#c9826e',
    tabActive: '#c9826e',
    tabInactive: '#3a1a20',
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
    btn1Bg: '#2a5fcf',
    btn1Color: '#ffffff',
    btn2Bg: '#d0e0ff',
    btn2Color: '#2a5fcf',
    tabActive: '#2a5fcf',
    tabInactive: '#c0d4f0',
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
    btn1Bg: '#d97706',
    btn1Color: '#1a1208',
    btn2Bg: '#2a2010',
    btn2Color: '#d97706',
    tabActive: '#d97706',
    tabInactive: '#3a2c10',
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
    btn1Bg: '#6b8f71',
    btn1Color: '#ffffff',
    btn2Bg: '#ddd8ce',
    btn2Color: '#6b8f71',
    tabActive: '#6b8f71',
    tabInactive: '#c8bfa8',
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
    btn1Bg: '#e040fb',
    btn1Color: '#ffffff',
    btn2Bg: '#200030',
    btn2Color: '#e040fb',
    tabActive: '#e040fb',
    tabInactive: '#5a0080',
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
    btn1Bg: '#0d9488',
    btn1Color: '#ffffff',
    btn2Bg: '#0a2530',
    btn2Color: '#0d9488',
    tabActive: '#0d9488',
    tabInactive: '#0e4050',
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
    btn1Bg: '#1a1a1a',
    btn1Color: '#f5f0e8',
    btn2Bg: '#ede8dc',
    btn2Color: '#1a1a1a',
    tabActive: '#1a1a1a',
    tabInactive: '#d4c9b0',
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
    btn1Bg: '#d4a820',
    btn1Color: '#050818',
    btn2Bg: '#0d1535',
    btn2Color: '#d4a820',
    tabActive: '#d4a820',
    tabInactive: '#1a2550',
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
    btn1Bg: '#00f5ff',
    btn1Color: '#020c12',
    btn2Bg: '#001a22',
    btn2Color: '#00f5ff',
    tabActive: '#00f5ff',
    tabInactive: '#005566',
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
