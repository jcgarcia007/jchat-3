// Migration 244 (draft): at most 5 payment refusals per hour per user, added to gift_offer_create RIGHT AFTER the 3-per-hour limit and
// changing nothing else of the 242 definition. Run from mobile/:  node --test scripts/gift-failure-rate-limit.test.mjs

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sql = (p) => readFileSync(new URL(`../../supabase/${p}`, import.meta.url), 'utf8');
const m242 = sql('migrations_archive/242_gift_server_rules.sql');
const m244 = sql('migrations_archive/244_gift_failure_rate_limit.sql');
const rollback = sql('rollbacks/244_gift_failure_rate_limit_rollback.sql');
const check = sql('scripts/244_check.sql');

const FN = /create or replace function public\.gift_offer_create\([\s\S]*?\n\$\$;/;
const GRANTS = /revoke all on function public\.gift_offer_create\(uuid, uuid, jsonb, text, uuid\) from public, anon;\ngrant execute on function public\.gift_offer_create\(uuid, uuid, jsonb, text, uuid\) to authenticated;/;
const fn242 = m242.match(FN)[0];
const fn244 = m244.match(FN)[0];

const BLOCK = `  -- Máx. 5 rechazos de pago por hora entre TODAS las ofertas del usuario (creadas en la última hora), tengan o no tarjeta retenida: sin
  -- esto, abrir ofertas nuevas sin pagar (que el límite de arriba no cuenta) sirve para probar tarjetas, 3 intentos por oferta.
  if (select coalesce(sum(g.payment_failures), 0) from public.gift_offers g where g.from_user_id = v_uid and g.created_at > now() - interval '1 hour') >= 5 then
    raise exception 'gift_rate_limit' using errcode = '42501';
  end if;
`;

const live = (text) => text.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');

test('244 changes ONLY the new block: removing it gives back the 242 definition of gift_offer_create, character for character', () => {
  assert.ok(fn244.includes(BLOCK), 'the new block is there');
  assert.equal(fn244.replace(BLOCK, ''), fn242);
});

test('the new block: sum of payment_failures of MY offers created in the last hour, >= 5, same error as the other limit, right after the 3-per-hour limit', () => {
  assert.match(BLOCK, /sum\(g\.payment_failures\)/);
  assert.match(BLOCK, /g\.from_user_id = v_uid and g\.created_at > now\(\) - interval '1 hour'\) >= 5 then\s+raise exception 'gift_rate_limit' using errcode = '42501';/);
  const threePerHour = fn244.indexOf("g.held_at > now() - interval '1 hour') >= 3");
  const block = fn244.indexOf('Máx. 5 rechazos de pago por hora');
  const pending = fn244.indexOf("g.status in ('held','accepted')");
  assert.ok(threePerHour > 0 && threePerHour < block && block < pending, '3-per-hour → 5 refusals → pending-to-the-same-person');
  // the 242 rules are all still in the function
  for (const rule of ["interval '15 minutes'", "set status = 'cancelled' where from_user_id = v_uid and status in ('draft', 'awaiting_payment')", "raise exception 'gift_pending'", "raise exception 'gift_unavailable'", "raise exception 'invalid_items'"]) {
    assert.ok(fn244.includes(rule), rule);
  }
  assert.match(fn244, /language plpgsql\s+security definer\s+set search_path = public/);
});

test('grants: authenticated only, repeated as in the 242; the migration drops nothing and creates no tables', () => {
  assert.match(m244, GRANTS);
  assert.equal(m244.match(GRANTS)[0], m242.match(GRANTS)[0]);
  const code = live(m244);
  assert.doesNotMatch(code, /\b(drop|truncate|alter table|create table)\b/i);
  assert.deepEqual(code.match(/^grant .*$/gm), ['grant execute on function public.gift_offer_create(uuid, uuid, jsonb, text, uuid) to authenticated;']);
});

test('rollback: gift_offer_create goes back to EXACTLY the 242 version (and its grants); nothing else', () => {
  assert.equal(rollback.match(FN)[0], fn242);
  assert.match(rollback, GRANTS);
  assert.doesNotMatch(live(rollback), /\bdrop\b|payment_failures/i, 'no drop, and the refusal limit is gone');
});

test('check script: sections (a)-(d) only read; (e) is commented out and runs inside begin/rollback', () => {
  const body = live(check);
  assert.doesNotMatch(body, /\b(insert|update|delete|drop|alter)\b/i, 'nothing is written outside the commented-out (e)');
  assert.match(check, /-- begin;[\s\S]*-- rollback;/);
  assert.match(body, /coalesce\(sum\(g\.payment_failures\), 0\)/);
});
