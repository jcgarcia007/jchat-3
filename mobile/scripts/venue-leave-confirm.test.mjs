// "Salir del local" asks first, from BOTH entries, through ONE shared function (utils/confirmLeaveVenue.ts → utils/dialog confirm, destructive).
// Run from mobile/:  node --test scripts/venue-leave-confirm.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const json = (lang) => JSON.parse(read(`i18n/locales/${lang}/chat.json`)).venueSession;

test('confirmLeaveVenue(businessName) is a destructive confirm with the four texts from i18n', () => {
  const src = read('utils/confirmLeaveVenue.ts');
  assert.match(src, /export function confirmLeaveVenue\(businessName: string\): Promise<boolean>/);
  assert.match(src, /from '\.\/dialog'/);
  assert.match(src, /t\('venueSession\.leaveConfirmTitle', \{ business: businessName \}\)/);
  assert.match(src, /t\('venueSession\.leaveConfirmBody'\)/);
  assert.match(src, /confirmText: t\('venueSession\.leave'\)/);
  assert.match(src, /cancelText: t\('venueSession\.leaveCancel'\)/);
  assert.match(src, /destructive: true/);
});

test('the texts exist in en and es with the same keys', () => {
  const en = json('en');
  const es = json('es');
  assert.deepEqual(Object.keys(en).sort(), Object.keys(es).sort());
  assert.equal(es.leaveConfirmTitle, '¿Salir de {{business}}?');
  assert.equal(es.leaveConfirmBody, 'Se perderá toda la conversación del local. Para volver tendrás que escanear el QR o estar dentro del local.');
  assert.equal(es.leave, 'Salir del local');
  assert.equal(es.leaveCancel, 'Cancelar');
  assert.match(en.leaveConfirmTitle, /\{\{business\}\}/);
  assert.ok(en.leaveConfirmBody && en.leave && en.leaveCancel);
});

test('the chat menu asks through the shared function before leaveVenue; no inline confirm is left', () => {
  const chat = read('screens/chat/ChatRoomScreen.tsx');
  assert.match(chat, /import \{ confirmLeaveVenue \} from '\.\.\/\.\.\/utils\/confirmLeaveVenue';/);
  assert.match(chat, /void confirmLeaveVenue\(business\?\.name \?\? ''\)\.then\(\(accepted\) => \{\s*if \(!accepted\) return;/);
  assert.doesNotMatch(chat, /venueSession\.leaveConfirmTitle/);
});
