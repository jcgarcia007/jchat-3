// JChat 3.0 — ensureTextContrast (utils/ensureTextContrast.ts): a venue's theme accent is kept as is when it already
// reads as text, and nudged toward black / white (same hue) only as far as needed otherwise.
// Also: with the helper, the ACTIVE TAB TEXT of every one of the 15 chat themes reaches 4.5:1 on its top bar, while the
// decorative accent in the table is untouched. Run: node scripts/ensure-text-contrast.test.mjs
import assert from 'node:assert/strict';
import { contrastRatio, ensureTextContrast } from '../utils/ensureTextContrast.ts';
import { CHAT_THEMES } from '../theme/chatThemes.ts';

// Passing colours come back untouched (same string).
assert.equal(ensureTextContrast('#1d1d1f', '#ffffff'), '#1d1d1f');
assert.equal(ensureTextContrast('#ffffff', '#0f0f11', 4.5), '#ffffff');

// Failing on a light background → darker, same hue family, now >= 4.5.
const darker = ensureTextContrast('#5068e0', '#dddfe8', 4.5);
assert.notEqual(darker, '#5068e0');
assert.ok(contrastRatio(darker, '#dddfe8') >= 4.5, `darker ${darker} = ${contrastRatio(darker, '#dddfe8')}`);
const [r, g, b] = [1, 3, 5].map((i) => parseInt(darker.slice(i, i + 2), 16));
assert.ok(b > r && b > g, 'a blue accent stays blue');

// Failing on a dark background → lighter.
const lighter = ensureTextContrast('#336699', '#0f0f11', 4.5);
assert.ok(contrastRatio(lighter, '#0f0f11') >= 4.5);
assert.notEqual(lighter, '#336699');

// The minimum is honoured exactly (3:1 for large text needs no change when it is already 3.59:1).
assert.equal(ensureTextContrast('#5068e0', '#dddfe8', 3), '#5068e0');

// Translucent foregrounds are flattened over the background; garbage is returned unchanged.
assert.ok(contrastRatio('rgba(255,255,255,0.35)', '#18181b') < 4.5);
assert.equal(ensureTextContrast('not-a-colour', '#ffffff'), 'not-a-colour');
assert.ok(Number.isNaN(contrastRatio('oops', '#fff')));

// Every chat theme: the active-tab text reaches 4.5:1, and the table's accent / tabActive is not rewritten.
for (const theme of CHAT_THEMES) {
  const text = ensureTextContrast(theme.tabActive, theme.topBg, 4.5);
  assert.ok(contrastRatio(text, theme.topBg) >= 4.5, `theme ${theme.id} (${theme.name}): ${text} on ${theme.topBg} = ${contrastRatio(text, theme.topBg)}`);
  assert.ok(theme.tabActive, 'tabActive stays defined in the table');
}

console.log('ensureTextContrast OK');
