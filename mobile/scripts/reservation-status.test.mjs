// Unit tests for utils/reservationStatus.ts (cancel rules, sections, status chips, date text). Run from mobile/:
//   node --test scripts/reservation-status.test.mjs
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const dir = mkdtempSync(join(tmpdir(), 'reservation-status-'));
const opts = { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } };
// hours.ts is a dependency: transpile both next to each other (imports are extension-less, so rewrite to .mjs).
for (const name of ['hours', 'reservationStatus']) {
  const source = readFileSync(new URL(`../utils/${name}.ts`, import.meta.url), 'utf8');
  let { outputText } = ts.transpileModule(source, opts);
  outputText = outputText.replace(/from '\.\/hours'/g, "from './hours.mjs'");
  writeFileSync(join(dir, `${name}.mjs`), outputText);
}
const { canCancel, isUpcoming, statusLabelKey, statusTone, splitReservations, formatReservationWhen, effectiveStatus } = await import(
  pathToFileURL(join(dir, 'reservationStatus.mjs')).href
);

const NOW = new Date(2026, 9, 24, 12, 0, 0); // local noon, 24 Oct 2026
const iso = (d) => d.toISOString();
const future = iso(new Date(2026, 9, 25, 19, 0, 0));
const past = iso(new Date(2026, 9, 23, 19, 0, 0));
const R = (status, reserved_at) => ({ status, reserved_at });

test('canCancel: pending or confirmed and in the future', () => {
  assert.equal(canCancel(R('pending', future), NOW), true);
  assert.equal(canCancel(R('confirmed', future), NOW), true);
});

test('canCancel: not when already cancelled, arrived, no show, or in the past', () => {
  assert.equal(canCancel(R('cancelled', future), NOW), false);
  assert.equal(canCancel(R('arrived', future), NOW), false);
  assert.equal(canCancel(R('no_show', future), NOW), false);
  assert.equal(canCancel(R('pending', past), NOW), false);
  assert.equal(canCancel(R('confirmed', past), NOW), false);
});

test('canCancel: the exact current instant is already past; an unreadable time cannot be cancelled', () => {
  assert.equal(canCancel(R('pending', iso(NOW)), NOW), false);
  assert.equal(canCancel(R('pending', 'not a date'), NOW), false);
  assert.equal(canCancel(R('pending', future), NOW.getTime()), true); // now as milliseconds
});

test('isUpcoming: future and not cancelled', () => {
  assert.equal(isUpcoming(R('pending', future), NOW), true);
  assert.equal(isUpcoming(R('confirmed', future), NOW), true);
  assert.equal(isUpcoming(R('cancelled', future), NOW), false);
  assert.equal(isUpcoming(R('pending', past), NOW), false);
  assert.equal(isUpcoming(R('pending', 'x'), NOW), false);
});

test('statusLabelKey maps every status; unknown never shows a raw code', () => {
  assert.equal(statusLabelKey('pending'), 'status.pending');
  assert.equal(statusLabelKey('confirmed'), 'status.confirmed');
  assert.equal(statusLabelKey('arrived'), 'status.arrived');
  assert.equal(statusLabelKey('no_show'), 'status.noShow');
  assert.equal(statusLabelKey('cancelled'), 'status.cancelled');
  assert.equal(statusLabelKey('whatever'), 'status.unknown');
});

test('statusTone: pending warning, confirmed success, arrived brand, the rest muted', () => {
  assert.equal(statusTone('pending'), 'warning');
  assert.equal(statusTone('confirmed'), 'success');
  assert.equal(statusTone('arrived'), 'brand');
  assert.equal(statusTone('no_show'), 'muted');
  assert.equal(statusTone('cancelled'), 'muted');
  assert.equal(statusTone('x'), 'muted');
});

test('splitReservations: upcoming nearest first, past most recent first, cancelled future goes to past', () => {
  const a = { id: 'a', ...R('pending', iso(new Date(2026, 9, 27, 20, 0, 0))) };
  const b = { id: 'b', ...R('confirmed', iso(new Date(2026, 9, 25, 20, 0, 0))) };
  const c = { id: 'c', ...R('cancelled', iso(new Date(2026, 9, 26, 20, 0, 0))) };
  const d = { id: 'd', ...R('arrived', iso(new Date(2026, 9, 20, 20, 0, 0))) };
  const e = { id: 'e', ...R('no_show', iso(new Date(2026, 9, 22, 20, 0, 0))) };
  const { upcoming, past: previous } = splitReservations([a, c, d, b, e], NOW);
  assert.deepEqual(upcoming.map((r) => r.id), ['b', 'a']);
  assert.deepEqual(previous.map((r) => r.id), ['c', 'e', 'd']);
  assert.deepEqual(splitReservations([], NOW), { upcoming: [], past: [] });
});

test('formatReservationWhen: weekday, day, month and the time as 12 h am / pm', () => {
  const evening = iso(new Date(2026, 9, 25, 19, 0, 0));
  const en = formatReservationWhen(evening, 'en');
  assert.ok(en.endsWith('· 7:00 pm'), en);
  assert.ok(/Sun/.test(en) && /Oct/.test(en) && /25/.test(en), en);
  const es = formatReservationWhen(evening, 'es');
  assert.ok(es.endsWith('· 7:00 pm'), es);
  assert.ok(/oct/i.test(es) && /25/.test(es), es);
  assert.ok(formatReservationWhen(iso(new Date(2026, 9, 25, 0, 5, 0)), 'en').endsWith('· 12:05 am'));
  assert.ok(formatReservationWhen(iso(new Date(2026, 9, 25, 12, 0, 0)), 'en').endsWith('· 12:00 pm'));
  assert.equal(formatReservationWhen('nope', 'en'), '');
});

// ── M3: rejected ──
const { isRejectReasonKey, REJECT_REASON_KEYS } = await import(pathToFileURL(join(dir, 'reservationStatus.mjs')).href);

test('rejected: its own label and a danger tone; it is never upcoming nor cancellable', () => {
  assert.equal(statusLabelKey('rejected'), 'status.rejected');
  assert.equal(statusTone('rejected'), 'danger');
  assert.equal(isUpcoming(R('rejected', future), NOW), false);
  assert.equal(canCancel(R('rejected', future), NOW), false);
  const { upcoming, past } = splitReservations([R('rejected', future), R('pending', future)], NOW);
  assert.equal(upcoming.length, 1);
  assert.equal(past.length, 1);
});

test('reject reasons: the three keys of the venue, nothing else', () => {
  assert.deepEqual([...REJECT_REASON_KEYS], ['no_availability', 'closed_that_day', 'group_too_large']);
  assert.equal(isRejectReasonKey('group_too_large'), true);
  assert.equal(isRejectReasonKey('other'), false);
  assert.equal(isRejectReasonKey(undefined), false);
});

// ── Lote 2 (migration 277): expired = "No response from the venue" ──────────────────────────────────────────────────────────────
test('expired: its own label key, muted tone, never upcoming, never cancellable', () => {
  assert.equal(statusLabelKey('expired'), 'status.expired');
  assert.equal(statusTone('expired'), 'muted');
  assert.equal(isUpcoming(R('expired', future), NOW), false);
  assert.equal(canCancel(R('expired', future), NOW), false);
  const { upcoming, past: pastList } = splitReservations([R('expired', future), R('expired', past), R('pending', future)], NOW);
  assert.equal(upcoming.length, 1);
  assert.equal(pastList.length, 2);
});

test('H-030: a pending reservation whose time passed shows as expired before the cron marks it; a future or non-pending one keeps its status', () => {
  assert.equal(effectiveStatus(R('pending', past), NOW), 'expired');
  assert.equal(effectiveStatus(R('pending', future), NOW), 'pending');
  assert.equal(effectiveStatus(R('confirmed', past), NOW), 'confirmed');
  assert.equal(effectiveStatus(R('cancelled', past), NOW), 'cancelled');
  assert.equal(effectiveStatus(R('expired', past), NOW), 'expired');
  assert.equal(effectiveStatus(R('pending', 'not a date'), NOW), 'pending');
  // exactly now counts as passed
  assert.equal(effectiveStatus(R('pending', iso(NOW)), NOW), 'expired');
  assert.equal(statusLabelKey(effectiveStatus(R('pending', past), NOW)), 'status.expired');
});

test('the expired chip text exists in es and en', () => {
  const lang = (l) => JSON.parse(readFileSync(new URL(`../i18n/locales/${l}/reservations.json`, import.meta.url), 'utf8')).status.expired;
  assert.equal(lang('es'), 'Sin respuesta del local');
  assert.equal(lang('en'), 'No response from the venue');
});

test('the screen shows the effective status and keeps the cancel decision on the real status', () => {
  const screen = readFileSync(new URL('../screens/reservations/MyReservationsScreen.tsx', import.meta.url), 'utf8');
  assert.match(screen, /const shownStatus = effectiveStatus\(item, new Date\(\)\)/);
  assert.match(screen, /statusLabelKey\(shownStatus\)/);
  assert.match(screen, /canCancel\(item, new Date\(\)\)/);
});
