// Unit tests for utils/reservationCalendar.ts ("Add to calendar": the event the system editor opens) and its wiring. Run from mobile/:
//   node --test scripts/reservation-calendar.test.mjs
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const dir = mkdtempSync(join(tmpdir(), 'reservation-calendar-'));
const { outputText } = ts.transpileModule(read('utils/reservationCalendar.ts'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
writeFileSync(join(dir, 'reservationCalendar.mjs'), outputText);
const C = await import(pathToFileURL(join(dir, 'reservationCalendar.mjs')).href);

const base = {
  businessName: 'Bar Uno',
  address: 'Calle 1, Santo Domingo',
  reservedAt: '2026-11-14T00:00:00.000Z',
  timezone: 'America/Santo_Domingo',
  title: 'Reservation at Bar Uno',
  people: '4 people',
  requests: ['Terrace', 'Birthday'],
  requestsLabel: 'Requests',
};

test('the event lasts 2 hours from the reservation and keeps the venue zone', () => {
  const e = C.buildReservationEvent(base);
  assert.equal(e.title, 'Reservation at Bar Uno');
  assert.equal(e.startDate, '2026-11-14T00:00:00.000Z');
  assert.equal(e.endDate, '2026-11-14T02:00:00.000Z');
  assert.equal(new Date(e.endDate) - new Date(e.startDate), C.EVENT_DURATION_MS);
  assert.equal(e.timeZone, 'America/Santo_Domingo');
});

test('place = venue name and address; notes = people and requests', () => {
  const e = C.buildReservationEvent(base);
  assert.equal(e.location, 'Bar Uno, Calle 1, Santo Domingo');
  assert.equal(e.notes, '4 people\nRequests: Terrace, Birthday');
});

test('no requests: the notes are just the party size', () => {
  assert.equal(C.buildReservationEvent({ ...base, requests: [] }).notes, '4 people');
  assert.equal(C.buildReservationEvent({ ...base, requests: ['  ', ''] }).notes, '4 people');
});

test('no address: the place is the venue name; neither: no place', () => {
  assert.equal(C.buildReservationEvent({ ...base, address: null }).location, 'Bar Uno');
  assert.equal(C.buildReservationEvent({ ...base, address: '  ' }).location, 'Bar Uno');
  assert.equal('location' in C.buildReservationEvent({ ...base, address: null, businessName: '' }), false);
  assert.equal(C.buildReservationEvent({ ...base, businessName: '' }).location, 'Calle 1, Santo Domingo');
});

test('a bad or missing zone is not passed to the native call; a bad date gives no event', () => {
  assert.equal('timeZone' in C.buildReservationEvent({ ...base, timezone: 'Not/AZone' }), false);
  assert.equal('timeZone' in C.buildReservationEvent({ ...base, timezone: null }), false);
  assert.equal(C.buildReservationEvent({ ...base, reservedAt: 'not a date' }), null);
});

test('wiring: expo-calendar is a dependency, imported from /legacy only in the service, and the button is on', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.match(pkg.dependencies['expo-calendar'], /^~57\./);
  const service = read('services/reservationCalendar.ts');
  assert.match(service, /from 'expo-calendar\/legacy'/);
  assert.ok(!/from 'expo-calendar'/.test(service));
  assert.match(service, /requestCalendarPermissionsAsync/);
  assert.match(service, /< 17/);
  assert.match(read('components/reservations/NextReservationCard.tsx'), /CALENDAR_BUTTON_ENABLED = true/);
  for (const f of ['components/reservations/NextReservationCard.tsx', 'screens/reservations/MyReservationsScreen.tsx']) {
    assert.match(read(f), /useAddReservationToCalendar/, f);
  }
});

test('the system permission texts exist in es and en and say the app never reads the calendar', () => {
  for (const l of ['es', 'en']) {
    const ios = JSON.parse(read(`assets/locales/${l}.json`)).ios;
    assert.ok(ios.NSCalendarsUsageDescription && ios.NSCalendarsWriteOnlyAccessUsageDescription, l);
  }
  const cfg = read('app.config.ts');
  assert.match(cfg, /\['expo-calendar', \{[^}]*remindersPermission: false[^}]*writeOnlyAccess: true/);
  assert.match(cfg, /'android\.permission\.READ_CALENDAR'/);
});

test('the calendar texts have the same keys in es and en', () => {
  const es = JSON.parse(read('i18n/locales/es/reservations.json')).calendar;
  const en = JSON.parse(read('i18n/locales/en/reservations.json')).calendar;
  assert.deepEqual(Object.keys(es).sort(), Object.keys(en).sort());
  assert.match(es.eventTitle, /\{\{business\}\}/);
  assert.match(en.eventTitle, /\{\{business\}\}/);
});
