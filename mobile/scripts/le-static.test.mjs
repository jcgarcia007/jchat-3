// Lote E, rama A (app): static checks of the polish fixes (H-0xx in docs/audits/punto-a-punto-2026-11/HALLAZGOS.md).
// Run from mobile/:  node --test scripts/le-static.test.mjs
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const json = (path) => JSON.parse(read(path));

// ── H-029: the version line ──────────────────────────────────────────────────
const dir = mkdtempSync(join(tmpdir(), 'le-static-'));
const source = read('utils/appVersion.ts')
  .replace("import { Platform } from 'react-native';", 'const Platform = { OS: "ios" };')
  .replace("import Constants from 'expo-constants';", 'const Constants = { expoConfig: { version: "1.0.0" }, platform: { ios: { buildNumber: "15" } } };');
writeFileSync(join(dir, 'appVersion.mjs'), ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText);
const { formatAppVersion } = await import(pathToFileURL(join(dir, 'appVersion.mjs')).href);

test('H-029: the version line is "1.0.0 (15)", the version alone without a build, nothing without a version', () => {
  assert.equal(formatAppVersion('1.0.0', '15'), '1.0.0 (15)');
  assert.equal(formatAppVersion('1.0.0', 15), '1.0.0 (15)');
  assert.equal(formatAppVersion(' 1.0.0 ', null), '1.0.0');
  assert.equal(formatAppVersion('1.0.0', ''), '1.0.0');
  assert.equal(formatAppVersion(null, '15'), null);
  assert.equal(formatAppVersion(undefined, undefined), null);
  assert.match(read('screens/settings/SettingsScreen.tsx'), /testID="settings-version"/);
});

// ── H-086 / H-019: texts ─────────────────────────────────────────────────────
test('H-086: Face ID is iOS only; Android says fingerprint or face recognition (ES and EN)', () => {
  const settings = read('screens/settings/SettingsScreen.tsx');
  assert.match(settings, /Platform\.OS === 'android' \? 'main\.biometricLockAndroid' : 'main\.biometricLock'/);
  for (const lang of ['es', 'en']) {
    const s = json(`i18n/locales/${lang}/settings.json`);
    for (const key of ['biometricLockAndroid', 'biometricLockUnavailableAndroid']) assert.ok(s.main[key], `${lang} main.${key}`);
    assert.ok(s.alerts.biometricUnavailableMessageAndroid, `${lang} alerts.biometricUnavailableMessageAndroid`);
    for (const key of ['biometricLockAndroid', 'biometricLockUnavailableAndroid']) assert.ok(!/face id|touch id/i.test(s.main[key]), `${lang} ${key} names no Apple brand`);
    assert.ok(!/face id|touch id/i.test(s.alerts.biometricUnavailableMessageAndroid));
  }
});

test('H-019: strikes have a Spanish plural and Verdad o Reto is translated', () => {
  const es = json('i18n/locales/es/settings.json');
  const en = json('i18n/locales/en/settings.json');
  assert.deepEqual([es.pos.approval.deviceStrikes_one, es.pos.approval.deviceStrikes_other], ['{{count}} advertencia', '{{count}} advertencias']);
  assert.deepEqual([en.pos.approval.deviceStrikes_one, en.pos.approval.deviceStrikes_other], ['{{count}} strike', '{{count}} strikes']);
  const tod = json('i18n/locales/es/tod.json');
  assert.equal(tod.title, 'Verdad o Reto');
  assert.equal(tod.card.hiddenFace, 'Verdad o Reto');
  assert.equal(json('i18n/locales/en/tod.json').title, 'Truth or Dare');
});

// ── H-034 / H-038: cart, payment, order tracking ─────────────────────────────
test('H-034: the disabled cart button says what is missing, and payment states the venue reason once', () => {
  const cart = read('screens/menu/CartScreen.tsx');
  assert.match(cart, /orderType === 'table' && !tableLabel\?\.trim\(\)\s*\?\s*t\('cart\.needTableButton'\)/);
  assert.match(cart, /: blockedLabel/);
  assert.ok(!cart.includes("t('cart.checkoutHint')") && !cart.includes("{t('cart.tableRequired')}"), 'no second line repeating what the button says');
  const checkout = read('screens/checkout/CheckoutScreen.tsx');
  assert.match(checkout, /venueBlocked \? t\('checkout\.payBlockedVenue'\)/);
  assert.equal((checkout.match(/t\('checkout\.venueTitle'/g) ?? []).length, 1, 'the reason "Para pedir necesitas estar en …" appears once');
  for (const lang of ['es', 'en']) {
    const pos = json(`i18n/locales/${lang}/pos.json`);
    for (const key of ['needTableButton', 'needRecipientButton']) assert.ok(pos.cart[key], `${lang} cart.${key}`);
    assert.ok(pos.checkout.payBlockedVenue, `${lang} checkout.payBlockedVenue`);
  }
});

test('H-038: a step the order has passed is done (green), never left amber', () => {
  const tracking = read('screens/orders/OrderTrackingScreen.tsx');
  assert.match(tracking, /const isDone = idx < currentStepIdx;/);
  assert.match(tracking, /isDone \? palette\.success : isActive \? step\.activeColor/);
  assert.match(tracking, /idx < currentStepIdx \? palette\.success : c\.borderSubtle/);
});

// ── H-036/H-049: Edit profile title; H-082: login Return ──────────────────────
test('H-036 / H-049: the Edit profile title is not shrunk to fit', () => {
  const edit = read('screens/profile/EditProfileScreen.tsx');
  assert.ok(!/adjustsFontSizeToFit/.test(edit.slice(edit.indexOf("t('edit.title')") - 400, edit.indexOf("t('edit.title')"))));
});

test('H-082: the login submits with the latest typed or pasted values (refs written in onChangeText)', () => {
  const login = read('screens/auth/LoginEmailScreen.tsx');
  assert.match(login, /const trimmedEmail = emailRef\.current\.trim\(\);/);
  assert.match(login, /const trimmedPassword = passwordRef\.current\.trim\(\);/);
  assert.match(login, /emailRef\.current = value; setEmail\(value\)/);
  assert.match(login, /passwordRef\.current = value; setPassword\(value\)/);
});

// ── Map: H-043, H-050 / H-083, H-090 ─────────────────────────────────────────
test('H-043: "N places near you" is shown only with a position', () => {
  assert.match(read('screens/map/MapScreen.tsx'), /resultCount=\{userCoords !== null \? filtered\.length : undefined\}/);
});

test('H-050 / H-083: the count has its own surface, the panel has side margins, the style picker is folded by default', () => {
  const panel = read('components/map/FilterPanel.tsx');
  assert.match(panel, /resultCountPill/);
  assert.match(panel, /marginHorizontal: 16/);
  const map = read('screens/map/MapScreen.tsx');
  assert.match(map, /const \[styleOpen, setStyleOpen\] = useState\(false\);/);
  assert.match(map, /testID="map-style-backdrop"/);
  assert.match(map, /onPress=\{\(\) => \{ setMapVariant\(variant\); setStyleOpen\(false\); \}\}/);
  for (const lang of ['es', 'en']) assert.ok(json(`i18n/locales/${lang}/map.json`).mapScreen.mapStyleToggleA11y);
});

test('H-090: with a sheet open the map controls are hidden from screen readers and the sheet is modal', () => {
  const map = read('screens/map/MapScreen.tsx');
  assert.match(map, /accessibilityElementsHidden=\{selected !== null \|\| reserveFor !== null\}/);
  assert.match(map, /importantForAccessibility=\{selected !== null \|\| reserveFor !== null \? 'no-hide-descendants' : 'auto'\}/);
  assert.ok((map.match(/accessibilityViewIsModal/g) ?? []).length >= 2);
});

// ── H-048: every distance goes through the one rule ──────────────────────────
test('H-048: no screen formats a distance by itself any more', () => {
  for (const file of [
    'screens/map/MapScreen.tsx',
    'components/map/BusinessPreviewCard.tsx',
    'components/map/BusinessCardSheet.tsx',
    'components/megaphone/MegaphoneOfferCard.tsx',
    'components/megaphone/MegaphonePostCard.tsx',
    'screens/nearby/NearbyScreen.tsx',
  ]) {
    const text = read(file);
    assert.ok(!/formatMeters\(|formatDistance\(/.test(text), `${file} must use utils/distanceText`);
    assert.ok(/utils\/distanceText/.test(text), `${file} imports utils/distanceText`);
  }
  for (const lang of ['es', 'en']) assert.ok(json(`i18n/locales/${lang}/common.json`).distanceHere);
});
