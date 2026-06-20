/**
 * JChat 3.0 — Chat Room Themes (Task 0.4)
 * Source of truth: JCHAT_3.0_DESIGN_SYSTEM.docx · Section 6
 *
 * Derivation rules for keys NOT specified in the design doc:
 *   topBg       — header/bar color; explicit for theme 3 (#f5f500); for light themes,
 *                 a slightly darkened surface (bg tinted ~5% gray); for dark themes,
 *                 a step above bg (roughly +0x08 per channel, clamped). See per-theme.
 *   border      — a subtle divider; for dark themes: a low-contrast lighter tone;
 *                 for light themes: a medium-contrast gray line; for themes with
 *                 explicit "border" bubbles (3, 7, 10, 12), the border color used
 *                 there is re-used as the general divider.
 *   inputBg     — slightly elevated surface; usually close to bubbleInBg but at
 *                 reduced opacity / shifted lightness so it reads as an inset field.
 *   tabActive   — identical to accent (per spec).
 *   tabInactive — a muted/grayed tone legible on bg; for dark themes: 40–50 % opacity
 *                 white; for light themes: a mid-gray derived from bg.
 *
 * getChatTheme(themeId) returns theme 1 (Black & Blue) for out-of-range ids.
 */

export type ChatTheme = {
  id: number;
  name: string;
  bg: string;
  topBg: string;
  border: string;
  accent: string;
  bubbleInBg: string;
  bubbleInText: string;
  bubbleOutBg: string;
  bubbleOutText: string;
  inputBg: string;
  tabActive: string;
  tabInactive: string;
};

export const CHAT_THEMES: ChatTheme[] = [
  // ─── 1 · Black & Blue ────────────────────────────────────────────────────────
  {
    id: 1,
    name: 'Black & Blue',
    bg: '#0f0f11',
    topBg: '#18181b',          // step above bg (~+0x09 per channel)
    border: '#2a2a2e',         // subtle dark divider
    accent: '#378add',
    bubbleInBg: '#2a2a2e',
    bubbleInText: '#d1d1d6',
    bubbleOutBg: '#378add',
    bubbleOutText: '#ffffff',
    inputBg: '#1e1e22',        // midway between bg and bubbleInBg
    tabActive: '#378add',
    tabInactive: 'rgba(255,255,255,0.35)',
  },

  // ─── 2 · Neomorphism ─────────────────────────────────────────────────────────
  // "shadow" bubbles: bg matches the main bg so the shadow creates depth
  {
    id: 2,
    name: 'Neomorphism',
    bg: '#e8eaf0',
    topBg: '#dddfe8',          // slightly darker than bg for light theme bar
    border: '#c8cad4',         // muted gray, visible on light surface
    accent: '#5068e0',
    bubbleInBg: '#e8eaf0',     // same as bg — shadow provides the depth
    bubbleInText: '#3a3d55',
    bubbleOutBg: '#e8eaf0',    // same as bg — shadow provides the depth
    bubbleOutText: '#5068e0',
    inputBg: '#dddfe8',        // recessed inset field
    tabActive: '#5068e0',
    tabInactive: '#8e91a8',    // muted purple-gray, legible on #e8eaf0
  },

  // ─── 3 · Brutalist ───────────────────────────────────────────────────────────
  // bg = white for message area; bars/header = #f5f500 (explicit in spec)
  {
    id: 3,
    name: 'Brutalist',
    bg: '#ffffff',
    topBg: '#f5f500',          // explicit per spec ("bars")
    border: '#000000',         // brutalist black border
    accent: '#000000',
    bubbleInBg: '#ffffff',     // explicit — white with black border
    bubbleInText: '#000000',
    bubbleOutBg: '#000000',
    bubbleOutText: '#f5f500',
    inputBg: '#f5f5f5',        // very light off-white inset
    tabActive: '#000000',
    tabInactive: '#666666',    // mid-gray, readable on white/yellow
  },

  // ─── 4 · Sunset ──────────────────────────────────────────────────────────────
  {
    id: 4,
    name: 'Sunset',
    bg: '#1a0a0f',
    topBg: '#22101a',          // step above bg
    border: '#3a1525',         // subtle warm-dark divider
    accent: '#ff6b35',
    bubbleInBg: '#2a0d18',
    bubbleInText: '#ffd4b8',
    bubbleOutBg: '#ff6b35',
    bubbleOutText: '#ffffff',
    inputBg: '#2a0d18',        // matches bubbleInBg (inset field same surface)
    tabActive: '#ff6b35',
    tabInactive: 'rgba(255,255,255,0.35)',
  },

  // ─── 5 · Sage & Clay ─────────────────────────────────────────────────────────
  {
    id: 5,
    name: 'Sage & Clay',
    bg: '#f0ede6',
    topBg: '#e4e0d8',          // slightly darker warm-white for bar
    border: '#ccc8be',         // muted warm-gray divider
    accent: '#6b8f71',
    bubbleInBg: '#e8e3d8',
    bubbleInText: '#3a3028',
    bubbleOutBg: '#6b8f71',
    bubbleOutText: '#ffffff',
    inputBg: '#e8e3d8',        // matches bubbleInBg
    tabActive: '#6b8f71',
    tabInactive: '#8e8880',    // warm mid-gray, readable on #f0ede6
  },

  // ─── 6 · Electric Orange ─────────────────────────────────────────────────────
  {
    id: 6,
    name: 'Electric Orange',
    bg: '#0d0d0d',
    topBg: '#1a1a1a',          // step above near-black
    border: '#2a2a2a',         // subtle dark divider
    accent: '#ff5c00',
    bubbleInBg: '#1a1a1a',
    bubbleInText: '#cccccc',
    bubbleOutBg: '#ff5c00',
    bubbleOutText: '#ffffff',
    inputBg: '#1f1f1f',        // slightly elevated above bg
    tabActive: '#ff5c00',
    tabInactive: 'rgba(255,255,255,0.35)',
  },

  // ─── 7 · Arctic Blue ─────────────────────────────────────────────────────────
  // bubbleIn has a border; bubbleInBg is #c0d4f0 per spec table
  {
    id: 7,
    name: 'Arctic Blue',
    bg: '#f0f5ff',
    topBg: '#e0eaff',          // cooler, slightly darker than bg
    border: '#a8c4e8',         // the bubble border color reused as divider
    accent: '#2a5fcf',
    bubbleInBg: '#c0d4f0',
    bubbleInText: '#0a1a40',
    bubbleOutBg: '#2a5fcf',
    bubbleOutText: '#ffffff',
    inputBg: '#e0eaff',        // recessed field, matches topBg tone
    tabActive: '#2a5fcf',
    tabInactive: '#6080b0',    // muted mid-blue, readable on light bg
  },

  // ─── 8 · Mint Dark ───────────────────────────────────────────────────────────
  {
    id: 8,
    name: 'Mint Dark',
    bg: '#010d0a',
    topBg: '#041a13',          // step above very dark green-black
    border: '#003320',         // dark teal divider
    accent: '#00ff88',
    bubbleInBg: '#003320',
    bubbleInText: '#ccffe8',
    bubbleOutBg: '#00ff88',
    bubbleOutText: '#010d0a',
    inputBg: '#00190f',        // slightly above bg
    tabActive: '#00ff88',
    tabInactive: 'rgba(255,255,255,0.35)',
  },

  // ─── 9 · Rose Gold ───────────────────────────────────────────────────────────
  {
    id: 9,
    name: 'Rose Gold',
    bg: '#1a0d0d',
    topBg: '#221515',          // slightly above bg
    border: '#3a1f1f',         // dark warm-rose divider
    accent: '#c9826e',
    bubbleInBg: '#221015',
    bubbleInText: '#f0d8cc',
    bubbleOutBg: '#c9826e',
    bubbleOutText: '#ffffff',
    inputBg: '#221015',        // matches bubbleInBg
    tabActive: '#c9826e',
    tabInactive: 'rgba(255,255,255,0.35)',
  },

  // ─── 10 · Swiss Mono ─────────────────────────────────────────────────────────
  // bubbleIn has border; inputBg uses very light gray
  {
    id: 10,
    name: 'Swiss Mono',
    bg: '#ffffff',
    topBg: '#f0f0f0',          // light gray bar
    border: '#000000',         // hard black border (swiss style)
    accent: '#000000',
    bubbleInBg: '#f5f5f5',
    bubbleInText: '#000000',
    bubbleOutBg: '#000000',
    bubbleOutText: '#ffffff',
    inputBg: '#f5f5f5',        // matches bubbleInBg
    tabActive: '#000000',
    tabInactive: '#888888',    // mid-gray, readable on white
  },

  // ─── 11 · Deep Space ─────────────────────────────────────────────────────────
  {
    id: 11,
    name: 'Deep Space',
    bg: '#050818',
    topBg: '#0a1028',          // step above near-black
    border: '#1a2040',         // dark indigo divider
    accent: '#d4a820',
    bubbleInBg: '#080e28',
    bubbleInText: '#e8ddb0',
    bubbleOutBg: '#d4a820',
    bubbleOutText: '#050818',
    inputBg: '#080e28',        // matches bubbleInBg
    tabActive: '#d4a820',
    tabInactive: 'rgba(255,255,255,0.35)',
  },

  // ─── 12 · Pastel Soft ────────────────────────────────────────────────────────
  // bubbleIn has border; border color reused as divider
  {
    id: 12,
    name: 'Pastel Soft',
    bg: '#fef6ff',
    topBg: '#f5eaff',          // slightly more saturated for bar
    border: '#e0b8f0',         // light purple divider (matches bubbleIn border tone)
    accent: '#d4a0e8',
    bubbleInBg: '#e8cff0',
    bubbleInText: '#5a3070',
    bubbleOutBg: '#d4a0e8',
    bubbleOutText: '#ffffff',
    inputBg: '#f0e0f8',        // slightly elevated above bg
    tabActive: '#d4a0e8',
    tabInactive: '#a880c0',    // muted purple, readable on #fef6ff
  },

  // ─── 13 · Retro 80s ──────────────────────────────────────────────────────────
  {
    id: 13,
    name: 'Retro 80s',
    bg: '#0a001a',
    topBg: '#150030',          // step above very dark purple
    border: '#3a0060',         // neon-adjacent purple divider
    accent: '#ff00ff',
    bubbleInBg: '#1a0035',
    bubbleInText: '#ff00ff',
    bubbleOutBg: '#ff00ff',
    bubbleOutText: '#0a001a',
    inputBg: '#1a0035',        // matches bubbleInBg
    tabActive: '#ff00ff',
    tabInactive: 'rgba(255,255,255,0.35)',
  },

  // ─── 14 · Sand Dunes ─────────────────────────────────────────────────────────
  {
    id: 14,
    name: 'Sand Dunes',
    bg: '#1a1208',
    topBg: '#221a0e',          // warm-brown step above bg
    border: '#3a2e18',         // sandy dark divider
    accent: '#c8a040',
    bubbleInBg: '#221a0a',
    bubbleInText: '#e8d8a0',
    bubbleOutBg: '#c8a040',
    bubbleOutText: '#1a1208',
    inputBg: '#221a0a',        // matches bubbleInBg
    tabActive: '#c8a040',
    tabInactive: 'rgba(255,255,255,0.35)',
  },

  // ─── 15 · Icy Glass ──────────────────────────────────────────────────────────
  // Uses rgba() values — keep as-is (per spec)
  {
    id: 15,
    name: 'Icy Glass',
    bg: '#e8f0f8',
    topBg: '#d0e0f0',          // slightly more saturated cool-blue for bar
    border: 'rgba(60,120,220,0.2)',  // very subtle glass-like divider
    accent: 'rgba(60,120,220,0.4)',
    bubbleInBg: 'rgba(255,255,255,0.7)',
    bubbleInText: '#1a2a50',
    bubbleOutBg: 'rgba(60,120,220,0.25)',
    bubbleOutText: '#1a2a50',
    inputBg: 'rgba(255,255,255,0.5)',  // frosted-glass field
    tabActive: 'rgba(60,120,220,0.4)',
    tabInactive: 'rgba(30,60,120,0.35)',
  },
];

/**
 * Returns the ChatTheme for a given id (1–15).
 * Falls back to theme 1 (Black & Blue) for out-of-range ids.
 */
export function getChatTheme(themeId: number): ChatTheme {
  const theme = CHAT_THEMES.find((t) => t.id === themeId);
  return theme ?? CHAT_THEMES[0];
}
