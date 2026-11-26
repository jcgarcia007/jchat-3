// WCAG 1.4.3: the text tokens of styles/tokens.css and styles/landing.css reach 4.5:1 on the surfaces they are used on.
// Run from web/: node --test scripts/tokens-contrast.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync(new URL('../styles/tokens.css', import.meta.url), 'utf8') +
  readFileSync(new URL('../styles/landing.css', import.meta.url), 'utf8');

/** Value of the FIRST definition of `--name` (dark / base block) or of the one inside `[data-theme="light"]`. */
function token(name, light = false) {
  if (light) {
    const block = css.match(/\[data-theme="light"\] \{([\s\S]*?)\n\}/)[1];
    const m = block.match(new RegExp(`--${name}:\\s*([^;]+);`));
    return m ? m[1].trim() : null;
  }
  const m = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6});`));
  return m ? m[1] : null;
}
const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const must = (fg, bg, label) => assert.ok(ratio(fg, bg) >= 4.5, `${label}: ${fg} on ${bg} = ${ratio(fg, bg).toFixed(2)}`);

test('dark theme text tokens on every dark surface', () => {
  for (const bg of ['bg-base', 'bg-surface', 'bg-elevated', 'bg-overlay']) {
    for (const fg of ['text-secondary', 'text-tertiary', 'color-brand-text', 'color-danger-text', 'color-success-text']) {
      must(token(fg), token(bg), `${fg} / ${bg}`);
    }
  }
});

test('light theme text tokens on the light surfaces', () => {
  const surfaces = ['bg-base-light', 'bg-surface-light', 'bg-elevated-light'].map((n) => token(n));
  for (const fg of ['text-secondary', 'text-tertiary', 'color-brand-text', 'color-danger-text', 'color-success-text']) {
    const hex = token(fg, true).startsWith('var(') ? token(token(fg, true).slice(6, -1)) : token(fg, true);
    for (const bg of surfaces) must(hex, bg, `light ${fg}`);
  }
});

test('brand as text on always-light pages, white on brand fill, land-muted', () => {
  for (const bg of ['#ffffff', '#fafafa', '#f3f4f6']) must(token('color-brand-text-light'), bg, 'brand-text-light');
  must('#ffffff', token('color-brand-fill'), 'white on brand-fill');
  for (const bg of ['#fafafa', '#f3f4f6']) must(token('land-muted'), bg, 'land-muted');
});
