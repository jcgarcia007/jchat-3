// Static checks of the Lote 2 / rama B fixes: H-081 (tab bar a11y), H-044 (tax label without a rate), H-084 (map status band), H-087 (login shell).
// Run from mobile/:  node --test scripts/l2b-static.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const locale = (lang, ns) => JSON.parse(read(`i18n/locales/${lang}/${ns}.json`));

test('H-081: the five tabs are accessible tabs with a translated name and a selected state; the map search field has a label', () => {
  const bar = read('components/navigation/NotchTabBar.tsx');
  assert.equal((bar.match(/accessibilityRole="tab"\n/g) ?? []).length, 2, 'four tabs (one Pressable in renderRoute) + the centre Offers button');
  assert.equal((bar.match(/accessibilityState=\{\{ selected: (focused|offersFocused) \}\}/g) ?? []).length, 2);
  assert.match(bar, /accessibilityLabel=\{label\}/);
  assert.match(bar, /accessibilityRole="tablist"/);
  for (const lang of ['es', 'en']) {
    assert.ok(locale(lang, 'map').filterPanel.searchA11y);
    for (const k of ['map', 'nearby', 'messages', 'offers', 'profile']) assert.ok(locale(lang, 'common').tabs[k], `${lang} tabs.${k}`);
  }
  assert.match(read('components/map/FilterPanel.tsx'), /accessibilityLabel=\{t\('filterPanel\.searchA11y'\)\}/);
});

test('H-044: with no tax rate the label is a plain "Tax" / "Impuesto" (no percentage)', () => {
  const src = read('screens/checkout/CheckoutScreen.tsx');
  assert.match(src, /tax_source === 'none' \|\| !\(quote\.tax_rate > 0\)\s*\? t\('checkout\.taxLabelNone'\)/);
  assert.doesNotMatch(src, /t\('cart\.taxLabel'\)/);
  assert.equal(locale('en', 'pos').checkout.taxLabelNone, 'Tax');
  assert.equal(locale('es', 'pos').checkout.taxLabelNone, 'Impuesto');
  assert.doesNotMatch(JSON.stringify(locale('en', 'pos').checkout.taxLabelNone), /%/);
});

test('H-084: the map has a status-bar band (Android) and the search sits below it', () => {
  const src = read('screens/map/MapScreen.tsx');
  assert.match(src, /styles\.statusBand/);
  assert.match(src, /StatusBar\.currentHeight/);
  assert.match(src, /paddingTop: statusBarTop \+ 12/);
  assert.match(src, /<StatusBar barStyle=\{mapScheme === 'light' \? 'dark-content' : 'light-content'\}/);
});

test('H-087: while the keyboard is up the ticket starts under the top bar; the scrollbar is visible', () => {
  const src = read('components/auth/TicketShell.tsx');
  assert.match(src, /useKeyboardOpen\(\)/);
  assert.match(src, /paddingTop: keyboardOpen \? insets\.top \+ TOP_BAR_ROOM/);
  assert.match(src, /scrollToEnd/);
  assert.match(src, /persistentScrollbar/);
});
