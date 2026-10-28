// JChat 3.0 — migration 247 (hourly cron for payment-domains-sync): a DRAFT that Juan Carlos applies through MCP. Static checks of the three files.
// Run: node --test scripts/payment-domains-cron.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const strip = (sql) => sql.replace(/--[^\n]*/g, '');
const mig = read('supabase/migrations/247_payment_domains_sync_cron.sql');
const sql = strip(mig);

test('247 sits right after the baseline: migrations/ starts with 245, 246 and 247', () => {
  const files = readdirSync(new URL('../../supabase/migrations/', import.meta.url)).filter((f) => f.endsWith('.sql')).sort();
  assert.deepEqual(files.slice(0, 3), ['245_baseline.sql', '246_baseline_extras.sql', '247_payment_domains_sync_cron.sql']);
});

test('it is a draft that says so, with its rollback and check named, and nothing in it destroys', () => {
  assert.match(mig, /NO está aplicada en Supabase\. La aplica Juan Carlos por MCP/);
  assert.match(mig, /rollbacks\/247_payment_domains_sync_cron_rollback\.sql/);
  assert.match(mig, /scripts\/247_check\.sql/);
  assert.doesNotMatch(sql, /\bdrop\b|\bdelete\b|\btruncate\b|cron\.unschedule/i, 'CLAUDE.md: migrations are non-destructive (no unschedule before schedule)');
  assert.match(sql, /create or replace function public\.payment_domains_sync_cron\(\)/);
});

test('the job runs once an hour on the hour and is scheduled by name (an upsert, never a duplicate)', () => {
  assert.match(sql, /select cron\.schedule\('payment-domains-sync', '0 \* \* \* \*', \$\$select public\.payment_domains_sync_cron\(\)\$\$\);/);
  assert.equal((sql.match(/cron\.schedule/g) ?? []).length, 1);
});

test('the function reads the secret from the vault by NAME, does nothing without it, sends x-push-secret, and holds no key', () => {
  assert.match(sql, /vault\.decrypted_secrets where name = 'push_webhook_secret'/);
  assert.match(sql, /if v_secret is null then return null; end if;/);
  assert.match(sql, /functions\/v1\/payment-domains-sync/);
  assert.match(sql, /'x-push-secret', v_secret/);
  assert.match(sql, /security definer/);
  assert.match(sql, /set search_path = public, extensions/);
  assert.doesNotMatch(mig, /sk_(test|live)_|eyJ[A-Za-z0-9_-]{10,}|whsec_|sb_secret_/);
});

test('nobody but pg_cron / the owner can run it: execute is revoked from public, anon and authenticated', () => {
  assert.match(sql, /revoke all on function public\.payment_domains_sync_cron\(\) from public, anon, authenticated;/);
});

test('it fails soft (a warning, the next hour retries) and the body is empty so the function defaults (scope platform) apply', () => {
  assert.match(sql, /exception when others then\s+raise warning 'payment_domains_sync_cron failed: %', sqlerrm;\s+return null;/);
  assert.match(sql, /body := '\{\}'::jsonb/);
  assert.doesNotMatch(sql, /connected|both/, 'the cron never asks for the connected accounts');
});

test('rollback removes only the job and the function; check is read-only', () => {
  assert.ok(existsSync(new URL('../../supabase/rollbacks/247_payment_domains_sync_cron_rollback.sql', import.meta.url)));
  const rb = strip(read('supabase/rollbacks/247_payment_domains_sync_cron_rollback.sql'));
  assert.match(rb, /cron\.unschedule\('payment-domains-sync'\)/);
  assert.match(rb, /drop function if exists public\.payment_domains_sync_cron\(\);/);
  assert.equal((rb.match(/\bdrop\b/gi) ?? []).length, 1);
  const check = strip(read('supabase/scripts/247_check.sql'));
  assert.doesNotMatch(check, /\b(insert|update|delete|drop|alter|create|truncate|grant|revoke)\b|cron\.schedule|http_post/i, 'the check writes nothing');
});
