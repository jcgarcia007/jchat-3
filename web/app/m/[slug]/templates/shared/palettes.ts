/**
 * Menu palette system (single source of truth for template + sheet colors).
 *
 * Each template_id maps to a semantic palette. The shared sheets (customizer,
 * cart, pickup, success) and the board-faithful templates read their colors from
 * here so the whole flow — browse + modals — matches the template's original
 * board look. Templates not listed fall back to DEFAULT_PALETTE (= the current
 * dark design tokens), so they render identically to before.
 *
 * Only 13 SEMANTIC fields live here. Truly structural chrome that a single
 * template needs (e.g. the Forno drawer brown, the KAI navy rail) stays local to
 * that template.
 */
export interface MenuPalette {
  bg: string; // page / deepest background
  surface: string; // sheet panel + cards
  surfaceElevated: string; // nested rows / inputs / chips
  text: string; // primary text
  textMuted: string; // secondary text
  textFaint: string; // tertiary text
  border: string; // hairlines / dividers
  accent: string; // primary action / + / selected
  accentText: string; // text/icon on top of accent
  accentSoft: string; // translucent accent tint (selected option bg)
  price: string; // price emphasis
  danger: string; // remove / destructive
  overlay: string; // modal backdrop scrim
  accentGradient?: string; // optional CTA gradient (classic only)
}

// Green success and red danger stay semantic constants (not per-template).
export const SUCCESS_GREEN = "#059669";

/** Current dark design tokens — keeps classic and non-recolored templates identical. */
export const DEFAULT_PALETTE: MenuPalette = {
  bg: "var(--bg-base)",
  surface: "var(--bg-surface)",
  surfaceElevated: "var(--bg-elevated)",
  text: "var(--text-primary)",
  textMuted: "var(--text-secondary)",
  textFaint: "var(--text-tertiary)",
  border: "var(--border-subtle)",
  accent: "var(--color-brand)",
  accentText: "#fff",
  accentSoft: "rgba(79,70,229,0.12)",
  price: "var(--color-gold)",
  danger: "var(--color-danger)",
  overlay: "rgba(0,0,0,0.6)",
};

const CLASSIC_PALETTE: MenuPalette = {
  ...DEFAULT_PALETTE,
  accentGradient: "linear-gradient(135deg, var(--color-brand) 0%, var(--color-brand-purple) 100%)",
};

// #02 "Forno" — cream content, dark-brown drawer (chrome stays local), red accent.
const LEFT_DRAWER_PALETTE: MenuPalette = {
  bg: "#FAF7F2",
  surface: "#FFFFFF",
  surfaceElevated: "#F4ECE0",
  text: "#3C2A21",
  textMuted: "#6E5B4E",
  textFaint: "#9C8E7B",
  border: "#E7DFD3",
  accent: "#C2371F",
  accentText: "#FFFFFF",
  accentSoft: "rgba(194,55,31,0.12)",
  price: "#C2371F",
  danger: "var(--color-danger)",
  overlay: "rgba(30,15,8,0.5)",
};

// #03 "KAI" — deep navy stage, teal accent, gold prices.
const ICON_RAIL_PALETTE: MenuPalette = {
  bg: "#0B1020",
  surface: "#141B33",
  surfaceElevated: "#1B2542",
  text: "#FFFFFF",
  textMuted: "rgba(255,255,255,0.7)",
  textFaint: "rgba(255,255,255,0.5)",
  border: "rgba(255,255,255,0.10)",
  accent: "#4FD1C5",
  accentText: "#08131A",
  accentSoft: "rgba(79,209,197,0.14)",
  price: "#F2C879",
  danger: "var(--color-danger)",
  overlay: "rgba(0,0,0,0.66)",
};

// #11 "LA TABLE" — paper cream, ink text, burgundy accent.
const MAGAZINE_PALETTE: MenuPalette = {
  bg: "#F5F1E8",
  surface: "#FFFFFF",
  surfaceElevated: "#EFE9DB",
  text: "#211D15",
  textMuted: "#5C5340",
  textFaint: "#8C8064",
  border: "#C9BFA8",
  accent: "#A33B2E",
  accentText: "#FFFFFF",
  accentSoft: "rgba(163,59,46,0.12)",
  price: "#A33B2E",
  danger: "var(--color-danger)",
  overlay: "rgba(33,29,21,0.5)",
};

// #20 "MAISON OR" — black stage, gold everything, cream text.
const LUXURY_PALETTE: MenuPalette = {
  bg: "#0B0B0C",
  surface: "#141210",
  surfaceElevated: "#1A150F",
  text: "#F4EFE7",
  textMuted: "rgba(244,239,231,0.6)",
  textFaint: "rgba(244,239,231,0.4)",
  border: "rgba(201,169,106,0.25)",
  accent: "#C9A96A",
  accentText: "#1A1206",
  accentSoft: "rgba(201,169,106,0.14)",
  price: "#C9A96A",
  danger: "var(--color-danger)",
  overlay: "rgba(0,0,0,0.72)",
};

// #07 "VERDE" — deep green-black, green accent (single opaque FAB), mint price.
const GLASS_CHIPS_PALETTE: MenuPalette = {
  bg: "#0E1B14",
  surface: "#16281E",
  surfaceElevated: "#1E3328",
  text: "#FFFFFF",
  textMuted: "rgba(255,255,255,0.72)",
  textFaint: "rgba(255,255,255,0.5)",
  border: "rgba(255,255,255,0.10)",
  accent: "#2E9E5B",
  accentText: "#04140B",
  accentSoft: "rgba(46,158,91,0.16)",
  price: "#B7F0C6",
  danger: "var(--color-danger)",
  overlay: "rgba(0,0,0,0.66)",
};

// #08 "SECTION 214" — stadium black + yellow (price and actions both yellow).
const INFINITE_FEED_PALETTE: MenuPalette = {
  bg: "#0A0A0A",
  surface: "#141414",
  surfaceElevated: "#1C1C1C",
  text: "#FFFFFF",
  textMuted: "rgba(255,255,255,0.72)",
  textFaint: "rgba(255,255,255,0.5)",
  border: "#232323",
  accent: "#FFD60A",
  accentText: "#1A1206",
  accentSoft: "rgba(255,214,10,0.16)",
  price: "#FFD60A",
  danger: "var(--color-danger)",
  overlay: "rgba(0,0,0,0.7)",
};

// #13 "MARQUEE" — cinema black, red accent, gold prices.
const STREAMING_ROWS_PALETTE: MenuPalette = {
  bg: "#0D0D0F",
  surface: "#1A1A1D",
  surfaceElevated: "#232327",
  text: "#FFFFFF",
  textMuted: "rgba(255,255,255,0.7)",
  textFaint: "rgba(255,255,255,0.5)",
  border: "rgba(255,255,255,0.10)",
  accent: "#E0353F",
  accentText: "#FFFFFF",
  accentSoft: "rgba(224,53,63,0.16)",
  price: "#F2C879",
  danger: "var(--color-danger)",
  overlay: "rgba(0,0,0,0.7)",
};

// #04 "Daily Grind" — light café: cream paper, espresso text/accent, coffee gold.
const STICKY_TABS_PALETTE: MenuPalette = {
  bg: "#FBF6EF",
  surface: "#FFFFFF",
  surfaceElevated: "#F1E9DC",
  text: "#2E2317",
  textMuted: "#6E5E49",
  textFaint: "#A08F77",
  border: "#E9DFD0",
  accent: "#2E2317",
  accentText: "#FBF6EF",
  accentSoft: "rgba(46,35,23,0.10)",
  price: "#8A6C3C",
  danger: "var(--color-danger)",
  overlay: "rgba(46,35,23,0.5)",
};

// #09 "Swirl" — light pink, magenta accent, white cards.
const CAROUSEL_PALETTE: MenuPalette = {
  bg: "#FFF0F4",
  surface: "#FFFFFF",
  surfaceElevated: "#FFFFFF",
  text: "#8A2B4A",
  textMuted: "#A9557A",
  textFaint: "#C98BA3",
  border: "#F4D3DF",
  accent: "#E85D8A",
  accentText: "#FFFFFF",
  accentSoft: "rgba(232,93,138,0.14)",
  price: "#E85D8A",
  danger: "var(--color-danger)",
  overlay: "rgba(138,43,74,0.4)",
};

// #15 "Neon Palm" — black full-bleed frames, gold accent (rings/progress).
const STORIES_PALETTE: MenuPalette = {
  bg: "#000000",
  surface: "#141414",
  surfaceElevated: "#1C1C1C",
  text: "#FFFFFF",
  textMuted: "rgba(255,255,255,0.75)",
  textFaint: "rgba(255,255,255,0.5)",
  border: "rgba(255,255,255,0.16)",
  accent: "#F2C879",
  accentText: "#1A1206",
  accentSoft: "rgba(242,200,121,0.16)",
  price: "#F2C879",
  danger: "var(--color-danger)",
  overlay: "rgba(0,0,0,0.7)",
};

// #17 "RUTA" taco truck — warm black + orange, gold prices.
const CARD_STACK_PALETTE: MenuPalette = {
  bg: "#16130F",
  surface: "#241E16",
  surfaceElevated: "#2E2619",
  text: "#FFFFFF",
  textMuted: "rgba(255,255,255,0.72)",
  textFaint: "rgba(255,255,255,0.5)",
  border: "rgba(255,255,255,0.12)",
  accent: "#F97316",
  accentText: "#1A1206",
  accentSoft: "rgba(249,115,22,0.16)",
  price: "#F2C879",
  danger: "var(--color-danger)",
  overlay: "rgba(0,0,0,0.7)",
};

// #16 "SLRP" ramen — near-white minimal, near-black accent, subtle gold price.
const GESTURE_PALETTE: MenuPalette = {
  bg: "#FFFFFF",
  surface: "#F3F4F6",
  surfaceElevated: "#F3F4F6",
  text: "#1A1A2E",
  textMuted: "#4B5563",
  textFaint: "#9CA3AF",
  border: "#E5E7EB",
  accent: "#1A1A2E",
  accentText: "#FFFFFF",
  accentSoft: "rgba(26,26,46,0.08)",
  price: "#C99B3F",
  danger: "var(--color-danger)",
  overlay: "rgba(26,26,46,0.45)",
};

// #12 "THE ROWAN" room service — light retail: light-grey bg, white cards, blue accent.
const STORE_SECTIONS_PALETTE: MenuPalette = {
  bg: "#F5F5F7", surface: "#FFFFFF", surfaceElevated: "#FFFFFF",
  text: "#1D1D1F", textMuted: "#4B4B4F", textFaint: "#86868B",
  border: "#E5E7EB", accent: "#2563EB", accentText: "#FFFFFF",
  accentSoft: "rgba(37,99,235,0.10)", price: "#1D1D1F",
  danger: "var(--color-danger)", overlay: "rgba(0,0,0,0.4)",
};

// #06 "EMBER" fine dining — black editorial, amber-gold accent, hairlines.
const FULLSCREEN_TYPE_PALETTE: MenuPalette = {
  bg: "#0C0A09", surface: "#161311", surfaceElevated: "#1C1815",
  text: "#FFFFFF", textMuted: "rgba(255,255,255,0.7)", textFaint: "rgba(255,255,255,0.45)",
  border: "rgba(201,169,106,0.25)", accent: "#C9A96A", accentText: "#0C0A09",
  accentSoft: "rgba(201,169,106,0.14)", price: "#C9A96A",
  danger: "var(--color-danger)", overlay: "rgba(0,0,0,0.72)",
};

// #14 "Seven & Co" tasting — light elegant cream, gold nodes/accent.
const TIMELINE_PALETTE: MenuPalette = {
  bg: "#FCFBF9", surface: "#FFFFFF", surfaceElevated: "#F5F3EF",
  text: "#1A1A2E", textMuted: "#5A5A6E", textFaint: "#9CA3AF",
  border: "#E7E3DC", accent: "#C99B3F", accentText: "#FFFFFF",
  accentSoft: "rgba(201,155,63,0.12)", price: "#C99B3F",
  danger: "var(--color-danger)", overlay: "rgba(26,26,46,0.4)",
};

// #10 "search first" — light, indigo accent, gold price.
const MASONRY_SEARCH_PALETTE: MenuPalette = {
  bg: "#FAF9F7", surface: "#FFFFFF", surfaceElevated: "#F3F4F6",
  text: "#1A1A2E", textMuted: "#5A5A6E", textFaint: "#9CA3AF",
  border: "#E5E7EB", accent: "#534AB7", accentText: "#FFFFFF",
  accentSoft: "rgba(83,74,183,0.10)", price: "#C99B3F",
  danger: "var(--color-danger)", overlay: "rgba(26,26,46,0.4)",
};

// #18 "Brew.ai" — light with blue→indigo gradient header, indigo accent.
const AI_PERSONALIZED_PALETTE: MenuPalette = {
  bg: "#F7F6FC", surface: "#FFFFFF", surfaceElevated: "#F3F4F6",
  text: "#1A1A2E", textMuted: "#5A5A6E", textFaint: "#9CA3AF",
  border: "#E5E7EB", accent: "#534AB7", accentText: "#FFFFFF",
  accentSoft: "rgba(83,74,183,0.10)", price: "#C99B3F",
  danger: "var(--color-danger)", overlay: "rgba(26,26,46,0.4)",
  accentGradient: "linear-gradient(135deg, #378ADD, #534AB7)",
};

// #19 "ASH & OAK" — dark cinematic, gold accent, frosted panels.
const IMMERSIVE_PALETTE: MenuPalette = {
  bg: "#000000", surface: "#141414", surfaceElevated: "#1C1C1C",
  text: "#FFFFFF", textMuted: "rgba(255,255,255,0.75)", textFaint: "rgba(255,255,255,0.5)",
  border: "rgba(255,255,255,0.14)", accent: "#F2C879", accentText: "#1A1206",
  accentSoft: "rgba(242,200,121,0.16)", price: "#F2C879",
  danger: "var(--color-danger)", overlay: "rgba(0,0,0,0.72)",
};

// #05 "GRAIN bakehouse" — light bakery: cream, brown text, amber accent.
const CATEGORY_SIDEBAR_PALETTE: MenuPalette = {
  bg: "#FFFFFF", surface: "#FFFFFF", surfaceElevated: "#F7F3EC",
  text: "#3A2E1F", textMuted: "#6E5E49", textFaint: "#B8A88C",
  border: "#EFE9DD", accent: "#D9A441", accentText: "#3A2E1F",
  accentSoft: "rgba(217,164,65,0.15)", price: "#D9A441",
  danger: "var(--color-danger)", overlay: "rgba(58,46,31,0.4)",
};

export const MENU_PALETTES: Record<string, MenuPalette> = {
  classic: CLASSIC_PALETTE,
  "store-sections": STORE_SECTIONS_PALETTE,
  "fullscreen-type": FULLSCREEN_TYPE_PALETTE,
  timeline: TIMELINE_PALETTE,
  "masonry-search": MASONRY_SEARCH_PALETTE,
  "ai-personalized": AI_PERSONALIZED_PALETTE,
  immersive: IMMERSIVE_PALETTE,
  "category-sidebar": CATEGORY_SIDEBAR_PALETTE,
  carousel: CAROUSEL_PALETTE,
  stories: STORIES_PALETTE,
  "card-stack": CARD_STACK_PALETTE,
  gesture: GESTURE_PALETTE,
  "left-drawer": LEFT_DRAWER_PALETTE,
  "icon-rail": ICON_RAIL_PALETTE,
  magazine: MAGAZINE_PALETTE,
  luxury: LUXURY_PALETTE,
  "glass-chips": GLASS_CHIPS_PALETTE,
  "infinite-feed": INFINITE_FEED_PALETTE,
  "streaming-rows": STREAMING_ROWS_PALETTE,
  "sticky-tabs": STICKY_TABS_PALETTE,
};

/** Resolve a template's palette, falling back to the default dark tokens. */
export function resolvePalette(templateId: string): MenuPalette {
  return MENU_PALETTES[templateId] ?? DEFAULT_PALETTE;
}
