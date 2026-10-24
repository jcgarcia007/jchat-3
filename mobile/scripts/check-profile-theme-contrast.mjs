// Prints the contrast of every profile theme and exits non-zero when one fails. Run from mobile/:
//   node scripts/check-profile-theme-contrast.mjs
// A theme only gives an accent (avatar ring, active tab, primary button) and a header gradient, so the checks are:
//   - the primary button text on the accent: WCAG text, 4.5:1;
//   - the accent against BOTH page backgrounds (dark and light): non-text UI, 3:1.
// The theme file is TypeScript: it is transpiled into a temp dir with the repo's own `typescript`.
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const dir = mkdtempSync(join(tmpdir(), 'profile-theme-contrast-'));
const opts = { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } };
for (const name of ['tokens', 'profileThemes']) {
  const source = readFileSync(new URL(`../theme/${name}.ts`, import.meta.url), 'utf8');
  writeFileSync(join(dir, `${name}.mjs`), ts.transpileModule(source, opts).outputText.replace(/from '\.\/tokens'/g, "from './tokens.mjs'"));
}
const { PROFILE_THEMES, contrastRatio } = await import(pathToFileURL(join(dir, 'profileThemes.mjs')).href);
const { palette } = await import(pathToFileURL(join(dir, 'tokens.mjs')).href);

const TEXT_MIN = 4.5;
const UI_MIN = 3;
let failures = 0;
for (const theme of PROFILE_THEMES) {
  const checks = [
    ['button text on accent', contrastRatio(theme.btn1Color, theme.accent), TEXT_MIN],
    ['accent on dark page', contrastRatio(theme.accent, palette.bgBase), UI_MIN],
    ['accent on light page', contrastRatio(theme.accent, palette.bgBaseLight), UI_MIN],
  ];
  const ok = checks.every(([, ratio, min]) => ratio >= min);
  if (!ok) failures += checks.filter(([, ratio, min]) => ratio < min).length;
  console.log(`Theme ${theme.id} (${theme.name}): ${ok ? 'PASS' : 'FAIL'} — ${checks.map(([label, ratio, min]) => `${label} ${ratio.toFixed(2)}:1 (min ${min})`).join(', ')}`);
}
if (failures > 0) {
  console.error(`FAIL — ${failures} contrast pair(s) below the minimum.`);
  process.exitCode = 1;
} else {
  console.log(`PASS — all ${PROFILE_THEMES.length * 3} profile-theme contrast pairs meet their minimum.`);
}
