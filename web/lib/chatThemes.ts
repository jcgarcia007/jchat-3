/**
 * JChat 3.0 — Chat Room Themes
 * Exact port of mobile/theme/chatThemes.ts — do NOT diverge from these values.
 * Source of truth: JCHAT_3.0_DESIGN_SYSTEM.docx · Section 6
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
    topBg: '#18181b',
    border: '#2a2a2e',
    accent: '#378add',
    bubbleInBg: '#2a2a2e',
    bubbleInText: '#d1d1d6',
    bubbleOutBg: '#378add',
    bubbleOutText: '#ffffff',
    inputBg: '#1e1e22',
    tabActive: '#378add',
    tabInactive: 'rgba(255,255,255,0.35)',
  },

  // ─── 2 · Neomorphism ─────────────────────────────────────────────────────────
  {
    id: 2,
    name: 'Neomorphism',
    bg: '#e8eaf0',
    topBg: '#dddfe8',
    border: '#c8cad4',
    accent: '#5068e0',
    bubbleInBg: '#e8eaf0',
    bubbleInText: '#3a3d55',
    bubbleOutBg: '#e8eaf0',
    bubbleOutText: '#5068e0',
    inputBg: '#dddfe8',
    tabActive: '#5068e0',
    tabInactive: '#8e91a8',
  },

  // ─── 3 · Brutalist ───────────────────────────────────────────────────────────
  {
    id: 3,
    name: 'Brutalist',
    bg: '#ffffff',
    topBg: '#f5f500',
    border: '#000000',
    accent: '#000000',
    bubbleInBg: '#ffffff',
    bubbleInText: '#000000',
    bubbleOutBg: '#000000',
    bubbleOutText: '#f5f500',
    inputBg: '#f5f5f5',
    tabActive: '#000000',
    tabInactive: '#666666',
  },

  // ─── 4 · Sunset ──────────────────────────────────────────────────────────────
  {
    id: 4,
    name: 'Sunset',
    bg: '#1a0a0f',
    topBg: '#22101a',
    border: '#3a1525',
    accent: '#ff6b35',
    bubbleInBg: '#2a0d18',
    bubbleInText: '#ffd4b8',
    bubbleOutBg: '#ff6b35',
    bubbleOutText: '#ffffff',
    inputBg: '#2a0d18',
    tabActive: '#ff6b35',
    tabInactive: 'rgba(255,255,255,0.35)',
  },

  // ─── 5 · Sage & Clay ─────────────────────────────────────────────────────────
  {
    id: 5,
    name: 'Sage & Clay',
    bg: '#f0ede6',
    topBg: '#e4e0d8',
    border: '#ccc8be',
    accent: '#6b8f71',
    bubbleInBg: '#e8e3d8',
    bubbleInText: '#3a3028',
    bubbleOutBg: '#6b8f71',
    bubbleOutText: '#ffffff',
    inputBg: '#e8e3d8',
    tabActive: '#6b8f71',
    tabInactive: '#8e8880',
  },

  // ─── 6 · Electric Orange ─────────────────────────────────────────────────────
  {
    id: 6,
    name: 'Electric Orange',
    bg: '#0d0d0d',
    topBg: '#1a1a1a',
    border: '#2a2a2a',
    accent: '#ff5c00',
    bubbleInBg: '#1a1a1a',
    bubbleInText: '#cccccc',
    bubbleOutBg: '#ff5c00',
    bubbleOutText: '#ffffff',
    inputBg: '#1f1f1f',
    tabActive: '#ff5c00',
    tabInactive: 'rgba(255,255,255,0.35)',
  },

  // ─── 7 · Arctic Blue ─────────────────────────────────────────────────────────
  {
    id: 7,
    name: 'Arctic Blue',
    bg: '#f0f5ff',
    topBg: '#e0eaff',
    border: '#a8c4e8',
    accent: '#2a5fcf',
    bubbleInBg: '#c0d4f0',
    bubbleInText: '#0a1a40',
    bubbleOutBg: '#2a5fcf',
    bubbleOutText: '#ffffff',
    inputBg: '#e0eaff',
    tabActive: '#2a5fcf',
    tabInactive: '#6080b0',
  },

  // ─── 8 · Mint Dark ───────────────────────────────────────────────────────────
  {
    id: 8,
    name: 'Mint Dark',
    bg: '#010d0a',
    topBg: '#041a13',
    border: '#003320',
    accent: '#00ff88',
    bubbleInBg: '#003320',
    bubbleInText: '#ccffe8',
    bubbleOutBg: '#00ff88',
    bubbleOutText: '#010d0a',
    inputBg: '#00190f',
    tabActive: '#00ff88',
    tabInactive: 'rgba(255,255,255,0.35)',
  },

  // ─── 9 · Rose Gold ───────────────────────────────────────────────────────────
  {
    id: 9,
    name: 'Rose Gold',
    bg: '#1a0d0d',
    topBg: '#221515',
    border: '#3a1f1f',
    accent: '#c9826e',
    bubbleInBg: '#221015',
    bubbleInText: '#f0d8cc',
    bubbleOutBg: '#c9826e',
    bubbleOutText: '#ffffff',
    inputBg: '#221015',
    tabActive: '#c9826e',
    tabInactive: 'rgba(255,255,255,0.35)',
  },

  // ─── 10 · Swiss Mono ─────────────────────────────────────────────────────────
  {
    id: 10,
    name: 'Swiss Mono',
    bg: '#ffffff',
    topBg: '#f0f0f0',
    border: '#000000',
    accent: '#000000',
    bubbleInBg: '#f5f5f5',
    bubbleInText: '#000000',
    bubbleOutBg: '#000000',
    bubbleOutText: '#ffffff',
    inputBg: '#f5f5f5',
    tabActive: '#000000',
    tabInactive: '#888888',
  },

  // ─── 11 · Deep Space ─────────────────────────────────────────────────────────
  {
    id: 11,
    name: 'Deep Space',
    bg: '#050818',
    topBg: '#0a1028',
    border: '#1a2040',
    accent: '#d4a820',
    bubbleInBg: '#080e28',
    bubbleInText: '#e8ddb0',
    bubbleOutBg: '#d4a820',
    bubbleOutText: '#050818',
    inputBg: '#080e28',
    tabActive: '#d4a820',
    tabInactive: 'rgba(255,255,255,0.35)',
  },

  // ─── 12 · Pastel Soft ────────────────────────────────────────────────────────
  {
    id: 12,
    name: 'Pastel Soft',
    bg: '#fef6ff',
    topBg: '#f5eaff',
    border: '#e0b8f0',
    accent: '#d4a0e8',
    bubbleInBg: '#e8cff0',
    bubbleInText: '#5a3070',
    bubbleOutBg: '#d4a0e8',
    bubbleOutText: '#ffffff',
    inputBg: '#f0e0f8',
    tabActive: '#d4a0e8',
    tabInactive: '#a880c0',
  },

  // ─── 13 · Retro 80s ──────────────────────────────────────────────────────────
  {
    id: 13,
    name: 'Retro 80s',
    bg: '#0a001a',
    topBg: '#150030',
    border: '#3a0060',
    accent: '#ff00ff',
    bubbleInBg: '#1a0035',
    bubbleInText: '#ff00ff',
    bubbleOutBg: '#ff00ff',
    bubbleOutText: '#0a001a',
    inputBg: '#1a0035',
    tabActive: '#ff00ff',
    tabInactive: 'rgba(255,255,255,0.35)',
  },

  // ─── 14 · Sand Dunes ─────────────────────────────────────────────────────────
  {
    id: 14,
    name: 'Sand Dunes',
    bg: '#1a1208',
    topBg: '#221a0e',
    border: '#3a2e18',
    accent: '#c8a040',
    bubbleInBg: '#221a0a',
    bubbleInText: '#e8d8a0',
    bubbleOutBg: '#c8a040',
    bubbleOutText: '#1a1208',
    inputBg: '#221a0a',
    tabActive: '#c8a040',
    tabInactive: 'rgba(255,255,255,0.35)',
  },

  // ─── 15 · Icy Glass ──────────────────────────────────────────────────────────
  {
    id: 15,
    name: 'Icy Glass',
    bg: '#e8f0f8',
    topBg: '#d0e0f0',
    border: 'rgba(60,120,220,0.2)',
    accent: 'rgba(60,120,220,0.4)',
    bubbleInBg: 'rgba(255,255,255,0.7)',
    bubbleInText: '#1a2a50',
    bubbleOutBg: 'rgba(60,120,220,0.25)',
    bubbleOutText: '#1a2a50',
    inputBg: 'rgba(255,255,255,0.5)',
    tabActive: 'rgba(60,120,220,0.4)',
    tabInactive: 'rgba(30,60,120,0.35)',
  },
];

/**
 * Returns the ChatTheme for a given id (1–15).
 * Falls back to theme 1 (Black & Blue) for out-of-range or missing ids.
 */
export function getChatTheme(themeId: number): ChatTheme {
  const theme = CHAT_THEMES.find((t) => t.id === themeId);
  return theme ?? CHAT_THEMES[0];
}
