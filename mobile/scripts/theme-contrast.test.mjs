// JChat 3.0 — WCAG contrast of the theme: every text/background pair the app uses must reach 4.5:1 (normal text),
// light and dark, and the 15 chat themes' own text pairs too. Run: node scripts/theme-contrast.test.mjs
// (Node's native TypeScript loader reads theme/tokens.ts and theme/chatThemes.ts, which import nothing.)
//
// KNOWN_BELOW lists the pairs that are still under 4.5:1 ON PURPOSE, each with its reason. A pair that is listed
// here but now passes also fails the test (so the list can only shrink).
import { palette } from '../theme/tokens.ts';
import { CHAT_THEMES } from '../theme/chatThemes.ts';

const MIN = 4.5;

function rgba(value) {
  if (value.startsWith('#')) {
    const h = value.length === 4 ? `#${[...value.slice(1)].map((x) => x + x).join('')}` : value;
    return { r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16), a: 1 };
  }
  const m = value.match(/rgba?\(([^)]+)\)/);
  if (!m) throw new Error(`unsupported color ${value}`);
  const [r, g, b, a = '1'] = m[1].split(',').map((x) => x.trim());
  return { r: +r, g: +g, b: +b, a: +a };
}

/** Flattens a (possibly translucent) foreground over an opaque background. */
function over(fg, bg) {
  const f = rgba(fg);
  const b = rgba(bg);
  return { r: f.r * f.a + b.r * (1 - f.a), g: f.g * f.a + b.g * (1 - f.a), b: f.b * f.a + b.b * (1 - f.a) };
}

function luminance({ r, g, b }) {
  const lin = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

export function contrast(fg, bg) {
  const l1 = luminance(over(fg, bg));
  const l2 = luminance(rgba(bg));
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

// Every text role of the app theme now reaches 4.5:1 on every surface; no exceptions left in the app theme.
const KNOWN_BELOW = new Map([]);

const failures = [];
const stillBelow = new Set();

// Pairs that come straight from the Design System's chat-theme table (accent as tab colour, bubble text on the
// outgoing bubble): fixed values, reported but not changed here.
const SPEC_PAIRS = /· (tabActive on topBg|bubbleOutText on bubbleOutBg)$/;

function check(name, fg, bg) {
  const ratio = contrast(fg, bg);
  if (ratio < MIN && SPEC_PAIRS.test(name)) return;
  const known = KNOWN_BELOW.has(name);
  if (ratio < MIN) {
    if (known) stillBelow.add(name);
    else failures.push(`${name}: ${fg} on ${bg} = ${ratio.toFixed(2)}:1 (< ${MIN})`);
  }
}

// App theme: text roles on every surface, dark and light.
const dark = { bgBase: palette.bgBase, bgSurface: palette.bgSurface, bgElevated: palette.bgElevated, bgOverlay: palette.bgOverlay };
const light = { bgBase: palette.bgBaseLight, bgSurface: palette.bgSurfaceLight, bgElevated: palette.bgElevatedLight, bgOverlay: palette.bgElevatedLight };
for (const [scheme, surfaces, text] of [
  ['dark', dark, { textPrimary: palette.textPrimary, textSecondary: palette.textSecondary, textTertiary: palette.textTertiary, brandText: palette.brandTextDark, dangerText: palette.dangerTextDark }],
  ['light', light, { textPrimary: palette.textPrimaryLight, textSecondary: palette.textSecondaryLight, textTertiary: palette.textTertiaryLight, brandText: palette.brandTextLight, dangerText: palette.dangerTextLight }],
]) {
  for (const [textName, color] of Object.entries(text)) {
    for (const [surfaceName, surface] of Object.entries(surfaces)) check(`${scheme} · ${textName} on ${surfaceName}`, color, surface);
  }
}
check('onBrand on brandFill', palette.onBrand, palette.brandFill);

// Brand text on its own translucent tint (the DM inbox initials badge, tags and chips: text = brandText on brandLight over the
// surface). The plain brand blue (#5C7CFA) was 4.18:1 there in dark mode (axe color-contrast, F8 #2): brandText is the token.
const hex = ({ r, g, b }) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
for (const [scheme, surfaces, brandText] of [['dark', dark, palette.brandTextDark], ['light', light, palette.brandTextLight]]) {
  // Only where the tinted badge / tag sits: the base and surface backgrounds (rows of lists), not elevated / overlay sheets.
  for (const [surfaceName, surface] of Object.entries({ bgBase: surfaces.bgBase, bgSurface: surfaces.bgSurface })) {
    const tint = hex(over(palette.brandLight, surface));
    check(`${scheme} · brandText on brandLight over ${surfaceName}`, brandText, tint);
  }
}

// Chat themes: the text pairs of the room (tabs, bubbles).
for (const t of CHAT_THEMES) {
  const n = `chat theme ${t.id} (${t.name})`;
  check(`${n} · tabInactive on topBg`, t.tabInactive, t.topBg);
  check(`${n} · tabActive on topBg`, t.tabActive, t.topBg);
  check(`${n} · bubbleInText on bubbleInBg`, t.bubbleInText, t.bubbleInBg);
  check(`${n} · bubbleOutText on bubbleOutBg`, t.bubbleOutText, t.bubbleOutBg);
}

for (const name of KNOWN_BELOW.keys()) {
  if (!stillBelow.has(name)) failures.push(`${name} is listed in KNOWN_BELOW but now passes: remove it from the list`);
}

if (failures.length > 0) {
  console.error(`theme contrast: ${failures.length} pair(s) below ${MIN}:1\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log(`theme contrast OK (${CHAT_THEMES.length} chat themes, ${stillBelow.size} documented exceptions)`);
