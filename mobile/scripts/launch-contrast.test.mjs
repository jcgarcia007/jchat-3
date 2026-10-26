// Launch polish: the "Pagado" status of a gift card and the selected "Español" language chip reach WCAG AA (4.5:1), using only
// existing theme tokens. Run from mobile/:  node --test scripts/launch-contrast.test.mjs
// (tokens + profileThemes are transpiled into a temp dir with the repo's own typescript, like check-profile-theme-contrast.mjs.)

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const dir = mkdtempSync(join(tmpdir(), 'launch-contrast-'));
const opts = { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } };
for (const name of ['tokens', 'profileThemes']) {
  writeFileSync(join(dir, `${name}.mjs`), ts.transpileModule(read(`theme/${name}.ts`), opts).outputText.replace(/from '\.\/tokens'/g, "from './tokens.mjs'"));
}
const { palette } = await import(pathToFileURL(join(dir, 'tokens.mjs')).href);
const { PROFILE_THEMES, contrastRatio } = await import(pathToFileURL(join(dir, 'profileThemes.mjs')).href);
const MIN = 4.5;

test('"Pagado" (gift card status held / accepted / paid): brandText on the card surface (bgElevated) ≥ 4.5:1, light and dark', () => {
  assert.ok(contrastRatio(palette.brandTextDark, palette.bgElevated) >= MIN, 'dark');
  assert.ok(contrastRatio(palette.brandTextLight, palette.bgElevatedLight) >= MIN, 'light');
  // the colour it replaced failed in light (3.29:1): the test keeps the reason visible
  assert.ok(contrastRatio(palette.brand, palette.bgElevatedLight) < MIN);
  const card = read('components/gift/GiftCard.tsx');
  assert.match(card, /status === 'held' \|\| status === 'accepted' \|\| status === 'paid' \? c\.brandText : c\.textSecondary/);
  assert.doesNotMatch(card, /\? c\.brand : c\.textSecondary/);
  // the other status colour (textSecondary) is on the same surface: also AA
  assert.ok(contrastRatio(palette.textSecondary, palette.bgElevated) >= MIN);
  assert.ok(contrastRatio(palette.textSecondaryLight, palette.bgElevatedLight) >= MIN);
});

test('"Español" (selected language chip in Edit profile): the label is palette.onBrand on brandFill ≥ 4.5:1, the same in all 6 profile themes and both schemes', () => {
  assert.equal(PROFILE_THEMES.length, 6);
  assert.ok(contrastRatio(palette.onBrand, palette.brandFill) >= MIN);
  // what it replaced depended on the profile theme and failed in four of the six
  const failing = PROFILE_THEMES.filter((t) => contrastRatio(t.btn1Color, palette.brandFill) < MIN);
  assert.equal(failing.length, 4);
  const edit = read('screens/profile/EditProfileScreen.tsx');
  assert.match(edit, /backgroundColor: isSelected\s*\?\s*c\.brandFill\s*:\s*c\.bgSurface/);
  assert.match(edit, /color: isSelected\s*\?\s*palette\.onBrand\s*:\s*c\.textPrimary/);
  assert.doesNotMatch(edit, /isSelected\s*\?\s*selectedTheme\.btn1Color/);
  // the unselected chip label: textPrimary on bgSurface, both schemes
  assert.ok(contrastRatio(palette.textPrimary, palette.bgSurface) >= MIN);
  assert.ok(contrastRatio(palette.textPrimaryLight, palette.bgSurfaceLight) >= MIN);
});
