// Fails when a column is added to public.businesses without being granted to `authenticated` for UPDATE, and without an entry
// (with the reason) in NOT_OWNER_EDITABLE below. Run from mobile/:  node scripts/migrations-businesses-grants.test.mjs
//
// Why: UPDATE on public.businesses for `authenticated` is a COLUMN ALLOWLIST (migrations 036, 038, 117, 159, 236). A column that
// is not in it cannot be written by the owner even when RLS lets them touch the row, and the dashboard answers 403 "permission
// denied for table businesses" (migration 236: Configuración → Portada e ícono). The rule: a new column the owner edits from the
// app joins `grant update (…) on public.businesses to authenticated` in the SAME migration that creates it.
//
// How: reads supabase/migrations_archive/*.sql and then the new supabase/migrations/24[7+]_*.sql in order, strips `--` comments, collects the columns that `create table businesses` and
// `alter table businesses add column` introduce, and the columns of every `grant update (…) on businesses to authenticated`.
// A column that is neither granted nor listed fails. LIMITS: it reads the migrations, not the live database (check that with the
// query in migration 236's header); it does not see grants written through dynamic SQL (`execute`), nor columns renamed later.

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const SUPABASE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'supabase');
// The history (001-244) lives in migrations_archive/; the baseline (245, 246) restates it and is skipped; new migrations (247+) are read from migrations/.
const MIGRATIONS = join(SUPABASE, 'migrations_archive');
const NEW_MIGRATIONS = join(SUPABASE, 'migrations');

/** Columns of public.businesses the owner does NOT edit from the app (or that nothing in the clients writes), each with the reason. */
export const NOT_OWNER_EDITABLE = {
  owner_id: 'set at creation by the server; never changes from a client',
  plan: 'billing: written by the server (Stripe webhooks / subscriptions)',
  status: 'verification state: written by admins / the verification flow',
  stripe_account_id: 'Stripe Connect: written by the Edge Functions',
  stripe_charges_enabled: 'Stripe Connect: written by the Edge Functions',
  stripe_details_submitted: 'Stripe Connect: written by the Edge Functions',
  stripe_payouts_enabled: 'Stripe Connect: written by the Edge Functions',
  verified_at: 'verification: written by the server',
  verified_by: 'verification: written by the server',
  tax_rate: 'financial: protected by the financial-columns trigger (034); clients only read it',
  subdomain: 'assigned by the server; clients only read it (QR / entry links)',
  timezone: 'IANA zone of the venue (migration 239): filled by the server (by lat/lng in a later phase); clients only read it',
  sales_location_id: 'POS: set by server functions; no client writes it',
  menu_language_mode: 'no client writes it today; add it to the grant the day the dashboard edits it',
  menu_primary_language: 'no client writes it today; add it to the grant the day the dashboard edits it',
};

const stripComments = (sql) => sql.replace(/--[^\n]*/g, '');
const names = (list) => list.split(/[,\s]+/).map((c) => c.replace(/"/g, '').trim()).filter(Boolean);

export function scanMigrations(files) {
  const added = new Map(); // column → migration that created it
  const granted = new Set();
  for (const [file, raw] of files) {
    const sql = stripComments(raw);
    for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?businesses\s*\(([\s\S]*?)\n\);/gi)) {
      for (const line of m[1].split('\n')) {
        const col = /^\s*"?([a-z_0-9]+)"?\s+[a-z]/i.exec(line)?.[1];
        if (col && !/^(constraint|primary|unique|check|foreign)$/i.test(col) && !added.has(col)) added.set(col, file);
      }
    }
    for (const m of sql.matchAll(/alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(?:public\.)?businesses\b([\s\S]*?);/gi)) {
      for (const c of m[1].matchAll(/add\s+column\s+(?:if\s+not\s+exists\s+)?"?([a-z_0-9]+)"?/gi)) if (!added.has(c[1])) added.set(c[1], file);
    }
    for (const m of sql.matchAll(/grant\s+update\s*\(([\s\S]*?)\)\s*on\s+(?:table\s+)?(?:public\.)?businesses\s+to\s+([a-z_,\s]+)/gi)) {
      if (/authenticated/i.test(m[2])) for (const c of names(m[1])) granted.add(c);
    }
  }
  return { added, granted };
}

const sqlFiles = (dir, keep = () => true) => readdirSync(dir).filter((f) => f.endsWith('.sql') && keep(f)).sort().map((f) => [f, readFileSync(join(dir, f), 'utf8')]);
const real = () => scanMigrations([...sqlFiles(MIGRATIONS), ...sqlFiles(NEW_MIGRATIONS, (f) => parseInt(f, 10) >= 247)]);

test('the scanner reads creates, add columns and column grants', () => {
  const { added, granted } = scanMigrations([
    ['a.sql', 'create table public.businesses (\n  id uuid primary key,\n  name text not null,\n  constraint x check (true)\n);'],
    ['b.sql', 'alter table public.businesses add column if not exists icon_url text, add column "tagline" text; -- add column ghost text'],
    ['c.sql', 'grant update (\n  name, icon_url -- comment\n) on public.businesses to authenticated;\ngrant update (tagline) on public.businesses to service_role;'],
  ]);
  assert.deepEqual([...added.keys()].sort(), ['icon_url', 'id', 'name', 'tagline']);
  assert.deepEqual([...granted].sort(), ['icon_url', 'name'], 'only grants to authenticated count');
});

test('every column of businesses is granted to authenticated or listed as not owner-editable', () => {
  const { added, granted } = real();
  const missing = [...added.keys()].filter((c) => !granted.has(c) && !(c in NOT_OWNER_EDITABLE));
  assert.deepEqual(
    missing.map((c) => `${c} (added in ${added.get(c)})`),
    [],
    'add the column to `grant update (…) on public.businesses to authenticated` in a migration, or to NOT_OWNER_EDITABLE with the reason',
  );
});

test('NOT_OWNER_EDITABLE only lists columns that exist and are not granted (the list cannot rot)', () => {
  const { added, granted } = real();
  const stale = Object.keys(NOT_OWNER_EDITABLE).filter((c) => !added.has(c) || granted.has(c));
  assert.deepEqual(stale, [], 'remove these from NOT_OWNER_EDITABLE: they do not exist or are granted now');
});

test('migration 236 grants the five columns of the cover / icon bug', () => {
  const { granted } = real();
  for (const c of ['icon_url', 'dashboard_palette_id', 'pickup_enabled', 'receipt_brand_color', 'receipt_template_id']) {
    assert.ok(granted.has(c), `${c} must be granted to authenticated`);
  }
});
