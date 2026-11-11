// Unit tests for utils/reservationFlow.ts (the keyboard-free reservation flow). Run from mobile/:
//   node --test scripts/reservation-flow.test.mjs
// The phone's zone is set to Tokyo on purpose: everything must follow the VENUE's zone, never the phone's.
process.env.TZ = 'Asia/Tokyo';

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const dir = mkdtempSync(join(tmpdir(), 'reservation-flow-'));
const source = readFileSync(new URL('../utils/reservationFlow.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
writeFileSync(join(dir, 'reservationFlow.mjs'), outputText);
const F = await import(pathToFileURL(join(dir, 'reservationFlow.mjs')).href);

const ALL = (open, close, closedDow) => Object.fromEntries(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map((k, i) => [k, { open, close, closed: i === closedDow }]));
const NY = 'America/New_York';
const RD = 'America/Santo_Domingo';
// Sat 2026-11-14 10:00 in New York (EST, UTC−5) = 15:00Z
const NOW = Date.parse('2026-11-14T15:00:00Z');

test('todayInZone follows the venue zone, not the phone (Tokyo)', () => {
  assert.equal(F.todayInZone(Date.parse('2026-11-14T03:00:00Z'), NY), '2026-11-13'); // 22:00 on the 13th in New York
  assert.equal(F.todayInZone(Date.parse('2026-11-14T03:00:00Z'), 'Asia/Tokyo'), '2026-11-14');
  assert.equal(F.todayInZone(NOW, RD), '2026-11-14');
});

test('an invalid zone falls back to New York', () => {
  assert.equal(F.safeZone('Not/AZone'), NY);
  assert.equal(F.safeZone(''), NY);
  assert.equal(F.safeZone(undefined), NY);
  assert.equal(F.safeZone(RD), RD);
});

test('date arithmetic and weekday', () => {
  assert.equal(F.addDays('2026-12-30', 3), '2027-01-02');
  assert.equal(F.addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(F.daysBetween('2026-11-14', '2027-01-13'), 60);
  assert.equal(F.weekday('2026-11-14'), 6); // Saturday
  assert.equal(F.parseDate('2026-02-30'), null);
  assert.equal(F.parseDate('nope'), null);
});

test('zonedInstant: 12:00 New York is 17:00Z in winter and 16:00Z in summer; Santo Domingo is always UTC−4', () => {
  assert.equal(new Date(F.zonedInstant('2026-11-15', 12 * 60, NY)).toISOString(), '2026-11-15T17:00:00.000Z');
  assert.equal(new Date(F.zonedInstant('2026-07-15', 12 * 60, NY)).toISOString(), '2026-07-15T16:00:00.000Z');
  assert.equal(new Date(F.zonedInstant('2026-11-15', 12 * 60, RD)).toISOString(), '2026-11-15T16:00:00.000Z');
  assert.equal(new Date(F.zonedInstant('2026-07-15', 12 * 60, RD)).toISOString(), '2026-07-15T16:00:00.000Z');
  assert.equal(new Date(F.zonedInstant('2026-11-15', 25 * 60, RD)).toISOString(), '2026-11-16T05:00:00.000Z'); // 01:00 the next day
});

test('slots of a normal day: every 30 minutes, the last one 30 minutes before closing', () => {
  const slots = F.slotsFromHours(ALL('12:00', '15:00'), NY, '2026-11-16', NOW);
  assert.equal(slots.length, 6);
  assert.equal(slots[0].slot_at, '2026-11-16T17:00:00.000Z');
  assert.equal(slots[5].slot_at, '2026-11-16T19:30:00.000Z'); // 14:30 EST
  assert.ok(slots.every((s) => s.status === 'open'));
});

test('a night schedule crosses midnight: 18:00 → 02:00 gives 16 slots, the last one 01:30 the next day', () => {
  const slots = F.slotsFromHours(ALL('18:00', '02:00'), NY, '2026-11-16', NOW);
  assert.equal(slots.length, 16);
  assert.equal(slots[0].slot_at, '2026-11-16T23:00:00.000Z');
  assert.equal(slots[15].slot_at, '2026-11-17T06:30:00.000Z'); // 01:30 EST on the 17th
});

test('a closed day, a missing day, empty hours and open = close give no slots', () => {
  assert.deepEqual(F.slotsFromHours(ALL('12:00', '15:00', 1), NY, '2026-11-16', NOW), []); // Monday closed
  assert.equal(F.slotsFromHours(ALL('12:00', '15:00', 1), NY, '2026-11-17', NOW).length, 6);
  assert.deepEqual(F.slotsFromHours({}, NY, '2026-11-16', NOW), []);
  assert.deepEqual(F.slotsFromHours(null, NY, '2026-11-16', NOW), []);
  assert.deepEqual(F.slotsFromHours(ALL('12:00', '12:00'), NY, '2026-11-16', NOW), []);
  assert.deepEqual(F.slotsFromHours(ALL('nope', '15:00'), NY, '2026-11-16', NOW), []);
});

test('today: hours already gone and the next 30 minutes are not offered', () => {
  // NOW = 10:00 local; hours 09:00–15:00 → the first offered slot is 10:30 (>= now + 30 min)
  const slots = F.slotsFromHours(ALL('09:00', '15:00'), NY, '2026-11-14', NOW);
  assert.equal(slots[0].slot_at, '2026-11-14T15:30:00.000Z');
  assert.equal(slots.length, 9); // 10:30 … 14:30
  // one minute before the boundary: 10:29 is not enough notice for 10:30? it is (>= now + 30 → exactly 10:30 ok)
  const edge = F.slotsFromHours(ALL('09:00', '15:00'), NY, '2026-11-14', Date.parse('2026-11-14T15:01:00Z'));
  assert.equal(edge[0].slot_at, '2026-11-14T16:00:00.000Z'); // 10:01 + 30 min = 10:31 → 11:00
});

test('past days and days beyond today + 60 have no slots; today + 60 does', () => {
  assert.deepEqual(F.slotsFromHours(ALL('12:00', '15:00'), NY, '2026-11-13', NOW), []);
  assert.equal(F.slotsFromHours(ALL('12:00', '15:00'), NY, '2027-01-13', NOW).length, 6); // +60
  assert.deepEqual(F.slotsFromHours(ALL('12:00', '15:00'), NY, '2027-01-14', NOW), []); // +61
});

test('the Dominican venue and the New York venue get different instants for the same wall time', () => {
  const ny = F.slotsFromHours(ALL('12:00', '13:00'), NY, '2026-11-16', NOW)[0].slot_at;
  const rd = F.slotsFromHours(ALL('12:00', '13:00'), RD, '2026-11-16', NOW)[0].slot_at;
  assert.equal(ny, '2026-11-16T17:00:00.000Z');
  assert.equal(rd, '2026-11-16T16:00:00.000Z');
});

test('full marks every slot of the day', () => {
  const slots = F.slotsFromHours(ALL('12:00', '14:00'), NY, '2026-11-16', NOW, true);
  assert.equal(slots.length, 4);
  assert.ok(slots.every((s) => s.status === 'full'));
});

test('dayStrip: 14 days from the venue\'s today, closed days flagged, today marked', () => {
  const strip = F.dayStrip(ALL('12:00', '15:00', 0), NY, NOW); // Sundays closed
  assert.equal(strip.length, 14);
  assert.equal(strip[0].date, '2026-11-14');
  assert.equal(strip[0].isToday, true);
  assert.equal(strip[13].date, '2026-11-27');
  assert.deepEqual(strip.filter((d) => !d.open).map((d) => d.date), ['2026-11-15', '2026-11-22']);
});

test('monthGrid: weeks start on Sunday, cells outside the range are not selectable, closed days are flagged', () => {
  const weeks = F.monthGrid(2026, 11, ALL('12:00', '15:00', 0), NY, NOW);
  assert.ok(weeks.every((w) => w.length === 7));
  const cells = weeks.flat().filter(Boolean);
  assert.equal(cells.length, 30);
  assert.equal(weeks[0].filter((c) => c === null).length, 0); // Nov 1 2026 is a Sunday
  const get = (d) => cells.find((c) => c.date === d);
  assert.equal(get('2026-11-13').selectable, false); // yesterday
  assert.equal(get('2026-11-13').closed, false);
  assert.equal(get('2026-11-14').selectable, true);
  assert.equal(get('2026-11-14').isToday, true);
  assert.equal(get('2026-11-15').selectable, false); // Sunday closed
  assert.equal(get('2026-11-15').closed, true);
  const jan = F.monthGrid(2027, 1, ALL('12:00', '15:00'), NY, NOW).flat().filter(Boolean);
  assert.equal(jan.find((c) => c.date === '2027-01-13').selectable, true); // +60
  assert.equal(jan.find((c) => c.date === '2027-01-14').selectable, false); // +61
});

test('calendarMonths: from this month to the month of today + 60 days', () => {
  assert.deepEqual(F.calendarMonths(NY, NOW), [{ year: 2026, month: 11 }, { year: 2026, month: 12 }, { year: 2027, month: 1 }]);
});

test('slotStillAvailable finds the picked slot among fresh ones, or null', () => {
  const slots = [{ slot_at: '2026-11-16T17:00:00.000Z', status: 'open' }, { slot_at: '2026-11-16T17:30:00Z', status: 'full' }];
  assert.equal(F.slotStillAvailable(slots, '2026-11-16T17:30:00.000Z').status, 'full');
  assert.equal(F.slotStillAvailable(slots, '2026-11-16T18:00:00.000Z'), null);
  assert.equal(F.slotStillAvailable(slots, null), null);
  assert.equal(F.slotStillAvailable([], '2026-11-16T17:00:00.000Z'), null);
});

test('party size: 1–8, then 9+ opens 9–20', () => {
  assert.deepEqual(F.partyOptions(false), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(F.partyOptions(true), [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
  assert.equal(F.isValidParty(20), true);
  assert.equal(F.isValidParty(21), false);
  assert.equal(F.isValidParty(0), false);
  assert.equal(F.isValidParty(null), false);
  assert.equal(F.isValidParty(2.5), false);
});

test('request chips: serialization keeps keys only, deduplicated, in the chips\' order', () => {
  assert.equal(F.serializeRequests([]), null);
  assert.equal(F.serializeRequests(['terrace', 'birthday']), 'birthday,terrace');
  assert.equal(F.serializeRequests(['birthday', 'birthday', 'free text', 'near_tv']), 'birthday,near_tv');
  assert.equal(F.serializeRequests(['hello']), null);
  assert.deepEqual(F.toggleRequest([], 'terrace'), ['terrace']);
  assert.deepEqual(F.toggleRequest(['terrace'], 'birthday'), ['birthday', 'terrace']);
  assert.deepEqual(F.toggleRequest(['birthday', 'terrace'], 'birthday'), ['terrace']);
  assert.equal(F.REQUEST_KEYS.length, 9);
});

test('parseRequests: known keys are translated, old free text is shown as it is', () => {
  assert.deepEqual(F.parseRequests('birthday,terrace'), { keys: ['birthday', 'terrace'], legacy: null });
  assert.deepEqual(F.parseRequests(' terrace , birthday '), { keys: ['birthday', 'terrace'], legacy: null });
  assert.deepEqual(F.parseRequests('Alergia a los mariscos, mesa tranquila'), { keys: [], legacy: 'Alergia a los mariscos, mesa tranquila' });
  assert.deepEqual(F.parseRequests('birthday,mesa junto a la ventana'), { keys: [], legacy: 'birthday,mesa junto a la ventana' });
  assert.deepEqual(F.parseRequests(''), { keys: [], legacy: null });
  assert.deepEqual(F.parseRequests(null), { keys: [], legacy: null });
});

test('labels: the long date, the weekday and the slot time in the venue zone', () => {
  assert.equal(F.longDateLabel('2026-11-14', 'es'), 'sábado 14 de noviembre');
  assert.equal(F.longDateLabel('2026-11-14', 'en'), 'Saturday, November 14');
  assert.equal(F.shortWeekday('2026-11-14', 'en'), 'Sat');
  assert.equal(F.shortWeekday('2026-11-14', 'es'), 'sáb');
  assert.equal(F.slotTimeLabel('2026-11-16T23:00:00.000Z', NY, 'es'), '18:00');
  assert.equal(F.slotTimeLabel('2026-11-16T23:00:00.000Z', NY, 'en').replace(/\s/g, ' '), '6:00 PM');
  assert.equal(F.slotTimeLabel('2026-11-16T23:00:00.000Z', RD, 'es'), '19:00');
  assert.equal(F.monthTitle(2026, 11, 'en'), 'November 2026');
});

test('flow state: changing the date clears the time; the rest is kept; the payload follows the choice', () => {
  let s = F.pickDate(F.EMPTY_FLOW, '2026-11-16');
  s = F.pickSlot(s, { slot_at: '2026-11-16T17:00:00.000Z', status: 'full' });
  s = { ...s, party: 4, requests: ['terrace', 'birthday'] };
  assert.equal(F.reviewReady(s), true);
  assert.deepEqual(F.reservationPayload(s), { reserved_at: '2026-11-16T17:00:00.000Z', party_size: 4, special_requests: 'birthday,terrace', is_waitlist: true });
  const same = F.pickDate(s, '2026-11-16');
  assert.equal(same, s);
  const changed = F.pickDate(s, '2026-11-17');
  assert.equal(changed.slotAt, null);
  assert.equal(changed.slotStatus, null);
  assert.equal(changed.party, 4);
  assert.deepEqual(changed.requests, ['terrace', 'birthday']);
  assert.equal(F.reservationPayload(changed), null);
  assert.equal(F.firstIncompleteStep(changed), 'time');
  assert.equal(F.firstIncompleteStep(F.EMPTY_FLOW), 'date');
  assert.equal(F.firstIncompleteStep({ ...F.EMPTY_FLOW, date: '2026-11-16', slotAt: 'x', slotStatus: 'open' }), 'people');
  assert.equal(F.firstIncompleteStep(s), 'review');
  const open = F.pickSlot(s, { slot_at: '2026-11-16T18:00:00.000Z', status: 'open' });
  assert.equal(F.reservationPayload(open).is_waitlist, false);
});

test('canContinue and nextStep', () => {
  assert.equal(F.canContinue(F.EMPTY_FLOW, 'date'), false);
  assert.equal(F.canContinue(F.pickDate(F.EMPTY_FLOW, '2026-11-16'), 'date'), true);
  assert.equal(F.canContinue(F.EMPTY_FLOW, 'time'), false);
  assert.equal(F.canContinue({ ...F.EMPTY_FLOW, party: 3 }, 'people'), true);
  assert.equal(F.canContinue(F.EMPTY_FLOW, 'requests'), true);
  assert.equal(F.canContinue(F.EMPTY_FLOW, 'review'), false);
  assert.equal(F.nextStep('date'), 'time');
  assert.equal(F.nextStep('review'), 'done');
  assert.equal(F.nextStep('done'), 'done');
});

test('bookingName: display name, else @username, else null', () => {
  assert.equal(F.bookingName({ display_name: ' Ana Pérez ', username: 'ana' }), 'Ana Pérez');
  assert.equal(F.bookingName({ display_name: '', username: 'ana' }), '@ana');
  assert.equal(F.bookingName({ display_name: null, username: '@ana' }), '@ana');
  assert.equal(F.bookingName({ display_name: null, username: null }), null);
  assert.equal(F.bookingName(null), null);
});
