// JChat 3.0 — payment-domains-sync (supabase/functions/payment-domains-sync + _shared/paymentDomains.ts).
// The shared module is run for real with a FAKE Stripe (no network, nothing is ever called); the Edge Function file is checked statically.
// Run: node --test scripts/payment-domains-sync.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const dir = mkdtempSync(join(tmpdir(), 'pmd-'));
writeFileSync(join(dir, 'paymentDomains.mjs'), ts.transpileModule(read('supabase/functions/_shared/paymentDomains.ts'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText);
const m = await import(pathToFileURL(join(dir, 'paymentDomains.mjs')).href);
const index = read('supabase/functions/payment-domains-sync/index.ts');

const venue = (over = {}) => ({ id: '00000000-0000-4000-8000-000000000001', slug: 'bar-x', subdomain: null, stripe_account_id: 'acct_TEST', ...over });
const active = { status: 'active' };
const inactive = { status: 'inactive' };

/** A fake Stripe that remembers what it was asked, per account ('platform' or the Stripe-Account header). */
function fakeStripe(initial = {}) {
  const store = new Map(Object.entries(initial)); // key `${account}|${domain}` → pmd
  const calls = [];
  let n = 0;
  const acct = (opts) => opts?.stripeAccount ?? 'platform';
  const api = {
    async list(params, opts) {
      calls.push({ op: 'list', account: acct(opts), domain: params.domain_name });
      const found = store.get(`${acct(opts)}|${params.domain_name}`);
      return { data: found ? [found] : [] };
    },
    async create(params, opts) {
      calls.push({ op: 'create', account: acct(opts), domain: params.domain_name });
      const pmd = { id: `pmd_${++n}`, domain_name: params.domain_name, enabled: true, apple_pay: active, google_pay: active };
      store.set(`${acct(opts)}|${params.domain_name}`, pmd);
      return pmd;
    },
    async validate(id, opts) {
      calls.push({ op: 'validate', account: acct(opts), id });
      for (const [k, v] of store) if (v.id === id && k.startsWith(`${acct(opts)}|`)) { const ok = { ...v, apple_pay: active, google_pay: active }; store.set(k, ok); return ok; }
      throw new Error('no such domain');
    },
  };
  return { api, calls, store };
}

test('host: <subdomain || slug>.jchat.cloud, lower-cased; invalid labels give null', () => {
  assert.equal(m.hostForVenue({ slug: 'bar-x', subdomain: null }), 'bar-x.jchat.cloud');
  assert.equal(m.hostForVenue({ slug: 'bar-x', subdomain: 'XZX-omd2' }), 'xzx-omd2.jchat.cloud');
  assert.equal(m.hostForVenue({ slug: '  Bar-X ', subdomain: '' }), 'bar-x.jchat.cloud');
  for (const bad of [{ slug: null, subdomain: null }, { slug: '', subdomain: '' }, { slug: 'a b', subdomain: null }, { slug: 'a.b', subdomain: null }, { slug: '-x', subdomain: null }, { slug: 'x/../y', subdomain: null }]) {
    assert.equal(m.hostForVenue(bad), null, JSON.stringify(bad));
  }
});

test('scope: defaults to platform; connected / both only when asked; anything else is rejected', () => {
  assert.equal(m.DEFAULT_SCOPE, 'platform');
  assert.equal(m.parseScope(undefined), 'platform');
  assert.equal(m.parseScope(null), 'platform');
  assert.equal(m.parseScope('both'), 'both');
  assert.equal(m.parseScope('connected'), 'connected');
  for (const bad of ['', 'all', 'PLATFORM', 1, {}]) assert.equal(m.parseScope(bad), null);
});

test('access: only the database secret or the project secret key; empty headers never match an unset value', () => {
  const h = (o) => ({ get: (k) => o[k.toLowerCase()] ?? null });
  const env = { pushSecret: 'push-123', secretKey: 'sb_secret_abcdef' };
  assert.equal(m.isAuthorized(h({ 'x-push-secret': 'push-123' }), env), true);
  assert.equal(m.isAuthorized(h({ authorization: 'Bearer sb_secret_abcdef' }), env), true);
  assert.equal(m.isAuthorized(h({}), env), false);
  assert.equal(m.isAuthorized(h({ 'x-push-secret': 'nope' }), env), false);
  assert.equal(m.isAuthorized(h({ authorization: 'Bearer sb_secret_other' }), env), false);
  assert.equal(m.isAuthorized(h({ authorization: 'Bearer ' }), env), false);
  // a missing configuration must not let an empty header in
  assert.equal(m.isAuthorized(h({}), { pushSecret: '', secretKey: '' }), false);
  assert.equal(m.isAuthorized(h({ 'x-push-secret': '' }), { pushSecret: '', secretKey: '' }), false);
  assert.equal(m.isAuthorized(h({ 'x-push-secret': 'push-123' }), { pushSecret: undefined, secretKey: undefined }), false);
});

test('a venue that is not registered gets registered on the PLATFORM only (default scope), with no Stripe-Account', async () => {
  const s = fakeStripe();
  const out = await m.syncVenues(s.api, [venue()], 'platform');
  assert.equal(out[0].host, 'bar-x.jchat.cloud');
  assert.equal(out[0].platform.result, 'registered');
  assert.equal(out[0].connected, undefined);
  assert.deepEqual(s.calls.map((c) => `${c.op}:${c.account}`), ['list:platform', 'create:platform']);
});

test('idempotent: a second run lists, finds it active and creates nothing', async () => {
  const s = fakeStripe();
  await m.syncVenues(s.api, [venue()], 'platform');
  s.calls.length = 0;
  const out = await m.syncVenues(s.api, [venue()], 'platform');
  assert.equal(out[0].platform.result, 'already_registered');
  assert.deepEqual(s.calls.map((c) => c.op), ['list'], 'only a list, no create and no validate');
});

test('a domain whose Apple Pay / Google Pay is inactive is validated, not registered again', async () => {
  const s = fakeStripe({ 'platform|bar-x.jchat.cloud': { id: 'pmd_9', domain_name: 'bar-x.jchat.cloud', enabled: true, apple_pay: inactive, google_pay: active } });
  const out = await m.syncVenues(s.api, [venue()], 'platform');
  assert.equal(out[0].platform.result, 'validated');
  assert.equal(out[0].platform.apple_pay, 'active');
  assert.deepEqual(s.calls.map((c) => c.op), ['list', 'validate']);
  assert.equal(s.calls.at(-1).id, 'pmd_9');
});

test('a domain someone disabled on purpose stays disabled (reported, not touched)', async () => {
  const s = fakeStripe({ 'platform|bar-x.jchat.cloud': { id: 'pmd_8', domain_name: 'bar-x.jchat.cloud', enabled: false, apple_pay: inactive, google_pay: inactive } });
  const out = await m.syncVenues(s.api, [venue()], 'platform');
  assert.equal(out[0].platform.result, 'disabled');
  assert.deepEqual(s.calls.map((c) => c.op), ['list']);
});

test('the report carries Stripe\'s own apple_pay / google_pay status (enabled is not the same as an active wallet)', async () => {
  const s = fakeStripe({ 'platform|bar-x.jchat.cloud': { id: 'pmd_7', domain_name: 'bar-x.jchat.cloud', enabled: true, apple_pay: active, google_pay: active } });
  const out = await m.syncVenues(s.api, [venue()], 'platform');
  assert.deepEqual(out[0].platform, { result: 'already_registered', id: 'pmd_7', enabled: true, apple_pay: 'active', google_pay: 'active' });
});

test('scope both: the connected account is called WITH its Stripe-Account, the platform without; connected alone skips the platform', async () => {
  const both = fakeStripe();
  const out = await m.syncVenues(both.api, [venue()], 'both');
  assert.equal(out[0].platform.result, 'registered');
  assert.equal(out[0].connected.result, 'registered');
  assert.deepEqual(both.calls.map((c) => `${c.op}:${c.account}`), ['list:platform', 'create:platform', 'list:acct_TEST', 'create:acct_TEST']);
  const only = fakeStripe();
  const o2 = await m.syncVenues(only.api, [venue()], 'connected');
  assert.equal(o2[0].platform, undefined);
  assert.ok(only.calls.every((c) => c.account === 'acct_TEST'));
});

test('one failing venue does not stop the others, and the error is redacted (no key survives)', async () => {
  const s = fakeStripe();
  const real = s.api.list;
  s.api.list = async (p, o) => { if (p.domain_name.startsWith('boom')) throw new Error('Invalid API Key provided: sk_test_51ABCdefGHIjkl and rk_live_abcdef123456'); return real(p, o); };
  const out = await m.syncVenues(s.api, [venue({ id: 'a', slug: 'boom' }), venue({ id: 'b', slug: 'fine' })], 'platform');
  assert.equal(out[0].platform.result, 'error');
  assert.doesNotMatch(out[0].platform.error, /sk_test_|rk_live_|51ABC/);
  assert.match(out[0].platform.error, /\[redacted\]/);
  assert.equal(out[1].platform.result, 'registered');
});

test('a venue with no valid host is reported, not sent to Stripe', async () => {
  const s = fakeStripe();
  const out = await m.syncVenues(s.api, [venue({ slug: null, subdomain: null })], 'platform');
  assert.equal(out[0].host, null);
  assert.deepEqual(out[0].platform, { result: 'error', error: 'invalid_host' });
  assert.equal(s.calls.length, 0);
});

test('paging: at most 50 per call and `next` is the last id handled; the last page has next null', () => {
  const rows = Array.from({ length: 51 }, (_, i) => venue({ id: `id-${String(i).padStart(3, '0')}` }));
  const page = m.pageOf(rows);
  assert.equal(page.venues.length, 50);
  assert.equal(page.next, 'id-049');
  assert.equal(m.pageOf(rows.slice(0, 50)).next, null);
  assert.equal(m.pageOf([]).next, null);
  assert.equal(m.MAX_VENUES_PER_CALL, 50);
});

test('Edge Function: POST only, 401 before anything else, no public access', () => {
  assert.match(index, /req\.method !== "POST"\) return json\(\{ error: "Method not allowed" \}, 405\)/);
  const iAuth = index.indexOf('isAuthorized(req.headers');
  assert.ok(iAuth > 0 && iAuth < index.indexOf('req.text()') && iAuth < index.indexOf('createAdminClient()'), 'auth runs before the body is read or the database touched');
  assert.match(index, /return json\(\{ error: "Unauthorized" \}, 401\)/);
  assert.match(read('supabase/config.toml'), /\[functions\.payment-domains-sync\]\nverify_jwt = false/);
});

test('Edge Function: only verified venues with a Stripe account; business_id and after are validated as uuids; scope is validated', () => {
  assert.match(index, /\.eq\("status", "verified"\)/);
  assert.match(index, /\.not\("stripe_account_id", "is", null\)/);
  assert.match(index, /isUuid\(body\.business_id\)/);
  assert.match(index, /isUuid\(body\.after\)/);
  assert.match(index, /const scope = parseScope\(body\.scope\);\n\s+if \(!scope\) return json\(\{ error: "scope must be platform, connected or both" \}, 400\)/);
});

test('Edge Function: Stripe-Account is never set by hand there (only through the shared module), and keys never reach logs or answers', () => {
  assert.doesNotMatch(index.replace(/\/\*[\s\S]*?\*\//, ''), /Stripe-Account|stripeAccount/);
  const logs = [...index.matchAll(/console\.(log|error|info|warn)\([^;]*;/g)].map((x) => x[0]);
  assert.ok(logs.length >= 2);
  for (const l of logs) assert.doesNotMatch(l, /STRIPE_SECRET_KEY|SB_SECRET_KEY|PUSH_WEBHOOK_SECRET|stripe_account_id|\bkey\b/i, l);
  assert.match(index, /redact\(\(err as/);
});

test('shared module: no key is read, built or logged; the only Stripe-Account is the optional stripeAccount option', () => {
  const src = read('supabase/functions/_shared/paymentDomains.ts');
  assert.doesNotMatch(src, /Deno\.env|console\./);
  assert.match(src, /stripeAccount \? \{ stripeAccount \} : undefined/);
});
