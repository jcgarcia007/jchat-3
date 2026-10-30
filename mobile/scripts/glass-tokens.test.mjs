// Glass tokens: they exist in light and dark, brand-derived ones are CALCULATED from the brand token (withAlpha), never a hand-written rgba,
// and no hex colour is written in the glass components. Run from mobile/:  node --test scripts/glass-tokens.test.mjs
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const opts = { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } };
const dir = mkdtempSync(join(tmpdir(), 'glass-tokens-'));
writeFileSync(join(dir, 'tokens.mjs'), ts.transpileModule(read('theme/tokens.ts'), opts).outputText);
writeFileSync(join(dir, 'colors.mjs'), ts.transpileModule(read('theme/colors.ts'), opts).outputText
  .replace(/import \{ useColorScheme \} from 'react-native';/, 'const useColorScheme = () => "dark";').replace(/from '\.\/tokens'/g, "from './tokens.mjs'"));
const { palette, glass, withAlpha } = await import(pathToFileURL(join(dir, 'tokens.mjs')).href);
const { darkColors, lightColors, glassMetrics } = await import(pathToFileURL(join(dir, 'colors.mjs')).href);

const KEYS = ['tabBarGlass', 'tabBarGlassAndroid', 'glassEdgeLine', 'glassEdgeHighlight', 'glassButtonFill', 'glassButtonBorder', 'glassSheetButtonFill',
  'offersBorder', 'brandFillGlass', 'brandFillSoft', 'glassReflect', 'tabPillActive'];

test('every glass token exists in light and dark and is a colour', () => {
  for (const [name, scheme] of [['dark', darkColors], ['light', lightColors]]) {
    for (const key of KEYS) assert.match(scheme[key] ?? '', /^rgba\(\d+,\d+,\d+,[\d.]+\)$/, `${name}.${key}`);
  }
});

test('withAlpha turns #rrggbb and #rgb into rgba and refuses anything else', () => {
  assert.equal(withAlpha('#4263EB', 0.5), 'rgba(66,99,235,0.5)');
  assert.equal(withAlpha('#fff', 0.3), 'rgba(255,255,255,0.3)');
  assert.throws(() => withAlpha('rgba(1,2,3,0.5)', 0.5));
});

test('brand-derived tokens are calculated from the brand tokens', () => {
  assert.equal(glass.tabPillActive, withAlpha(palette.brand, 0.14));
  assert.equal(glass.brandFillGlass, withAlpha(palette.brandFill, 0.92));
  assert.equal(glass.brandFillSoft, withAlpha(palette.brandFill, 0.96));
  assert.equal(darkColors.tabPillActive, lightColors.tabPillActive, 'same in both schemes');
  const src = read('theme/tokens.ts');
  // the derived tokens are written with withAlpha(palette.…), never as a literal rgba
  const block = src.slice(src.indexOf('export const glass = {'));
  assert.doesNotMatch(block.split('} as const;')[0], /'rgba\(/);
});

test('the bar is 82 % glass (94 % on Android) and follows bgSurface', () => {
  assert.equal(glass.barAlpha, 0.82);
  assert.equal(darkColors.tabBarGlass, withAlpha(palette.bgSurface, 0.82));
  assert.equal(lightColors.tabBarGlass, withAlpha(palette.bgSurfaceLight, 0.82));
  assert.equal(lightColors.tabBarGlassAndroid, withAlpha(palette.bgSurfaceLight, 0.94));
});

test('glass metrics: a wide neutral bar shadow, a brand-coloured one for the button', () => {
  const dark = glassMetrics('dark');
  const light = glassMetrics('light');
  assert.ok(dark.barShadowOpacity > light.barShadowOpacity);
  assert.equal(light.barShadowRadius, 22);
  assert.equal(light.offersShadowColor, palette.brandFill);
});

test('no hex colour is written in the glass components (only tokens)', () => {
  const files = ['components/navigation/NotchTabBar.tsx', 'components/navigation/notchGeometry.ts', 'components/profile/GlassIconButton.tsx', 'components/profile/GlassSurface.tsx'];
  for (const rel of files) {
    if (!existsSync(new URL(`../${rel}`, import.meta.url))) continue;
    const code = read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(code, /#[0-9a-fA-F]{3,8}\b/, `${rel} has a hex colour`);
    assert.doesNotMatch(code, /rgba?\(/, `${rel} has an rgba()`);
  }
});
