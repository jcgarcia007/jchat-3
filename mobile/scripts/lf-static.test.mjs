// Lote F, parte app (puntos 7-12): static checks of the coherence copy fixes.
// Run from mobile/:  node --test scripts/lf-static.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const json = (lang, ns) => JSON.parse(read(`i18n/locales/${lang}/${ns}.json`));
const get = (obj, path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
const LANGS = ['es', 'en'];

test('7: the 24 h line is in the "before you enter" sheet and the room "more" sheet, ES and EN', () => {
  for (const lang of LANGS) {
    const chat = json(lang, 'chat');
    assert.match(get(chat, 'chatRoom.retention24h'), /24/);
    assert.match(get(chat, 'moreSheet.retentionNote'), /24/);
  }
  assert.match(read('screens/chat/ChatRoomScreen.tsx'), /gt\('chatRoom\.retention24h'\)/);
  assert.match(read('components/chat/ChatMoreSheet.tsx'), /t\('moreSheet\.retentionNote'\)/);
  assert.match(get(json('es', 'chat'), 'moreSheet.retentionNote'), /fijados/);
  assert.match(get(json('en', 'chat'), 'moreSheet.retentionNote'), /pinned/);
});

test('8: the age step says up front that JChat is for people 18 or older; the rejection dialog stays neutral (B2-13, age-rejection.test.mjs)', () => {
  const es = json('es', 'auth');
  const en = json('en', 'auth');
  assert.match(get(es, 'age.subtitle'), /mayores de 18 años/);
  assert.match(get(en, 'age.subtitle'), /18 or older/);
  for (const key of ['age.notEligibleMessage', 'register.dobError', 'register.alerts.ageMessage']) {
    assert.doesNotMatch(get(es, key), /18/, `es ${key}`);
    assert.doesNotMatch(get(en, key), /18/, `en ${key}`);
  }
  // the rule itself (>= 18 years) is unchanged
  assert.match(read('screens/auth/RegisterStep2Screen.tsx'), /today\.getFullYear\(\) - 18/);
});

test('9: no screen promises a confirmation email that is not sent', () => {
  for (const lang of LANGS) {
    const success = get(json(lang, 'pos'), 'success');
    assert.equal(success.emailNote, undefined);
    assert.match(success.ordersNote, lang === 'es' ? /Mis pedidos/ : /My orders/);
  }
  const screen = read('screens/checkout/PaymentSuccessScreen.tsx');
  assert.doesNotMatch(screen, /success\.emailNote|TODO\(server\): confirmation email/);
  assert.match(screen, /success\.ordersNote/);
  // "My orders" is the real name of the screen in the app's own translations
  assert.equal(get(json('es', 'settings'), 'main.myOrders'), 'Mis pedidos');
  assert.equal(get(json('en', 'settings'), 'main.myOrders'), 'My orders');
});

test('10a: Touch ID never shows on Android (lock screen and biometric enrollment)', () => {
  for (const lang of LANGS) {
    const auth = json(lang, 'auth');
    assert.doesNotMatch(auth.lock.subtitleAndroid, /Touch ID|Face ID/);
    assert.doesNotMatch(auth.biometricEnroll.methodFaceAndroid, /Touch ID|Face ID/);
    assert.doesNotMatch(auth.biometricEnroll.methodFingerprintAndroid, /Touch ID|Face ID/);
  }
  assert.match(read('screens/auth/LockScreen.tsx'), /Platform\.OS === 'android' \? 'lock\.subtitleAndroid'/);
  const sheet = read('components/auth/BiometricEnrollSheet.tsx');
  assert.match(sheet, /methodFingerprintAndroid/);
  assert.match(sheet, /methodFaceAndroid/);
});

test('10b: one spelling, "Blocked users"', () => {
  const settings = JSON.stringify(json('en', 'settings'));
  assert.doesNotMatch(settings, /Blocked Users/);
  assert.equal(get(json('en', 'settings'), 'privacy.sectionBlocked'), 'Blocked users');
});

test('10c: one block explanation, shared by the five block dialogs', () => {
  for (const lang of LANGS) {
    const report = get(json(lang, 'common'), 'report');
    assert.ok(report.blockMessage && report.blockMessageRoom);
    assert.ok(report.blockMessageRoom.startsWith(report.blockMessage), 'room text = general text + the room note');
    // the old, contradictory texts are gone from the other namespaces
    assert.equal(get(json(lang, 'chat'), 'userAction.blockMessage'), undefined);
    assert.equal(get(json(lang, 'profile'), 'block.message'), undefined);
    assert.equal(get(json(lang, 'feed'), 'storyViewer.blockMessage'), undefined);
    assert.doesNotMatch(get(json(lang, 'chat'), 'quickCard.blockConfirm'), /mensajes|messages/);
  }
  assert.match(read('screens/dms/DMChatScreen.tsx'), /tc\('report\.blockMessage'\)/);
  assert.match(read('screens/chat/ChatRoomScreen.tsx'), /tc\('report\.blockMessageRoom'\)/);
  assert.match(read('components/chat/UserActionSheet.tsx'), /report\.blockMessageRoom/);
  assert.match(read('components/chat/UserQuickCard.tsx'), /report\.blockMessageRoom/);
  assert.match(read('screens/profile/ProfileScreen.tsx'), /t\('report\.blockMessage', \{ ns: 'common' \}\)/);
  assert.match(read('screens/stories/StoryViewerScreen.tsx'), /t\('report\.blockMessage', \{ ns: 'common' \}\)/);
});

test('11: the owner alert no longer says "close or transfer it"', () => {
  for (const lang of LANGS) {
    const message = get(json(lang, 'settings'), 'alerts.deleteOwnerMessage');
    assert.doesNotMatch(message, /transfer/i);
    assert.match(message, /\{\{contact\}\}/);
  }
  assert.match(read('screens/settings/SettingsScreen.tsx'), /alerts\.deleteOwnerMessage', \{ contact: ACCOUNT_SUPPORT_EMAIL \}/);
});

test('12: a single answer deadline, 1-2 business days, and no "24 h" review promise', () => {
  assert.match(get(json('es', 'common'), 'report.successMessage'), /1–2 días hábiles/);
  assert.match(get(json('en', 'common'), 'report.successMessage'), /1–2 business days/);
  for (const lang of LANGS) {
    assert.doesNotMatch(get(json(lang, 'common'), 'report.successMessage'), /24/);
  }
});
