// Unit tests for lib/reservationStatus.ts (confirm / reject rules of the dashboard) and its messages. Run from web/:
//   node --test scripts/reservation-status.test.mjs

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const dir = mkdtempSync(join(tmpdir(), 'reservation-status-'));
const out = join(dir, 'reservationStatus.mjs');
writeFileSync(out, ts.transpileModule(readFileSync(new URL('../lib/reservationStatus.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText);
const { RESERVATION_STATUSES, REJECT_REASONS, isRejectReason, canConfirm, canReject, isLive, matchesFilter, countPending } = await import(pathToFileURL(out).href);

const messages = (lang) => JSON.parse(readFileSync(new URL(`../messages/${lang}.json`, import.meta.url), 'utf8')).dashboardCommon;

test('only a pending request can be confirmed; a pending or confirmed one can be rejected', () => {
  assert.deepEqual(RESERVATION_STATUSES.filter(canConfirm), ['pending']);
  assert.deepEqual(RESERVATION_STATUSES.filter(canReject), ['pending', 'confirmed']);
  assert.deepEqual(RESERVATION_STATUSES.filter(isLive), ['pending', 'confirmed']);
});

test('reject reasons: the three chips of the spec and nothing else', () => {
  assert.deepEqual([...REJECT_REASONS], ['no_availability', 'closed_that_day', 'group_too_large']);
  assert.equal(isRejectReason('no_availability'), true);
  assert.equal(isRejectReason('because'), false);
  assert.equal(isRejectReason(null), false);
});

test('filter: all matches everything, a status only itself', () => {
  for (const s of RESERVATION_STATUSES) assert.equal(matchesFilter(s, 'all'), true);
  assert.equal(matchesFilter('pending', 'pending'), true);
  assert.equal(matchesFilter('confirmed', 'pending'), false);
  assert.equal(matchesFilter('rejected', 'rejected'), true);
});

test('countPending counts only pending (also the waitlisted ones: they need an answer too)', () => {
  const list = [{ status: 'pending' }, { status: 'pending', is_waitlist: true }, { status: 'confirmed' }, { status: 'cancelled' }, { status: 'rejected' }, { status: 'arrived' }];
  assert.equal(countPending(list), 2);
  assert.equal(countPending([]), 0);
});

test('messages: every new key exists in en and es, es differs from en (it is translated)', () => {
  const keys = ['resStatusConfirmed', 'resStatusRejected', 'resConfirmButton', 'resRejectButton', 'resRejectTitle', 'resRejectHint', 'resRejectSubmit', 'resRejectBack',
    'resConfirmDone', 'resRejectDone', 'reservationsFilterPending', 'resRejectedReason', ...REJECT_REASONS.map((r) => `resReject_${r}`)];
  const en = messages('en');
  const es = messages('es');
  for (const k of keys) {
    assert.equal(typeof en[k], 'string', `en.${k}`);
    assert.equal(typeof es[k], 'string', `es.${k}`);
    assert.notEqual(en[k], es[k], `${k} is translated`);
  }
  assert.match(en.reservationsFilterPending, /\{count\}/);
  assert.match(es.reservationsFilterPending, /\{count\}/);
});

// ── Lote 2 (migration 277): expired ─────────────────────────────────────────────────────────────────────────────────────────
const { effectiveStatus } = await import(pathToFileURL(out).href);
const NOW_MS = Date.parse('2026-11-26T18:00:00Z');
const PAST = '2026-11-26T12:00:00Z';
const FUTURE = '2026-11-27T01:00:00Z';

test('expired is a known status, and nothing can be done to it (no confirm, reject, check-in; not live)', () => {
  assert.ok(RESERVATION_STATUSES.includes('expired'));
  assert.equal(canConfirm('expired'), false);
  assert.equal(canReject('expired'), false);
  assert.equal(isLive('expired'), false);
  assert.equal(matchesFilter('expired', 'expired'), true);
  assert.equal(matchesFilter('expired', 'pending'), false);
});

test('H-030 / H-059: a pending request whose time passed reads as expired before the cron marks it; the rest keep their status', () => {
  assert.equal(effectiveStatus('pending', PAST, NOW_MS), 'expired');
  assert.equal(effectiveStatus('pending', FUTURE, NOW_MS), 'pending');
  assert.equal(effectiveStatus('pending', new Date(NOW_MS).toISOString(), NOW_MS), 'expired');
  assert.equal(effectiveStatus('confirmed', PAST, NOW_MS), 'confirmed');
  assert.equal(effectiveStatus('cancelled', PAST, NOW_MS), 'cancelled');
  assert.equal(effectiveStatus('pending', null, NOW_MS), 'pending');
  assert.equal(effectiveStatus('pending', 'nope', NOW_MS), 'pending');
  assert.equal(canConfirm(effectiveStatus('pending', PAST, NOW_MS)), false);
  assert.equal(isLive(effectiveStatus('pending', PAST, NOW_MS)), false);
});

test('the number of waiting requests (menu counter) leaves out the ones whose time passed', () => {
  const list = [
    { status: 'pending', reserved_at: FUTURE },
    { status: 'pending', reserved_at: PAST },
    { status: 'pending', reserved_at: PAST, is_waitlist: true },
    { status: 'confirmed', reserved_at: FUTURE },
  ];
  assert.equal(countPending(list, NOW_MS), 1);
});

test('the dashboard offers the filter and the label for expired, in es and en; the menu hook only counts future pending ones', () => {
  for (const lang of ['es', 'en']) assert.ok(messages(lang).resStatusExpired, lang);
  assert.equal(messages('es').resStatusExpired, 'Sin respuesta');
  assert.equal(messages('en').resStatusExpired, 'No response');
  const page = readFileSync(new URL('../app/dashboard/reservations/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /const status = effectiveStatus\(r\.status, r\.reserved_at\)/);
  assert.match(page, /key: "expired", label: t\("resStatusExpired"\)/);
  const hook = readFileSync(new URL('../components/dashboard/useReservationsPending.ts', import.meta.url), 'utf8');
  assert.match(hook, /\.eq\("status", "pending"\)\s*\.gte\("reserved_at"/);
});
