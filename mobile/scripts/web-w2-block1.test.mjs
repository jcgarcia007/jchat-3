// W2 block 1: Messages / Notifications / Offers reachable on the web, D-13 gating of "Entrar", native unchanged.
// Run from mobile/:  node --test scripts/web-w2-block1.test.mjs

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const dir = mkdtempSync(join(tmpdir(), 'w2-b1-'));
const file = join(dir, 'offerEntry.mjs');
writeFileSync(file, ts.transpileModule(read('utils/offerEntry.ts'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText);
const { canEnterOffer } = await import(pathToFileURL(file).href);

test('devices: "Entrar" is always enabled (no session needed)', () => {
  for (const platform of ['ios', 'android']) {
    assert.equal(canEnterOffer({ platform, activeBusinessId: null, offerBusinessId: 'b1' }), true);
    assert.equal(canEnterOffer({ platform, activeBusinessId: 'other', offerBusinessId: 'b1' }), true);
  }
});

test('web: enabled only with an active session at THAT business', () => {
  assert.equal(canEnterOffer({ platform: 'web', activeBusinessId: 'b1', offerBusinessId: 'b1' }), true);
  assert.equal(canEnterOffer({ platform: 'web', activeBusinessId: null, offerBusinessId: 'b1' }), false);
  assert.equal(canEnterOffer({ platform: 'web', activeBusinessId: undefined, offerBusinessId: 'b1' }), false);
  assert.equal(canEnterOffer({ platform: 'web', activeBusinessId: 'b2', offerBusinessId: 'b1' }), false);
});

test('WebMessages / WebOffers are registered only on web and typed in MainStackParamList', () => {
  const nav = read('navigation/AppNavigator.tsx');
  assert.match(nav, /WebMessages: \{ section\?: 'messages' \| 'notifications' \} \| undefined;/);
  assert.match(nav, /WebOffers: undefined;/);
  assert.match(nav, /Platform\.OS === 'web' \? <MainStack\.Screen name="WebMessages"/);
  assert.match(nav, /Platform\.OS === 'web' \? <MainStack\.Screen name="WebOffers"/);
  assert.equal((nav.match(/name="WebMessages"/g) ?? []).length, 1);
  assert.equal((nav.match(/name="WebOffers"/g) ?? []).length, 1);
});

test('the web lazy-loads both screens; devices import them statically', () => {
  assert.match(read('navigation/lazyScreens.web.tsx'), /MessagesScreen[^\n]*lazyScreen\(\(\) => import\('\.\.\/screens\/dms\/MessagesScreen'\)\)/);
  assert.match(read('navigation/lazyScreens.web.tsx'), /OffersScreen[^\n]*lazyScreen\(\(\) => import\('\.\.\/screens\/offers\/OffersScreen'\)\)/);
  assert.match(read('navigation/lazyScreens.tsx'), /import MessagesScreenComponent from/);
});

test('the "no venue" screen links to the three screens', () => {
  const screen = read('screens/web/WebNoVenueScreen.tsx');
  assert.match(screen, /navigate\('WebMessages'\)/);
  assert.match(screen, /navigate\('WebMessages', \{ section: 'notifications' \}\)/);
  assert.match(screen, /navigate\('WebOffers'\)/);
  assert.match(screen, /useUnreadBadge\(\)/);
});

test('MessagesScreen: back arrow, tab-bar padding and section are web-only', () => {
  const screen = read('screens/dms/MessagesScreen.tsx');
  assert.match(screen, /const isWeb = Platform\.OS === 'web';/);
  assert.match(screen, /\(isWeb \? 24 : 102\) \+ insets\.bottom/);
  assert.match(screen, /isWeb \? \(\s*<View style=\{styles\.webHeader\}>/);
  assert.match(screen, /notificationsFirst = isWeb && route\.params\?\.section === 'notifications'/);
});

test('the offer card keeps its look on devices and greys "Entrar" through canEnterOffer', () => {
  const card = read('components/megaphone/MegaphoneOfferCard.tsx');
  assert.match(card, /canEnterOffer\(\{ platform: Platform\.OS,/);
  assert.match(card, /canEnter \? colors\.brandFill : colors\.bgElevated/);
  assert.match(card, /canEnter \? palette\.bgSurfaceLight : colors\.textSecondary/);
});

test('OffersScreen: the location hint and the tab-bar padding are web-only', () => {
  const screen = read('screens/offers/OffersScreen.tsx');
  assert.match(screen, /isWeb && !hasLocation/);
  assert.match(screen, /\(isWeb \? 0 : BAR_HEIGHT \+ 16\)/);
});

test('es / en have the same keys for the new strings', () => {
  const j = (l, f) => JSON.parse(read(`i18n/locales/${l}/${f}.json`));
  for (const key of ['messages', 'notifications', 'nearbyOffers']) {
    assert.ok(j('es', 'common').webShell[key] && j('en', 'common').webShell[key], `webShell.${key}`);
  }
  for (const key of ['webLocationHint', 'webAllowLocation', 'webEnterNeedsQr']) {
    assert.ok(j('es', 'offers')[key] && j('en', 'offers')[key], `offers.${key}`);
  }
  assert.equal(Object.keys(j('es', 'common').webShell).length, Object.keys(j('en', 'common').webShell).length);
  assert.equal(Object.keys(j('es', 'offers')).length, Object.keys(j('en', 'offers')).length);
});
