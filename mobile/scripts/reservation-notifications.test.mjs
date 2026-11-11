// M3: the reservation notices and the "Your next reservation" card are wired end to end in the app. Run from mobile/:
//   node --test scripts/reservation-notifications.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const hook = read('../hooks/useNotifications.ts');
const presenter = read('../hooks/useNotificationPresenter.ts');
const service = read('../services/notifications.ts');
const navigator = read('../navigation/AppNavigator.tsx');
const card = read('../components/reservations/NextReservationCard.tsx');
const nextHook = read('../hooks/useNextReservation.ts');
const nearby = read('../screens/nearby/NearbyScreen.tsx');
const mine = read('../screens/reservations/MyReservationsScreen.tsx');
const social = (lang) => JSON.parse(read(`../i18n/locales/${lang}/social.json`)).messages.notif;
const res = (lang) => JSON.parse(read(`../i18n/locales/${lang}/reservations.json`));
const TYPES = ['reservation_confirmed', 'reservation_rejected', 'reservation_requested', 'reservation_reminder'];

test('the four types exist, are part of the social list and have an icon (service accent + inbox icon)', () => {
  for (const t of TYPES) {
    assert.match(service, new RegExp(`\\| '${t}'`), t);
    assert.match(service, new RegExp(`case '${t}':\\s*\\n\\s*return \\{ icon:`), `${t} icon`);
    assert.match(presenter, new RegExp(`${t}: Icon`), `${t} presenter icon`);
  }
  assert.match(service, /\.\.\.RESERVATION_NOTIFICATION_TYPES/);
});

test('with the app open all four show the OS banner', () => {
  const set = hook.slice(hook.indexOf('FOREGROUND_BANNER_TYPES'), hook.indexOf(']);', hook.indexOf('FOREGROUND_BANNER_TYPES')));
  for (const t of TYPES) assert.ok(set.includes(`'${t}'`), t);
});

test('a tap opens My reservations through the navigator and through the in-app presenter', () => {
  assert.match(navigator, /route\.screen === 'MyReservations'\) navigationRef\.navigate\('MyReservations'\)/);
  assert.match(presenter, /route\.screen === 'MyReservations'\) nav\.navigate\('MyReservations'\)/);
});

test('texts in es and en: venue, and the date / time / people where they apply', () => {
  for (const lang of ['es', 'en']) {
    const n = social(lang);
    assert.match(n.reservationConfirmed, /\{\{business\}\}.*\{\{date\}\}.*\{\{time\}\}/);
    assert.match(n.reservationRejected, /\{\{business\}\}/);
    assert.match(n.reservationRequested_one, /\{\{count\}\}/);
    assert.match(n.reservationRequested_other, /\{\{count\}\}/);
    assert.match(n.reservationReminder24h, /\{\{time\}\}.*\{\{business\}\}/);
    assert.match(n.reservationReminder2h_other, /\{\{business\}\}.*\{\{count\}\}/);
  }
  assert.equal(social('es').reservationRejected, '{{business}} no pudo aceptar tu reserva');
  assert.equal(social('en').reservationRejected, "{{business}} couldn't accept your reservation");
  assert.match(social('es').reservationReminder24h, /^Mañana a las/);
});

test('the card sits on top of Nearby and of My reservations', () => {
  assert.match(nearby, /ListHeaderComponent=\{<NextReservationCard \/>\}/);
  assert.match(mine, /ListHeaderComponent=\{<NextReservationCard onChange=/);
});

test('the card: no calendar button and no calendar module until the build has it', () => {
  assert.match(card, /CALENDAR_BUTTON_ENABLED = false/);
  assert.ok(!/expo-calendar/.test(card + nextHook));
  const pkg = JSON.parse(read('../package.json'));
  assert.equal(pkg.dependencies['expo-calendar'], undefined);
});

test('the card hook: Realtime filtered on the user, unsubscribed on unmount, refreshed on foreground, leaves on its own', () => {
  assert.match(nextHook, /table: 'reservations', filter: `user_id=eq\.\$\{userId\}`/);
  assert.match(nextHook, /supabase\.removeChannel\(channel\)/);
  assert.match(nextHook, /state === 'active'/);
  assert.match(nextHook, /msUntilCardChanges/);
});

test('the card is one accessible region with 48 pt buttons from the type standard (no numeric font sizes, no hex)', () => {
  assert.match(card, /accessibilityRole="summary"/);
  assert.match(card, /minHeight: controlMinHeight/);
  assert.ok(!/fontSize\s*:/.test(card), 'no numeric fontSize');
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(card), 'no hex colours');
  assert.match(card, /accessibilityLabel=\{t\('next\.directionsA11y'/);
  assert.match(card, /accessibilityLabel=\{t\('cancelA11y'/);
});

test('cancel goes through a confirmation first (two steps) and the existing cancelMyReservation', () => {
  assert.match(card, /await confirm\(/);
  assert.match(read('../hooks/useNextReservation.ts'), /cancelMyReservation\(id\)/);
});

test('reservations texts exist in es and en (next card, reject reasons, rejected status), translated', () => {
  const en = res('en');
  const es = res('es');
  for (const k of ['title', 'today', 'tomorrow', 'more_one', 'more_other', 'moreA11y', 'directions', 'directionsA11y', 'viewVenue', 'viewVenueA11y', 'cancel', 'directionsError', 'a11y']) {
    assert.equal(typeof en.next[k], 'string', `en next.${k}`);
    assert.equal(typeof es.next[k], 'string', `es next.${k}`);
  }
  assert.equal(es.next.title, 'Tu próxima reserva');
  assert.equal(en.next.title, 'Your next reservation');
  assert.equal(es.next.directions, 'Cómo llegar');
  for (const k of ['no_availability', 'closed_that_day', 'group_too_large']) assert.notEqual(en.rejectReason[k], es.rejectReason[k]);
  assert.equal(es.status.rejected, 'Rechazada');
  assert.equal(en.status.rejected, 'Rejected');
  assert.equal(es.status.pending, 'Pendiente de confirmación');
  assert.match(en.rejectedReason, /\{\{reason\}\}/);
});
