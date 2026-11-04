// Migration 257 (business_is_open_now + venue_closed): static guarantees. The behavior itself is tested in supabase/tests/08_business_open_now.sql.
// Run from mobile/:  node --test scripts/migrations-business-open-now.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const readRepo = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const strip = (sql) => sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
const migration = strip(readRepo('supabase/migrations/257_business_open_now.sql'));
const rollback = strip(readRepo('supabase/rollbacks/257_business_open_now_rollback.sql'));
const check = strip(readRepo('supabase/scripts/257_check.sql'));

test('257 defines business_is_open_now as stable security definer with search_path public; NULL (unknown) never means closed', () => {
  assert.match(migration, /create or replace function public\.business_is_open_now\(p_business_id uuid, p_at timestamptz default now\(\)\)\s+returns boolean\s+language plpgsql\s+stable\s+security definer\s+set search_path = public/);
  assert.match(migration, /coalesce\(nullif\(btrim\(v_tz\), ''\), 'America\/New_York'\)/, 'blank zone = America/New_York');
  assert.match(migration, /exception when others then\s+return null;/, 'an unknown zone / odd data is "unknown", not an error and not "closed"');
});

test('257 permissions: business_is_open_now is not for anon/PUBLIC; the helpers are internal; the order functions stay service_role only', () => {
  assert.match(migration, /revoke all on function public\.business_is_open_now\(uuid, timestamptz\) from public, anon;/);
  assert.match(migration, /grant execute on function public\.business_is_open_now\(uuid, timestamptz\) to authenticated, service_role;/);
  assert.match(migration, /revoke all on function public\.business_hours_minutes\(text\) from public, anon, authenticated;/);
  assert.match(migration, /revoke all on function public\.business_hours_day\(jsonb\) from public, anon, authenticated;/);
  assert.match(migration, /grant execute on function public\.assert_venue_order_allowed\([^)]*\) to service_role;/);
  assert.match(migration, /grant execute on function public\.create_paid_order\(jsonb, jsonb\) to service_role;/);
  for (const grant of [...migration.matchAll(/grant\s+[^;]*;/gi)].map((m) => m[0])) {
    const grantees = grant.slice(grant.search(/\sto\s/i));
    assert.doesNotMatch(grantees, /\b(anon|public)\b/i, `no grant to anon/public: ${grant}`);
  }
});

test('257 assert_venue_order_allowed: staff and POS return BEFORE the closed check; the error is venue_closed with P0001', () => {
  const assertFn = migration.slice(migration.indexOf('create or replace function public.assert_venue_order_allowed'), migration.indexOf('create or replace function public.create_paid_order'));
  const posReturn = assertFn.indexOf("like 'pos%' then return");
  const staffReturn = assertFn.indexOf('is_venue_staff');
  const closed = assertFn.indexOf('business_is_open_now(p_business_id) is false');
  assert.ok(posReturn > 0 && staffReturn > posReturn && closed > staffReturn, 'POS, then staff, then the closed rule');
  assert.match(assertFn, /raise exception 'venue_closed' using errcode = 'P0001'/);
  assert.match(assertFn, /raise exception 'outside_venue'/, 'the golden rule is still there');
});

test('257 create_paid_order: venue_closed ONLY for an unpaid order that the staff did not take; an order with stripe_pi_id is never rejected', () => {
  const fn = migration.slice(migration.indexOf('create or replace function public.create_paid_order'));
  const guard = fn.slice(fn.indexOf("nullif(p_order->>'stripe_pi_id', '') is null"), fn.indexOf("raise exception 'venue_closed'"));
  assert.match(guard, /nullif\(p_order->>'taken_by', ''\) is null/);
  assert.match(guard, /not like 'pos%'/);
  assert.match(guard, /business_is_open_now\(nullif\(p_order->>'business_id', ''\)::uuid\) is false/);
  assert.match(fn, /insert into public\.orders/, 'the rest of the function is unchanged');
});

test('257 is idempotent and non-destructive; it ships a read-only check and a rollback that restores the old bodies', () => {
  assert.doesNotMatch(migration, /\b(delete from|truncate|drop table|insert into public\.(?!orders|order_items)|update public\.)/i);
  assert.doesNotMatch(check, /\b(insert|update|delete|drop|create|grant|revoke|alter)\b/i, 'the check only reads');
  assert.match(check, /ok/);
  assert.match(rollback, /drop function if exists public\.business_is_open_now\(uuid, timestamptz\);/);
  assert.match(rollback, /drop function if exists public\.business_hours_day\(jsonb\);/);
  assert.match(rollback, /drop function if exists public\.business_hours_minutes\(text\);/);
  assert.doesNotMatch(rollback.slice(0, rollback.indexOf('drop function')), /venue_closed|business_is_open_now/, 'the restored bodies no longer mention the new rule');
});

test('the Edge Function and the app agree on the error code', () => {
  assert.match(readRepo('supabase/functions/payments/index.ts'), /error: "venue_closed", code: "venue_closed" \}, 409/);
  for (const lang of ['en', 'es']) {
    const errors = JSON.parse(readRepo(`mobile/i18n/locales/${lang}/errors.json`));
    assert.equal(typeof errors.app.venue_closed, 'string');
  }
  assert.equal(JSON.parse(readRepo('mobile/i18n/locales/es/errors.json')).app.venue_closed, 'Este local está cerrado; podrás pedir cuando abra.');
  assert.equal(JSON.parse(readRepo('mobile/i18n/locales/en/errors.json')).app.venue_closed, 'This venue is closed; you can order when it opens.');
});
