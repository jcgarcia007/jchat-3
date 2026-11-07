// D4: the pure logic behind the owner's "delete account" screens, the notification plumbing and the wiring of SettingsScreen.
// Run from mobile/:  node --test scripts/owner-delete.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const json = (lang, ns) => JSON.parse(read(`i18n/locales/${lang}/${ns}.json`));

function loadCjs(rel) {
  const out = ts.transpileModule(read(rel), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const m = { exports: {} };
  new Function('module', 'exports', 'require', out)(m, m.exports, (spec) => loadCjs(`utils/${spec.replace('./', '')}.ts`));
  return m.exports;
}
const od = loadCjs('utils/ownerDelete.ts');
const outcome = loadCjs('utils/deleteAccountOutcome.ts');
const when = loadCjs('utils/reservationWhen.ts');

const biz = { id: 'b1', name: 'Bar XZX', city: 'Miami' };

test('dry run: not an owner → generic flow; owner → the venues for screen A', () => {
  assert.deepEqual(od.ownerCheckFromResponse(200, true, { owner: false }), { kind: 'not_owner' });
  assert.deepEqual(od.ownerCheckFromResponse(200, true, { owner: true, businesses: [biz] }), { kind: 'owner', businesses: [biz] });
});

test('dry run: an owner with no readable venue list is an error, never "not an owner"', () => {
  assert.equal(od.ownerCheckFromResponse(200, true, { owner: true, businesses: [] }).kind, 'error');
  assert.equal(od.ownerCheckFromResponse(200, true, { owner: true, businesses: [{ nope: 1 }] }).kind, 'error');
  assert.equal(od.ownerCheckFromResponse(200, true, {}).kind, 'error');
});

test('dry run: an older function (405) → unsupported (generic flow, nothing deleted)', () => {
  assert.deepEqual(od.ownerCheckFromResponse(405, false, { error: 'method_not_allowed' }), { kind: 'unsupported' });
});

test('dry run: 409 owner_open_orders → the open list; stripe_balance_pending → the amounts', () => {
  const open = od.ownerCheckFromResponse(409, false, { code: 'owner_open_orders', open: [{ business_id: 'b1', business_name: 'Bar XZX', kind: 'orders', n: 3 }, { business_id: 'b1', business_name: 'Bar XZX', kind: 'tabs', n: '1' }] });
  assert.deepEqual(open, { kind: 'open_orders', open: [{ businessId: 'b1', businessName: 'Bar XZX', kind: 'orders', n: 3 }, { businessId: 'b1', businessName: 'Bar XZX', kind: 'tabs', n: 1 }] });
  const bal = od.ownerCheckFromResponse(409, false, { code: 'stripe_balance_pending', balances: [{ business_id: 'b1', business_name: 'Bar XZX', currency: 'USD', amount: 4250 }] });
  assert.deepEqual(bal, { kind: 'balance', balances: [{ businessId: 'b1', businessName: 'Bar XZX', currency: 'usd', amount: 4250 }] });
});

test('responses are sanitised: junk rows are dropped, codes are short snake_case only', () => {
  assert.deepEqual(od.parseBalances([{ business_id: 'b1', currency: 'usd', amount: -5 }, { business_id: 'b1', currency: 'dollars', amount: 5 }, null, 'x']), []);
  assert.deepEqual(od.parseOpenItems([{ business_id: 'b1', kind: 'drop table', n: 1 }, { business_id: 'b1', kind: 'orders', n: 0 }]), []);
  assert.deepEqual(od.ownerCheckFromResponse(502, false, { code: 'stripe_balance_check_failed' }), { kind: 'error', code: 'stripe_balance_check_failed' });
  assert.deepEqual(od.ownerCheckFromResponse(500, false, '<html>boom</html>'), { kind: 'error', code: 'http_500' });
  assert.equal(od.sanitizeOwnerCode('Some sentence with spaces'), 'unknown');
});

test('screen A lists at most 5 venues then "and N more"; screen B sums per currency', () => {
  const many = Array.from({ length: 8 }, (_, i) => ({ id: `b${i}`, name: `V${i}`, city: null }));
  const l = od.listForScreen(many);
  assert.equal(l.shown.length, 5);
  assert.equal(l.more, 3);
  assert.deepEqual(od.listForScreen([biz]), { shown: [biz], more: 0 });
  assert.deepEqual(od.totalsByCurrency([
    { businessId: 'a', businessName: 'A', currency: 'usd', amount: 3000 },
    { businessId: 'b', businessName: 'B', currency: 'usd', amount: 1250 },
    { businessId: 'b', businessName: 'B', currency: 'eur', amount: 100 },
  ]), [{ currency: 'usd', amount: 4250 }, { currency: 'eur', amount: 100 }]);
});

test('money: "$42.50" in English, never throws for an unknown currency', () => {
  assert.equal(od.formatMoney(4250, 'usd', 'en'), '$42.50');
  assert.match(od.formatMoney(4250, 'usd', 'es'), /42[.,]50/);
  assert.equal(od.formatMoney(100, 'zz', 'en').includes('1.00'), true);
});

test('screen G picks the text by code', () => {
  assert.equal(od.ownerErrorKind('subscription_cancel_failed'), 'subscription');
  assert.equal(od.ownerErrorKind('stripe_balance_check_failed'), 'balanceCheck');
  assert.equal(od.ownerErrorKind('owner_close_failed'), 'generic');
  assert.equal(od.ownerErrorKind('network'), 'generic');
});

test('the real delete: 409 blockers become "blocked" (nothing was closed), the legacy owner code stays, the rest are errors with a code', () => {
  const blocked = outcome.deleteOutcomeFromResponse(409, false, { code: 'stripe_balance_pending', balances: [{ business_id: 'b1', business_name: 'B', currency: 'usd', amount: 100 }] });
  assert.equal(blocked.result, 'blocked');
  assert.equal(blocked.blocker.kind, 'balance');
  assert.equal(outcome.deleteOutcomeFromResponse(409, false, { code: 'owner_open_orders', open: [] }).blocker.kind, 'open_orders');
  assert.equal(outcome.deleteOutcomeFromResponse(409, false, { code: 'owner_has_business' }).result, 'owns_business');
  assert.deepEqual(outcome.deleteOutcomeFromResponse(500, false, { code: 'owner_close_failed' }), { result: 'error', code: 'owner_close_failed' });
  assert.deepEqual(outcome.deleteOutcomeFromResponse(502, false, { code: 'subscription_cancel_failed' }), { result: 'error', code: 'subscription_cancel_failed' });
});

test('reservation date/time in the venue zone, with a safe fallback', () => {
  const r = when.formatReservationWhen('2026-11-20T23:30:00Z', 'America/New_York', 'en');
  assert.match(r.date, /November 20, 2026/);
  assert.match(r.time.replace(/\s/g, ' '), /6:30 PM/);
  assert.ok(when.formatReservationWhen('2026-11-20T23:30:00Z', 'Not/AZone', 'es'));
  assert.equal(when.formatReservationWhen('garbage', null, 'es'), null);
  assert.equal(when.formatReservationWhen(undefined, null, 'es'), null);
});

test('i18n: every ownerDelete key exists in es and en, plurals included, same placeholders', () => {
  const es = json('es', 'settings').ownerDelete;
  const en = json('en', 'settings').ownerDelete;
  assert.deepEqual(Object.keys(es).sort(), Object.keys(en).sort());
  for (const k of Object.keys(es)) {
    const ph = (s) => (s.match(/\{\{\w+\}\}/g) ?? []).sort().join(',');
    assert.equal(ph(es[k]), ph(en[k]), `placeholders of ${k}`);
    assert.ok(es[k].trim() && en[k].trim(), k);
  }
  for (const lang of ['es', 'en']) {
    const m = json(lang, 'social').messages.notif;
    for (const k of ['businessClosed', 'reservationCancelled', 'reservationCancelledNoDate']) assert.ok(m[k], `${lang} ${k}`);
  }
});

test('notifications: both new types are known, listed, shown as banners and have an icon', () => {
  const svc = read('services/notifications.ts');
  assert.match(svc, /\| 'business_closed'/);
  assert.match(svc, /\| 'reservation_cancelled'/);
  assert.match(svc, /\.\.\.VENUE_CLOSED_NOTIFICATION_TYPES/);
  assert.match(read('hooks/useNotificationPresenter.ts'), /business_closed: IconBuildingStore/);
  assert.match(read('hooks/useNotifications.ts'), /'business_closed',\s*\n\s*'reservation_cancelled'/);
});

test('SettingsScreen: asks first (GET dry run), owner delete sends confirmOwnerClose only after A and C, blockers open the sheet', () => {
  const s = read('screens/settings/SettingsScreen.tsx');
  assert.match(s, /checkOwnerDeletion\(\)/);
  assert.match(s, /deleteMyAccountWithCode\(\{ confirmOwnerClose: owner \}\)/);
  assert.match(s, /continueOwnerDelete/);
  assert.match(s, /result === 'blocked' && blocker/);
  const a = read('services/account.ts');
  assert.match(a, /method: 'GET'/);
  assert.match(a, /confirmOwnerClose: true/);
});

test('the owner sheet: Cancel is the primary button, the destructive one is disabled until the box is ticked, everything accessible', () => {
  const m = read('components/settings/OwnerDeleteModal.tsx');
  assert.match(m, /tone="primary"[^\n]*owner-delete-cancel|owner-delete-cancel[^\n]*tone="primary"|label=\{t\('ownerDelete\.cancel'\)\}[^\n]*tone="primary"/);
  assert.match(m, /disabled=\{!checked\}/);
  assert.match(m, /accessibilityRole="checkbox"/);
  assert.match(m, /accessibilityState=\{\{ checked \}\}/);
  assert.doesNotMatch(m, /#[0-9a-fA-F]{3,8}\b/, 'no hard-coded colours');
  assert.doesNotMatch(m, /fontSize|lineHeight/, 'type comes from the roles');
  assert.doesNotMatch(m, /allowFontScaling=\{false\}/);
});
