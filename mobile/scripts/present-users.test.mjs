// Arreglo B (option A): the room's presence list filtered with the server's geo-presence (migration 243 + utils/presentUsers.ts +
// utils/presentPoller.ts + hooks/usePresentUsers.ts). Run from mobile/:  node --test scripts/present-users.test.mjs

import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const dir = mkdtempSync(join(tmpdir(), 'present-users-'));
const opts = { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } };
for (const name of ['presentUsers', 'presentPoller']) writeFileSync(join(dir, `${name}.mjs`), ts.transpileModule(read(`utils/${name}.ts`), opts).outputText);
const { filterPresentUsers, presentQueryIds, PRESENT_QUERY_LIMIT } = await import(pathToFileURL(join(dir, 'presentUsers.mjs')).href);
const { createPresentPoller, PRESENT_POLL_INTERVAL_MS, PRESENT_POLL_MIN_GAP_MS } = await import(pathToFileURL(join(dir, 'presentPoller.mjs')).href);

const u = (id) => ({ id, name: id });
const ME = 'me';

// ── the pure filter ──────────────────────────────────────────────────────────────────────────────────────────
test('presentQueryIds: me first, everyone once, at most 100', () => {
  assert.deepEqual(presentQueryIds([u('a'), u('b'), u('a')], ME), [ME, 'a', 'b']);
  assert.deepEqual(presentQueryIds([u(ME), u('a')], ME), [ME, 'a'], 'I am not repeated');
  assert.deepEqual(presentQueryIds([u('a')], null), ['a']);
  const many = Array.from({ length: 150 }, (_, i) => u(`p${i}`));
  const ids = presentQueryIds(many, ME);
  assert.equal(ids.length, PRESENT_QUERY_LIMIT);
  assert.equal(ids[0], ME, 'my id always travels, even past the limit');
});

test('filter: only people the server confirms stay; I always stay', () => {
  const users = [u(ME), u('a'), u('b'), u('c')];
  const queried = presentQueryIds(users, ME);
  const out = filterPresentUsers(users, [ME, 'a'], queried, ME);
  assert.deepEqual(out.map((x) => x.id), [ME, 'a']);
  // the server's answer says nothing about me being listed: I stay anyway (my id IS in the answer here, but my row never depends on it)
  const outSelf = filterPresentUsers([u('a'), u(ME)], [ME], presentQueryIds([u('a'), u(ME)], ME), ME);
  assert.deepEqual(outSelf.map((x) => x.id), [ME]);
});

test('filter FAIL-OPEN: a failed call (null) leaves the list exactly as it is', () => {
  const users = [u(ME), u('a')];
  assert.equal(filterPresentUsers(users, null, ['me', 'a'], ME), users, 'same array');
  assert.equal(filterPresentUsers(users, [ME], null, ME), users);
  assert.equal(filterPresentUsers(users, [ME], ['me', 'a'], null), users, 'no self id: nothing to verify');
});

test('filter FAIL-OPEN: if MY id does not come back, the list is left unfiltered (the empty "you are not present" is never "nobody is here")', () => {
  const users = [u(ME), u('a'), u('b')];
  const queried = presentQueryIds(users, ME);
  assert.equal(filterPresentUsers(users, [], queried, ME), users, 'empty answer');
  assert.equal(filterPresentUsers(users, ['a'], queried, ME), users, 'an answer without me');
});

test('filter: the answer only ever removes; people past the 100-id limit stay (they were never asked)', () => {
  const many = Array.from({ length: 130 }, (_, i) => u(`p${i}`));
  const users = [u(ME), ...many];
  const queried = presentQueryIds(users, ME); // me + p0..p98
  const out = filterPresentUsers(users, [ME, 'p0'], queried, ME);
  assert.ok(out.some((x) => x.id === 'p0'));
  assert.ok(!out.some((x) => x.id === 'p1'), 'asked and not confirmed: removed');
  assert.ok(out.some((x) => x.id === 'p120'), 'not asked: stays');
  // an id the server returns that is not in the list never appears
  const extra = filterPresentUsers([u(ME), u('a')], [ME, 'a', 'ghost'], presentQueryIds([u(ME), u('a')], ME), ME);
  assert.deepEqual(extra.map((x) => x.id), [ME, 'a']);
});

// ── the poller: no calls when the room is closed or the app is in the background ─────────────────────────────
function harness({ foreground = true, intervalMs, minGapMs } = {}) {
  let now = 0;
  let isForeground = foreground;
  const calls = [];
  const results = [];
  const timers = new Map();
  let nextId = 1;
  let resolveCurrent = null;
  const poller = createPresentPoller({
    fetch: () => {
      calls.push(now);
      return new Promise((resolve) => { resolveCurrent = resolve; });
    },
    isForeground: () => isForeground,
    onResult: (r) => results.push(r),
    now: () => now,
    setTimer: (fn, ms) => { const id = nextId++; timers.set(id, { fn, at: now + ms, repeat: null }); return id; },
    clearTimer: (id) => timers.delete(id),
    setRepeat: (fn, ms) => { const id = nextId++; timers.set(id, { fn, at: now + ms, repeat: ms }); return id; },
    clearRepeat: (id) => timers.delete(id),
    intervalMs,
    minGapMs,
  });
  const advance = async (ms) => {
    const target = now + ms;
    for (;;) {
      const due = [...timers.entries()].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      const [id, t] = due;
      now = t.at;
      if (t.repeat) t.at += t.repeat; else timers.delete(id);
      t.fn();
      await Promise.resolve();
    }
    now = target;
  };
  const answer = async (value) => { resolveCurrent(value); resolveCurrent = null; await new Promise((r) => setImmediate(r)); };
  return { poller, calls, results, advance, answer, setForeground: (v) => { isForeground = v; }, timers, get now() { return now; } };
}

test('poller: nothing happens before start() (the room is not open) and nothing after stop() (unmounted)', async () => {
  const h = harness();
  h.poller.trigger();
  await h.advance(PRESENT_POLL_INTERVAL_MS * 3);
  assert.equal(h.calls.length, 0, 'never started: no call');
  h.poller.start();
  assert.equal(h.calls.length, 1, 'starting asks once');
  await h.answer(['x']);
  h.poller.stop();
  assert.equal(h.timers.size, 0, 'stop clears the interval and any pending call');
  h.poller.trigger();
  await h.advance(PRESENT_POLL_INTERVAL_MS * 3);
  assert.equal(h.calls.length, 1, 'stopped: no more calls');
});

test('poller: no call while the app is in the background; it asks again when it comes back', async () => {
  const h = harness({ foreground: false });
  h.poller.start();
  assert.equal(h.calls.length, 0, 'started in the background: no call');
  await h.advance(PRESENT_POLL_INTERVAL_MS * 5);
  assert.equal(h.calls.length, 0, 'the 60 s ticks in the background make no call either');
  h.setForeground(true);
  h.poller.trigger(); // AppState → 'active'
  assert.equal(h.calls.length, 1, 'back in the foreground: one call');
});

test('poller: every 60 s in the foreground, never two at once, minimum gap kept (a trailing call instead of a dropped one)', async () => {
  const h = harness();
  h.poller.start();
  assert.equal(h.calls.length, 1);
  h.poller.trigger(); // a call is in flight: ignored
  assert.equal(h.calls.length, 1);
  await h.answer(['a']);
  h.poller.trigger(); // 0 ms after the last call: inside the 5 s gap → scheduled, not run now
  assert.equal(h.calls.length, 1);
  await h.advance(PRESENT_POLL_MIN_GAP_MS);
  assert.equal(h.calls.length, 2, 'the trailing call runs when the gap is over');
  await h.answer(['a']);
  await h.advance(PRESENT_POLL_INTERVAL_MS);
  assert.equal(h.calls.length, 3, 'and then once a minute');
});

test('poller: the answer of a call that finishes after stop() is ignored; a rejected call is a null result', async () => {
  const h = harness();
  h.poller.start();
  h.poller.stop();
  await h.answer(['late']);
  assert.deepEqual(h.results, [], 'ignored after stop');
  const h2 = harness();
  const failing = createPresentPoller({
    fetch: () => Promise.reject(new Error('network')), isForeground: () => true, onResult: (r) => h2.results.push(r), now: () => 0,
    setTimer: () => 1, clearTimer: () => undefined, setRepeat: () => 1, clearRepeat: () => undefined,
  });
  failing.start();
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(h2.results, [null]);
});

// ── static checks: migration, service, hook, screen ──────────────────────────────────────────────────────────
test('migration 243: security definer, stable, caller must be present, 100 ids, both-way blocks, read-only, grants', () => {
  const name = readdirSync(new URL('../../supabase/migrations_archive/', import.meta.url)).find((f) => /_venue_present_users\.sql$/.test(f));
  assert.ok(name, 'the migration file exists');
  const sql = readFileSync(new URL(`../../supabase/migrations_archive/${name}`, import.meta.url), 'utf8');
  const code = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  assert.match(code, /create or replace function public\.venue_present_users\(p_business_id uuid, p_user_ids uuid\[\]\)\s+returns uuid\[\]/);
  assert.match(code, /language plpgsql\s+stable\s+security definer\s+set search_path = public/);
  assert.match(code, /if v_uid is null or p_business_id is null or p_user_ids is null then\s+return '\{\}'::uuid\[\];/);
  assert.match(code, /if not public\.venue_presence_ok\(p_business_id, v_uid\) then\s+return '\{\}'::uuid\[\];/);
  assert.match(code, /unnest\(p_user_ids\[1:100\]\)/);
  assert.match(code, /select distinct x\.id/);
  assert.match(code, /where public\.venue_presence_ok\(p_business_id, c\.id\)/);
  assert.match(code, /\(b\.blocker_id = v_uid and b\.blocked_id = c\.id\) or \(b\.blocker_id = c\.id and b\.blocked_id = v_uid\)/);
  assert.match(code, /revoke all on function public\.venue_present_users\(uuid, uuid\[\]\) from public, anon;/);
  assert.match(code, /grant execute on function public\.venue_present_users\(uuid, uuid\[\]\) to authenticated;/);
  assert.deepEqual(code.match(/^grant .*$/gm), ['grant execute on function public.venue_present_users(uuid, uuid[]) to authenticated;'], 'the only grant is to authenticated');
  assert.doesNotMatch(code, /\b(insert|update|delete|drop|truncate)\b/i, 'read-only, no drop');
  // the check script and the rollback exist too
  assert.match(readFileSync(new URL('../../supabase/rollbacks/243_venue_present_users_rollback.sql', import.meta.url), 'utf8'), /drop function if exists public\.venue_present_users\(uuid, uuid\[\]\);/);
  assert.match(readFileSync(new URL('../../supabase/scripts/243_check.sql', import.meta.url), 'utf8'), /venue_present_users/);
});

test('service: calls the 243 function with the business and at most 100 ids, never throws, null on any failure', () => {
  const svc = read('services/venuePresence.ts');
  assert.match(svc, /supabase\.rpc\('venue_present_users' as never, \{ p_business_id: businessId, p_user_ids: userIds\.slice\(0, PRESENT_QUERY_LIMIT\) \} as never\)/);
  assert.match(svc, /if \(!Array\.isArray\(data\)\) return null;/);
  assert.match(svc, /warnOnce\('venue_present_users', error\);\s*return null;/);
});

test('hook: no poller (so no calls) unless the room is open; stops on unmount and listens to the foreground', () => {
  const hook = read('hooks/usePresentUsers.ts');
  assert.match(hook, /if \(!enabled \|\| !businessId \|\| !selfId\) \{\s*setAnswer\(null\);\s*return undefined;\s*\}/);
  assert.match(hook, /isForeground: \(\) => AppState\.currentState === 'active'/);
  assert.match(hook, /AppState\.addEventListener\('change', \(next\) => \{\s*if \(next === 'active'\) poller\.trigger\(\);/);
  assert.match(hook, /return \(\) => \{\s*sub\.remove\(\);\s*poller\.stop\(\);/);
  assert.match(hook, /\(enabled \? filterPresentUsers\(/);
});

test('ChatRoomScreen: the header list and the count use the filtered list; only once the room is entered; not for the owner', () => {
  const room = read('screens/chat/ChatRoomScreen.tsx');
  assert.match(room, /import \{ usePresentUsers \} from '\.\.\/\.\.\/hooks\/usePresentUsers';/);
  assert.match(room, /const usersInRoom = usePresentUsers\(visibleUsers, \{\s*businessId: room\?\.business_id,\s*selfId: user\?\.id,\s*enabled: isSupabaseConfigured && !entryVisible && !isOwner,\s*\}\);/);
  assert.match(room, /const activeCount = usersInRoom\.length;/);
  assert.match(room, /usersInRoom=\{usersInRoom\}/);
});
