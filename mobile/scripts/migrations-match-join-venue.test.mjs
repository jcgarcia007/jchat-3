// Migration 256 (match_join_venue): match_join_venue is the ONLY function that inserts into game_optins; the heartbeat match_check_in never does (audit B5-1).
// Run from mobile/:  node --test scripts/migrations-match-join-venue.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const readRepo = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const migration = readRepo('supabase/migrations/256_match_join_venue.sql');
const code = migration.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');

/** The body of every `create or replace function public.<name>(` in the migration, by name. */
function bodies(sql) {
  const out = {};
  const re = /create or replace function public\.(\w+)\(([\s\S]*?)\$function\$([\s\S]*?)\$function\$;/g;
  for (const m of sql.matchAll(re)) out[m[1]] = m[3];
  return out;
}
const fns = bodies(code);

test('256 defines exactly three functions: the core, the heartbeat and the explicit join', () => {
  assert.deepEqual(Object.keys(fns).sort(), ['match_check_in', 'match_join_venue', 'match_presence_core']);
});

test('the heartbeat match_check_in does NOT insert into game_optins (it only calls the core with the opt-in required)', () => {
  assert.doesNotMatch(fns.match_check_in, /insert\s+into\s+(public\.)?game_optins/i);
  assert.doesNotMatch(fns.match_check_in, /game_optins/i);
  assert.match(fns.match_check_in, /match_presence_core\(p_business_id, p_lat, p_lng, p_qr_token, p_mocked, true\)/);
});

test('the core validates, requires the opt-in when asked and never inserts into game_optins', () => {
  assert.doesNotMatch(fns.match_presence_core, /insert\s+into\s+(public\.)?game_optins/i);
  assert.match(fns.match_presence_core, /if p_require_optin and not exists \(select 1 from public\.game_optins o where o\.user_id = v_uid and o\.business_id = p_business_id and o\.game_key = 'match'\)/);
  assert.match(fns.match_presence_core, /'reason','not_joined'/);
  for (const reason of ['age_not_confirmed', 'games_disabled', 'match_disabled', 'unavailable', 'not_in_venue', 'invalid_qr', 'impossible_travel']) {
    assert.match(fns.match_presence_core, new RegExp(`'reason','${reason}'`), `the validation ${reason} is kept`);
  }
  // not_joined is answered BEFORE any write: the presence upsert comes after it
  assert.ok(fns.match_presence_core.indexOf("'not_joined'") < fns.match_presence_core.indexOf('insert into public.match_presence'));
});

test('match_join_venue is the ONLY function of the migration with an insert into game_optins, and it does not insert when denied', () => {
  const inserters = Object.entries(fns).filter(([, body]) => /insert\s+into\s+public\.game_optins/i.test(body)).map(([name]) => name);
  assert.deepEqual(inserters, ['match_join_venue']);
  assert.match(fns.match_join_venue, /match_presence_core\(p_business_id, p_lat, p_lng, p_qr_token, p_mocked, false\)/);
  const deniedReturn = fns.match_join_venue.indexOf("if v_result->>'status' = 'denied' then return v_result; end if;");
  assert.ok(deniedReturn > 0 && deniedReturn < fns.match_join_venue.indexOf('insert into public.game_optins'), 'a denied join returns before the insert');
  assert.match(fns.match_join_venue, /on conflict do nothing/);
});

test('grants: join for authenticated + service_role, never anon/public; the core for nobody; check_in keeps its signature', () => {
  assert.match(code, /revoke all on function public\.match_join_venue\(uuid, double precision, double precision, text, boolean\) from public, anon;/);
  assert.match(code, /grant execute on function public\.match_join_venue\(uuid, double precision, double precision, text, boolean\) to authenticated, service_role;/);
  assert.match(code, /revoke all on function public\.match_presence_core\(uuid, double precision, double precision, text, boolean, boolean\) from public, anon, authenticated;/);
  const grants = [...code.matchAll(/grant\s+[^;]*;/gi)].map((m) => m[0]);
  assert.equal(grants.length, 1, 'only one grant: the join');
  assert.match(migration, /create or replace function public\.match_check_in\(\s*p_business_id uuid, p_lat double precision default null::double precision, p_lng double precision default null::double precision,\s*p_qr_token text default null::text, p_mocked boolean default false\)/);
});

test('256 is non-destructive and ships a check and a rollback that restores the old heartbeat', () => {
  assert.doesNotMatch(code, /\b(delete\s+from|truncate|drop\s+table|drop\s+function)\b/i);
  assert.doesNotMatch(code, /update\s+public\.game_optins|insert\s+into\s+public\.match_presence\s+select/i);
  const check = readRepo('supabase/scripts/256_check.sql').split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  const checkNoLiterals = check.replace(/'[^']*'/g, "''");
  assert.match(check, /has_function_privilege/);
  assert.doesNotMatch(checkNoLiterals, /\b(insert|update|delete|drop|create|grant|revoke|alter)\b/i, 'the check only reads');
  const rollback = readRepo('supabase/rollbacks/256_match_join_venue_rollback.sql');
  assert.match(rollback, /insert into public\.game_optins \(user_id, business_id, game_key\) values \(v_uid, p_business_id, 'match'\) on conflict do nothing;/);
  assert.match(rollback, /drop function if exists public\.match_join_venue\(/);
  assert.match(rollback, /drop function if exists public\.match_presence_core\(/);
});

test('the SQL test exists and covers the leave → heartbeat → no re-entry case', () => {
  const sql = readRepo('supabase/tests/07_match_join_venue.sql');
  assert.match(sql, /does NOT recreate the opt-in \(B5-1\)/);
  assert.match(sql, /match_join_venue is the only function that inserts into game_optins/);
  assert.match(sql, /match_check_in without opt-in → denied \/ not_joined/);
});
