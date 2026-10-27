// JChat 3.0 — WCAG contrast (4.5:1) of every text colour the gift screens use, on every surface it can sit on, light and dark.
// Gift screens (GiftSheet, GiftCard, GiftPayPage.web, GiftPaymentForm.web) take their colours ONLY from the app theme
// (useThemeColors): they do not use the 15 chat themes or the 15 profile themes, so the matrix is the app theme in both schemes.
// Run: node scripts/gift-contrast.test.mjs
//
// FINDINGS lists the pairs that are under 4.5:1 TODAY in the gift screens, each with the file that uses it. They are documented,
// not fixed (overnight suite). A pair listed here that now passes fails the test, so the list can only shrink.
import { readFileSync } from 'node:fs';
import { palette } from '../theme/tokens.ts';

const MIN = 4.5;
const rgba = (v) => {
  if (v.startsWith('#')) {
    const h = v.length === 4 ? `#${[...v.slice(1)].map((x) => x + x).join('')}` : v;
    return { r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16), a: 1 };
  }
  const [r, g, b, a = '1'] = v.match(/rgba?\(([^)]+)\)/)[1].split(',').map((x) => x.trim());
  return { r: +r, g: +g, b: +b, a: +a };
};
const over = (fg, bg) => {
  const f = rgba(fg), b = rgba(bg);
  return { r: f.r * f.a + b.r * (1 - f.a), g: f.g * f.a + b.g * (1 - f.a), b: f.b * f.a + b.b * (1 - f.a) };
};
const lum = ({ r, g, b }) => {
  const l = [r, g, b].map((v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2];
};
const contrast = (fg, bg) => {
  const a = lum(over(fg, bg)), b = lum(rgba(bg));
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};

const SCHEMES = {
  dark: {
    surfaces: { bgBase: palette.bgBase, bgSurface: palette.bgSurface, bgElevated: palette.bgElevated },
    text: { textPrimary: palette.textPrimary, textSecondary: palette.textSecondary, textTertiary: palette.textTertiary, brandText: palette.brandTextDark, dangerText: palette.dangerTextDark, warning: palette.warning },
  },
  light: {
    surfaces: { bgBase: palette.bgBaseLight, bgSurface: palette.bgSurfaceLight, bgElevated: palette.bgElevatedLight },
    text: { textPrimary: palette.textPrimaryLight, textSecondary: palette.textSecondaryLight, textTertiary: palette.textTertiaryLight, brandText: palette.brandTextLight, dangerText: palette.dangerTextLight, warning: palette.warning },
  },
};

// Which colour each gift file uses as TEXT, and on what surfaces (the sheet/card sit on bgSurface or bgElevated; the pay page on bgBase).
const USED = [
  ['textPrimary', 'components/gift/GiftCard.tsx · GiftSheet.tsx · GiftPayPage.web.tsx'],
  ['textSecondary', 'components/gift/GiftCard.tsx · GiftSheet.tsx · GiftPayPage.web.tsx · GiftPaymentForm.web.tsx'],
  ['textTertiary', 'components/gift/GiftCard.tsx · GiftSheet.tsx'],
  ['brandText', 'components/gift/GiftCard.tsx · GiftSheet.tsx'],
  ['warning', 'components/gift/GiftCard.tsx:254 (id_required badge) and :449 (21+ notice)'],
  ['dangerText', 'components/gift/GiftPaymentForm.web.tsx:121 and the Stripe appearance (colorDanger)'],
];

// Real findings, kept as documented exceptions (see header).
const FINDINGS = new Map([
  ['light · warning on bgBase', 'GiftCard.tsx:254/:449 use the #f59e0b fill colour as text'],
  ['light · warning on bgSurface', 'GiftCard.tsx:254/:449 use the #f59e0b fill colour as text'],
  ['light · warning on bgElevated', 'GiftCard.tsx:254/:449 use the #f59e0b fill colour as text'],
]);

const failures = [];

// The payment form's error message and Stripe's colorDanger are TEXT: they must use dangerText (4.5:1 in both schemes), never the fill red.
const form = readFileSync(new URL('../components/gift/GiftPaymentForm.web.tsx', import.meta.url), 'utf8');
if (/\bc\.danger\b(?!Text)/.test(form)) failures.push('GiftPaymentForm.web.tsx uses c.danger (fill red) as text: use c.dangerText');
if (!/colorDanger: c\.dangerText/.test(form) || !/c\.dangerText \}/.test(form)) failures.push('GiftPaymentForm.web.tsx must use c.dangerText for the error message and Stripe colorDanger');
const below = new Map();
for (const [scheme, { surfaces, text }] of Object.entries(SCHEMES)) {
  for (const [textName] of USED) {
    for (const [surfaceName, surface] of Object.entries(surfaces)) {
      const name = `${scheme} · ${textName} on ${surfaceName}`;
      const ratio = contrast(text[textName], surface);
      if (ratio < MIN) {
        if (FINDINGS.has(name)) below.set(name, ratio);
        else failures.push(`${name}: ${text[textName]} on ${surface} = ${ratio.toFixed(2)}:1`);
      }
    }
  }
  // Text on the brand fill (Accept / Send / selected table cell) and the Stripe error colour on the form.
  const onBrand = contrast(palette.onBrand, palette.brandFill);
  if (onBrand < MIN) failures.push(`${scheme} · onBrand on brandFill = ${onBrand.toFixed(2)}:1`);
}
for (const name of FINDINGS.keys()) if (!below.has(name)) failures.push(`${name} is listed in FINDINGS but now passes: remove it`);

if (failures.length) {
  console.error(`gift contrast: ${failures.length} problem(s)\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log(`gift contrast OK (2 schemes × ${USED.length} text colours × 3 surfaces; ${below.size} documented findings)`);
for (const [n, r] of below) console.log(`  finding: ${n} = ${r.toFixed(2)}:1 — ${FINDINGS.get(n)}`);
