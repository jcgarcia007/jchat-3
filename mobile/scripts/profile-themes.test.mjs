// Unit tests for theme/profileThemes.ts (6 themes, legacy ids, contrast of the primary button). Run from mobile/:
//   node --test scripts/profile-themes.test.mjs
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const dir = mkdtempSync(join(tmpdir(), 'profile-themes-'));
const opts = { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } };
for (const name of ['tokens', 'profileThemes']) {
  const source = readFileSync(new URL(`../theme/${name}.ts`, import.meta.url), 'utf8');
  const out = ts.transpileModule(source, opts).outputText.replace(/from '\.\/tokens'/g, "from './tokens.mjs'");
  writeFileSync(join(dir, `${name}.mjs`), out);
}
const { PROFILE_THEMES, LEGACY_THEME_MAP, getProfileTheme, resolveProfileThemeId, contrastRatio } = await import(
  pathToFileURL(join(dir, 'profileThemes.mjs')).href
);

const KEPT = [1, 2, 4, 6, 10, 12];
const REMOVED = [3, 5, 7, 8, 9, 11, 13, 14, 15];

test('there are exactly six themes: 1, 2, 4, 6, 10, 12', () => {
  assert.deepEqual(PROFILE_THEMES.map((t) => t.id), KEPT);
  assert.deepEqual(PROFILE_THEMES.map((t) => t.name), ['Dark Blue', 'Light Purple', 'Pure White', 'Sunset Orange', 'Soft Sage', 'Ocean Deep']);
});

test('a theme defines an accent and a two-colour header gradient', () => {
  for (const theme of PROFILE_THEMES) {
    assert.match(theme.accent, /^#[0-9a-f]{6}$/i, theme.name);
    assert.equal(theme.headerGradient.length, 2, theme.name);
    for (const stop of theme.headerGradient) assert.match(stop, /^#[0-9a-f]{6}$/i, theme.name);
  }
});

test('valid ids return their own theme', () => {
  for (const id of KEPT) assert.equal(getProfileTheme(id).id, id);
});

test('every removed id maps to a surviving theme, with the agreed mapping', () => {
  assert.deepEqual(LEGACY_THEME_MAP, { 3: 12, 5: 2, 7: 6, 8: 1, 9: 1, 11: 2, 13: 4, 14: 12, 15: 12 });
  for (const id of REMOVED) {
    assert.ok(id in LEGACY_THEME_MAP, `id ${id} has a mapping`);
    assert.ok(KEPT.includes(LEGACY_THEME_MAP[id]), `id ${id} maps to a kept theme`);
    assert.equal(getProfileTheme(id).id, LEGACY_THEME_MAP[id]);
  }
  assert.equal(getProfileTheme(3).name, 'Ocean Deep');
  assert.equal(getProfileTheme(13).name, 'Pure White');
});

test('unknown, missing or invalid ids fall back to theme 1', () => {
  for (const id of [0, 16, 99, -1, 1.5, Number.NaN, null, undefined]) {
    assert.equal(getProfileTheme(id).id, 1, String(id));
  }
});

test('resolveProfileThemeId is the id that is shown (what the selector highlights)', () => {
  assert.equal(resolveProfileThemeId(8), 1);
  assert.equal(resolveProfileThemeId(15), 12);
  assert.equal(resolveProfileThemeId(6), 6);
  assert.equal(resolveProfileThemeId(undefined), 1);
});

test('the primary button text reads on the accent (4.5:1) for every theme', () => {
  for (const theme of PROFILE_THEMES) {
    assert.ok(contrastRatio(theme.btn1Color, theme.btn1Bg) >= 4.5, `${theme.name}: ${contrastRatio(theme.btn1Color, theme.btn1Bg).toFixed(2)}`);
  }
});

test('the ring accent stands out from both page backgrounds (3:1, non-text) in every theme', () => {
  for (const theme of PROFILE_THEMES) {
    assert.ok(contrastRatio(theme.accent, '#0f0f11') >= 3, `${theme.name} on dark`);
    assert.ok(contrastRatio(theme.accent, '#f9f9fb') >= 3, `${theme.name} on light`);
  }
});
