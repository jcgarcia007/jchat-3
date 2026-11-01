// Static guards on supabase/migrations/254_match_profile_v2.sql (Match v2) and its check script. Run from mobile/:
//   node --test scripts/match-v2-migration.test.mjs
// 1) the functions that read the private sex / interest data can only be executed by service_role (nobody can deduce another person's data by
//    calling them with someone else's ids); 2) the verdict trigger does not push twice; 3) the check script only reads.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sql = readFileSync(new URL('../../supabase/migrations/254_match_profile_v2.sql', import.meta.url), 'utf8');
const check = readFileSync(new URL('../../supabase/scripts/254_check.sql', import.meta.url), 'utf8');
/** The SQL without `--` comments, one statement per entry. */
const statements = sql.replace(/--.*$/gm, '').split(/;\s*(?:\n|$)/).map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);

/** Roles that end up with EXECUTE on `name` according to the file (grants minus revokes, in file order). */
function executeRoles(name) {
  const roles = new Set(['public', 'anon', 'authenticated', 'service_role']); // Supabase grants these by default on new functions in public
  const pattern = new RegExp(`^(grant|revoke) (?:execute|all) on function public\\.${name}\\(`, 'i');
  for (const statement of statements) {
    if (!pattern.test(statement)) continue;
    const grant = /^grant/i.test(statement);
    const list = statement.replace(/^.*?\b(?:to|from)\b/i, '').split(',').map((r) => r.trim().toLowerCase()).filter(Boolean);
    for (const role of list) {
      if (grant) roles.add(role);
      else roles.delete(role);
    }
  }
  return roles;
}

test('match_orientation_ok and match_profile_enforced: no EXECUTE for anon, authenticated or public (service_role only)', () => {
  for (const name of ['match_orientation_ok', 'match_profile_enforced']) {
    const roles = executeRoles(name);
    for (const forbidden of ['anon', 'authenticated', 'public']) assert.equal(roles.has(forbidden), false, `${name} must not be executable by ${forbidden}`);
    assert.equal(roles.has('service_role'), true, `${name} stays executable by service_role`);
    assert.doesNotMatch(sql.replace(/--.*$/gm, ''), new RegExp(`grant[^;]*function public\\.${name}\\([^;]*to[^;]*\\b(authenticated|anon|public)\\b`, 'i'));
  }
});

test('match_common_business answers only for the caller (p_viewer = auth.uid()): it cannot be used to probe whether two other people fit each other', () => {
  const body = sql.slice(sql.indexOf('create or replace function public.match_common_business('), sql.indexOf('revoke all on function public.match_fits'));
  assert.match(body, /and public\.match_orientation_ok\(p_viewer, p_target\)/);
  assert.match(body.replace(/--.*$/gm, ''), /and \(auth\.uid\(\) is null or p_viewer = \(select auth\.uid\(\)\)\)/);
  assert.match(sql, /grant execute on function public\.match_fits/, 'sanity');
});

test('the other SECURITY DEFINER functions that write or push are not callable by clients either', () => {
  for (const name of ['photo_moderation_alert', 'match_photo_verdict_notify']) {
    const roles = executeRoles(name);
    for (const forbidden of ['anon', 'authenticated', 'public']) assert.equal(roles.has(forbidden), false, `${name} must not be executable by ${forbidden}`);
  }
});

test('the private tables are not readable by anon, and only match_profiles (own row, RLS) is open to authenticated', () => {
  const code = sql.replace(/--.*$/gm, '');
  assert.match(code, /revoke all on table public\.match_profiles from anon, authenticated;/);
  assert.match(code, /revoke all on table public\.match_v2_flags from anon, authenticated;/);
  assert.match(code, /revoke all on table public\.photo_moderation_log from anon, authenticated;/);
  assert.doesNotMatch(code, /grant [^;]*on table public\.(match_v2_flags|photo_moderation_log) to [^;]*authenticated/);
  for (const table of ['match_profiles', 'match_v2_flags', 'photo_moderation_log']) {
    assert.match(code, new RegExp(`alter table public\\.${table} enable row level security;`));
  }
});

test('sex and interest are never added to users or to a view', () => {
  const code = sql.replace(/--.*$/gm, '');
  assert.doesNotMatch(code, /alter table public\.users/i);
  assert.doesNotMatch(code, /create (or replace )?view/i);
});

test('the verdict function only inserts the notification: the existing trigger sends the push (no second push_dispatch)', () => {
  const body = sql.slice(sql.indexOf('create or replace function public.match_photo_verdict_notify()'), sql.indexOf('create or replace trigger trg_match_photo_verdict_notify'));
  assert.ok(body.length > 200, 'found the function');
  assert.match(body, /insert into public\.notifications \(user_id, type, payload\) values \(new\.user_id, v_type, v_payload\);/);
  assert.doesNotMatch(body.replace(/--.*$/gm, ''), /push_dispatch/);
  assert.doesNotMatch(body.replace(/--.*$/gm, ''), /v_nid/);
});

test('the header says it is independent of 251–253', () => {
  assert.match(sql, /Independiente de 251–253; producción está en 250 y match_common_business coincide con el baseline 245 \(verificado\)\./);
  assert.doesNotMatch(sql, /251, 252 y 253 deben estar aplicadas/);
});

test('254_check.sql only reads: no insert / update / delete / DDL / grants and no call to a function that writes', () => {
  const code = check.replace(/--.*$/gm, '');
  assert.doesNotMatch(code, /\b(insert|update|delete|truncate|create|alter|drop|grant|revoke|comment)\b\s/i);
  assert.doesNotMatch(code, /\b(perform|do)\b\s/i);
  assert.doesNotMatch(code, /\b(match_photo_retry_moderation|dm_photo_retry_moderation|photo_moderation_alert|push_dispatch|cron\.(schedule|unschedule)|net\.http_post)\s*\(/i);
  // the only functions it calls are pure / read-only
  // (names inside quotes, like the regprocedure literals, are lookups, not calls)
  const calls = new Set([...code.replace(/'[^']*'/g, "''").matchAll(/\bpublic\.([a-z_]+)\(/gi)].map((m) => m[1]));
  assert.deepEqual([...calls].sort(), ['match_fits', 'match_profile_enforced']);
});

test('match_common_business keeps EXECUTE for authenticated (two RLS policies call it with the user session): the migration never revokes it', () => {
  const code = sql.replace(/--.*$/gm, '');
  assert.doesNotMatch(code, /revoke[^;]*function public\.match_common_business/i);
});

test('sex / interest changes are limited: 3 per 24 h, P0001 match_profile_change_limit, the first save and completing an empty value do not count', () => {
  const body = sql.slice(sql.indexOf('create or replace function public.match_profiles_change_guard()'), sql.indexOf('create or replace trigger trg_match_profiles_change_guard'));
  assert.match(body, /c_limit constant int := 3;/);
  assert.match(body, /c_window constant interval := interval '24 hours';/);
  assert.match(body, /raise exception 'match_profile_change_limit' using errcode = 'P0001';/);
  assert.match(body, /old\.gender is not null and new\.gender is distinct from old\.gender/);
  assert.match(body, /old\.seeking is not null and new\.seeking is distinct from old\.seeking/);
  assert.match(body, /if tg_op = 'INSERT' then\s*new\.change_log := '\{\}';/);
  assert.match(sql, /create or replace trigger trg_match_profiles_change_guard before insert or update on public\.match_profiles/);
});

test('clients can neither delete their match_profiles row (it would reset the limit) nor write change_log: UPDATE only on gender and seeking', () => {
  const code = sql.replace(/--.*$/gm, '');
  assert.match(code, /grant update \(gender, seeking\) on table public\.match_profiles to authenticated;/);
  assert.doesNotMatch(code, /grant [^;]*\bdelete\b[^;]*on table public\.match_profiles/i);
  assert.doesNotMatch(code, /policy match_profiles_own_delete/);
  assert.doesNotMatch(code, /grant update on table public\.match_profiles/i);
});
