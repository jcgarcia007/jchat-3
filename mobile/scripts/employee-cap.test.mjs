// M2 (spec 5): the employee cap follows the OWNER's plan — 10 Business / 50 Pro, like the database trigger enforce_employee_plan_limit (D-42) and the web.
// Run from mobile/:  node --test scripts/employee-cap.test.mjs
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
const dir = mkdtempSync(join(tmpdir(), 'employee-cap-'));
function compile(rel, out, rewrites = []) {
  let src = read(rel);
  for (const [from, to] of rewrites) src = src.replace(from, to);
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
  writeFileSync(join(dir, out), js);
}
// A stand-in for './supabase' (the real one pulls in React Native): the tests plug a fake backend into it.
writeFileSync(join(dir, 'supabaseStub.mjs'), `export let supabase = null;\nexport const isSupabaseConfigured = true;\nexport function __set(backend) { supabase = backend; }\n`);
compile('utils/planLimits.ts', 'planLimits.mjs');
compile('services/employees.ts', 'employees.mjs', [
  [/from '\.\/supabase'/, "from './supabaseStub.mjs'"],
  [/from '\.\.\/utils\/planLimits'/, "from './planLimits.mjs'"],
]);
const imp = (f) => import(pathToFileURL(join(dir, f)).href);
const limits = await imp('planLimits.mjs');
const stub = await imp('supabaseStub.mjs');
const svc = await imp('employees.mjs');

// ── 1. the helper ──────────────────────────────────────────────────────────────────────────────────────────────────────

test('employeeLimitFor: 10 for business, 50 for pro, 10 for anything else', () => {
  assert.equal(limits.employeeLimitFor('business'), 10);
  assert.equal(limits.employeeLimitFor('pro'), 50);
  for (const other of ['regular', 'verified', '', 'PRO', 'enterprise', null, undefined]) assert.equal(limits.employeeLimitFor(other), 10, String(other));
  assert.deepEqual(limits.EMPLOYEE_LIMITS, { business: 10, pro: 50 });
});

test('the helper names the trigger as the authority (so nobody changes one number only)', () => {
  const src = read('utils/planLimits.ts');
  assert.match(src, /enforce_employee_plan_limit/);
  assert.match(src, /web\/lib\/planLimits\.ts/);
});

// ── 2. addEmployee against a fake backend ─────────────────────────────────────────────────────────────────────────────────

/** `count` = employee rows of the venue; `plan` = the signed-in owner's users.plan; planError = the plan could not be read. */
function backend({ plan = 'business', count = 0, planError = false, noUser = false, insertError = null } = {}) {
  const log = { counts: 0, inserts: [], planReads: 0 };
  const from = (table) => {
    const q = { table, insert: null };
    const api = {
      select: () => api,
      eq: () => api,
      in: () => api,
      insert: (row) => { q.insert = row; log.inserts.push(row); return api; },
      maybeSingle: async () => {
        log.planReads += 1;
        return planError ? { data: null, error: { message: 'boom' } } : { data: { plan }, error: null };
      },
      single: async () => (insertError ? { data: null, error: insertError } : { data: { id: 'emp-1', ...q.insert }, error: null }),
      then: (resolve) => { log.counts += 1; resolve({ count, error: null }); },
    };
    return api;
  };
  return { log, client: { from, auth: { getUser: async () => ({ data: { user: noUser ? null : { id: 'owner-1' } } }) } } };
}
const run = async (opts) => {
  const b = backend(opts);
  stub.__set(b.client);
  return { result: await svc.addEmployee('biz-1', 'user-9', 'Waiter'), log: b.log };
};

test('Business owner: the 10th employee is added, the 11th is refused with limit 10', async () => {
  const ok = await run({ plan: 'business', count: 9 });
  assert.equal(ok.result.ok, true);
  assert.equal(ok.log.inserts.length, 1);
  assert.equal(ok.log.inserts[0].status, 'accepted');
  const full = await run({ plan: 'business', count: 10 });
  assert.deepEqual(full.result, { ok: false, reason: 'plan_limit', limit: 10 });
  assert.equal(full.log.inserts.length, 0, 'nothing is inserted over the limit');
});

test('Pro owner: 10 employees do not block anything; the 51st is refused with limit 50', async () => {
  assert.equal((await run({ plan: 'pro', count: 10 })).result.ok, true);
  assert.equal((await run({ plan: 'pro', count: 49 })).result.ok, true);
  const full = await run({ plan: 'pro', count: 50 });
  assert.deepEqual(full.result, { ok: false, reason: 'plan_limit', limit: 50 });
  assert.equal(full.log.inserts.length, 0);
});

test('any other plan uses 10', async () => {
  assert.deepEqual((await run({ plan: 'regular', count: 10 })).result, { ok: false, reason: 'plan_limit', limit: 10 });
  assert.equal((await run({ plan: 'regular', count: 9 })).result.ok, true);
  assert.deepEqual((await run({ plan: null, count: 10 })).result, { ok: false, reason: 'plan_limit', limit: 10 });
});

test('if the plan cannot be read, the app does not guess a cap: it skips its pre-check and lets the trigger decide', async () => {
  for (const opts of [{ planError: true, count: 30 }, { noUser: true, count: 30 }]) {
    const r = await run(opts);
    assert.equal(r.result.ok, true);
    assert.equal(r.log.counts, 0, 'no count was needed');
    assert.equal(r.log.inserts.length, 1);
  }
});

test('the trigger refusing the insert (check_violation) is also a plan_limit with the owner plan limit', async () => {
  const pro = await run({ plan: 'pro', count: 3, insertError: { code: '23514', message: 'Employee limit reached for this plan (50 of 50 used)' } });
  assert.deepEqual(pro.result, { ok: false, reason: 'plan_limit', limit: 50 });
  const biz = await run({ plan: 'business', count: 3, insertError: { code: '23514', message: 'Employee limit reached' } });
  assert.deepEqual(biz.result, { ok: false, reason: 'plan_limit', limit: 10 });
});

test('other insert errors keep their reasons', async () => {
  assert.equal((await run({ insertError: { code: '23505', message: 'dup' } })).result.reason, 'already_exists');
  assert.equal((await run({ insertError: { code: '42501', message: 'rls' } })).result.reason, 'db_error');
});

// ── 3. no trace of the old fixed cap or of "unlimited" ────────────────────────────────────────────────────────────────────

test('the service has no fixed cap and never says Pro is unlimited', () => {
  const src = read('services/employees.ts');
  assert.ok(!/DEFAULT_PLAN_CAP/.test(src));
  assert.ok(!/unlimited|ilimitad/i.test(src));
  assert.match(src, /employeeLimitFor\(/);
  assert.match(src, /utils\/planLimits/);
});

test('the count is every row of the venue, like the trigger (no status filter)', () => {
  const src = read('services/employees.ts');
  const body = src.slice(src.indexOf('export async function countEmployees('), src.indexOf('async function readOwnPlan'));
  assert.ok(!/\.in\('status'/.test(body));
});

// ── 4. the message names the limit, in both languages ─────────────────────────────────────────────────────────────────────

test('the sheet passes the limit and both texts show it (10 / 50) without "unlimited"', () => {
  assert.match(read('components/chat/AddEmployeeSheet.tsx'), /t\('employee\.errorPlanLimit', \{ limit: result\.limit \}\)/);
  const t = (lang) => JSON.parse(read(`i18n/locales/${lang}/chat.json`)).employee.errorPlanLimit;
  for (const lang of ['es', 'en']) {
    assert.match(t(lang), /\{\{limit\}\}/, lang);
    assert.ok(!/unlimited|ilimitad|10\b|50\b/i.test(t(lang)), `${lang}: no fixed number or "unlimited" in the text`);
  }
  assert.equal(t('es'), 'Has alcanzado el máximo de empleados de tu plan ({{limit}} por local).');
  assert.equal(t('en'), 'You have reached the employee limit of your plan ({{limit}} per venue).');
});

test('es and en chat.json keep the same keys', () => {
  const keys = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v, `${p}${k}.`) : [`${p}${k}`]));
  const es = keys(JSON.parse(read('i18n/locales/es/chat.json'))).sort();
  const en = keys(JSON.parse(read('i18n/locales/en/chat.json'))).sort();
  assert.deepEqual(es, en);
});
