// Static checks of Lote 2, vuelta 3 (fix/l2-restos): Cerca chips (H-026), login top bar, tab-bar labels (H-027), map pin text size.
// Run from mobile/:  node --test scripts/l2d-static.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('H-026: the Cerca filter chips show the translated category, filtering still uses the raw value', () => {
  const src = read('components/nearby/NearbyFilters.tsx');
  assert.match(src, /label=\{categoryLabel\(category, \(key\) => mapT\(key\)\)\}/);
  assert.match(src, /selectedCategory === category/);
  assert.match(src, /onSelectCategory\(selectedCategory === category \? null : category\)/);
  assert.match(src, /useTranslation\('map'\)/);
});

test('login: the scroll area starts under the top bar, so content never slides beneath the ES · EN pill (any size, with or without keyboard)', () => {
  const shell = read('components/auth/TicketShell.tsx');
  assert.match(shell, /marginTop: ticketScrollTop\(insets\.top\)/);
  assert.match(shell, /ticketTopPadding\(\{ safeTop: insets\.top, photoHeight, overlap, keyboardOpen \}\)/);
  assert.doesNotMatch(shell, /TOP_BAR_ROOM/);
  assert.match(read('components/auth/LanguagePill.tsx'), /maxFontSizeMultiplier=\{LABEL_TEXT_CAP\}/);

  // the geometry (re-stated from ticketLayout.ts): the ticket keeps its old screen position, the scroll area clears the top bar
  const layout = read('components/auth/ticketLayout.ts');
  const TOP_BAR_CLEARANCE = Number(layout.match(/TOP_BAR_CLEARANCE = (\d+)/)[1]);
  const TICKET_TILT_ROOM = Number(layout.match(/TICKET_TILT_ROOM = (\d+)/)[1]);
  const scrollTop = (safeTop) => safeTop + TOP_BAR_CLEARANCE;
  const pad = ({ safeTop, photoHeight, overlap, keyboardOpen }) => (keyboardOpen ? TICKET_TILT_ROOM : Math.max(photoHeight - overlap - scrollTop(safeTop), TICKET_TILT_ROOM));
  // Back button = 8 pt gap + 44 pt; the pill (3 + 32 + 3 + 2 border) is shorter: both end above the scroll area
  assert.ok(TOP_BAR_CLEARANCE >= 8 + 44);
  for (const safeTop of [0, 24, 47, 59]) {
    for (const h of [640, 740, 874]) {
      for (const keyboardOpen of [false, true]) {
        const absolute = scrollTop(safeTop) + pad({ safeTop, photoHeight: Math.round(h * 0.47), overlap: 64, keyboardOpen });
        const before = keyboardOpen ? safeTop + 68 : Math.max(Math.round(h * 0.47) - 64, safeTop + 68);
        assert.equal(absolute, before, `ticket position safeTop=${safeTop} h=${h} keyboard=${keyboardOpen}`);
      }
    }
  }
});

test('map pin: its text is part of a fixed-size drawing and stays at its size, cap 1 (AX5 pushed it off the left edge)', () => {
  const pin = read('components/map/BusinessPin.tsx');
  assert.match(pin, /<Text maxFontSizeMultiplier=\{1\} style=\{\[styles\.pillText/);
  assert.doesNotMatch(pin, /allowFontScaling/);
  assert.match(pin, /numberOfLines=\{1\}/);
});
