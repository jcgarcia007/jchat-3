// Contrast over the glass, on the WORST background: the bar's fill is composited over a black photo (worst for the light bar) and a white one (worst for the
// dark bar). Labels (text) must reach 4.5:1, icons 3:1; "Publish" (white text on brand at 96 %) 4.5:1 on a light page.
// Run from mobile/:  node --test scripts/glass-contrast.test.mjs
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const dir = mkdtempSync(join(tmpdir(), 'glass-contrast-'));
writeFileSync(join(dir, 'tokens.mjs'), ts.transpileModule(read('theme/tokens.ts'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText);
const { palette, glass } = await import(pathToFileURL(join(dir, 'tokens.mjs')).href);

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const lin = (v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const over = (fg, alpha, bg) => fg.map((v, i) => v * alpha + bg[i] * (1 - alpha));
const ratio = (a, b) => { const x = lum(a); const y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const BLACK = [0, 0, 0];
const WHITE = [255, 255, 255];

const SCHEMES = {
  light: { fill: rgb(palette.bgSurfaceLight), worst: BLACK, text: rgb(palette.textPrimaryLight), inactiveIcon: rgb(palette.textSecondaryLight), activeIcon: rgb(palette.brandTextLight) },
  dark: { fill: rgb(palette.bgSurface), worst: WHITE, text: rgb(palette.textPrimary), inactiveIcon: rgb(palette.textSecondary), activeIcon: rgb(palette.brandTextDark) },
};

for (const [name, s] of Object.entries(SCHEMES)) {
  test(`${name}: labels in textPrimary reach 4.5:1 and icons 3:1 over the glass on the worst background`, () => {
    const glassOnWorst = over(s.fill, glass.barAlpha, s.worst);
    assert.ok(ratio(s.text, glassOnWorst) >= 4.5, `label ${ratio(s.text, glassOnWorst).toFixed(2)}`);
    assert.ok(ratio(s.inactiveIcon, glassOnWorst) >= 3, `inactive icon ${ratio(s.inactiveIcon, glassOnWorst).toFixed(2)}`);
    assert.ok(ratio(s.activeIcon, glassOnWorst) >= 3, `active icon ${ratio(s.activeIcon, glassOnWorst).toFixed(2)}`);
  });
}

test('why 82 %: at 72 % the labels in textSecondary and the brand label would NOT reach 4.5:1 on the worst background', () => {
  const lightAt72 = over(SCHEMES.light.fill, 0.72, BLACK);
  assert.ok(ratio(SCHEMES.light.inactiveIcon, lightAt72) < 4.5);
  assert.ok(ratio(SCHEMES.light.activeIcon, lightAt72) < 3);
});

test('"Publish": white text on brand at 96 % over the light page reaches 4.5:1 (at 86 % it did not)', () => {
  const onLightPage = over(rgb(palette.brandFill), 0.96, rgb(palette.bgBaseLight));
  assert.ok(ratio(WHITE, onLightPage) >= 4.5, `${ratio(WHITE, onLightPage).toFixed(2)}`);
  const at86 = over(rgb(palette.brandFill), 0.86, rgb(palette.bgBaseLight));
  assert.ok(ratio(WHITE, at86) < 4.5);
});
