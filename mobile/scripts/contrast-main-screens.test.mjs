// Contrast of the main screens (WCAG AA), light and dark. Run from mobile/:  node --test scripts/contrast-main-screens.test.mjs
//   1. every `color` + `backgroundColor` token pair declared together in the same style reaches 4.5:1 (3:1 for text of 24 pt or more)
//   2. text must not use the raw status fills (palette.brand / palette.danger / palette.warning): they are ~2-4:1 on the light surfaces.
//      Text uses the scheme-aware tokens c.brandText / c.dangerText / c.warningText (they are 4.5:1+ in both schemes, see theme-contrast.test.mjs).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { MAIN_SCREEN_FILES } from './a11y-main-screens.mjs';
import { checkMainScreens, findPairs, ratio } from './contrast-main-screens.mjs';

const mobile = new URL('..', import.meta.url).pathname;

test('the finder reads a text/background pair declared together', () => {
  const pairs = findPairs(`const s = { color: c.textPrimary, backgroundColor: c.bgSurface, fontSize: 30 };`, 'x.tsx');
  assert.equal(pairs.length, 1);
  assert.deepEqual([pairs[0].text, pairs[0].bg, pairs[0].large], ['c.textPrimary', 'c.bgSurface', true]);
  assert.equal(findPairs(`const s = { color: c.textPrimary };`, 'x.tsx').length, 0);
});

test('ratio: black on white is 21:1', () => {
  assert.ok(Math.abs(ratio({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }) - 21) < 0.01);
});

test('every text/background pair declared together in the main screens reaches AA in light and dark', async () => {
  const { failures, unresolved, checked } = await checkMainScreens();
  assert.ok(checked > 0, 'it must have checked something');
  assert.deepEqual(unresolved, []);
  assert.deepEqual(failures, []);
});

test('text in the main screens never uses the raw status fills (brand / danger / warning)', () => {
  // Documented exceptions: the room's role badges sit on a theme bubble and are declared in a static StyleSheet (no hook there).
  const EXCEPTIONS = [{ file: 'components/chat/MessageBubble.tsx', near: 'roleBadgeText' }];
  const offenders = [];
  for (const rel of MAIN_SCREEN_FILES) {
    let text; try { text = readFileSync(`${mobile}${rel}`, 'utf8'); } catch { continue; }
    const lines = text.split('\n');
    lines.forEach((line, i) => {
      if (!/\bcolor:\s*palette\.(brand|danger|warning)\b/.test(line) || /backgroundColor|borderColor|tintColor/.test(line)) return;
      const context = lines.slice(Math.max(0, i - 2), i + 1).join(' ');
      if (EXCEPTIONS.some((e) => e.file === rel && context.includes(e.near))) return;
      offenders.push(`${rel}:${i + 1} ${line.trim()}`);
    });
  }
  assert.deepEqual(offenders, []);
});
