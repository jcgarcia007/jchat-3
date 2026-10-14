// JChat 3.0 — message + author profile (utils/messageProfiles.ts). Synthetic ids / names / urls only.
// Run: node scripts/message-profiles.test.mjs
import assert from 'node:assert/strict';
import { createProfileCache, settleOptimistic } from '../utils/messageProfiles.ts';

const ME = 'me-0000';
const ANA = 'ana-0001';
const BOB = 'bob-0002';
const msg = (id, user_id, extra = {}) => ({ id, user_id, body: id, ...extra });

function makeCache(profiles, { delay = 0, failTimes = 0 } = {}) {
  const calls = [];
  let failures = failTimes;
  const cache = createProfileCache(async (ids) => {
    calls.push([...ids]);
    if (delay) await new Promise((r) => setTimeout(r, delay));
    if (failures > 0) {
      failures -= 1;
      throw new Error('network');
    }
    return ids.filter((id) => profiles[id]).map((id) => ({ id, ...profiles[id] }));
  });
  return { cache, calls };
}

const PROFILES = {
  [ME]: { name: 'Test', avatar: 'https://img.example/me.jpg' },
  [ANA]: { name: 'Ana', avatar: 'https://img.example/ana.jpg' },
  [BOB]: { name: 'Bob', avatar: null },
};

// 1. Cache hit: a primed profile is applied at once and nothing is fetched.
{
  const { cache, calls } = makeCache(PROFILES);
  cache.prime(ANA, { name: 'Ana', avatar: 'https://img.example/ana.jpg' });
  await cache.ensure([ANA]);
  assert.equal(calls.length, 0, 'cache hit: no fetch');
  const out = cache.apply(msg('m1', ANA));
  assert.equal(out.sender_name, 'Ana');
  assert.equal(out.sender_avatar, 'https://img.example/ana.jpg');
}

// 2. Cache miss: the message is unchanged until the profile arrives, then ONE fetch fills it — even for 5 messages.
{
  const { cache, calls } = makeCache(PROFILES, { delay: 20 });
  const arrivals = [msg('a', ANA), msg('b', ANA), msg('c', ANA), msg('d', ANA), msg('e', ANA)];
  assert.equal(cache.apply(arrivals[0]).sender_avatar, undefined, 'before the lookup there is nothing to show yet');
  await Promise.all(arrivals.map((m) => cache.ensure([m.user_id])));
  assert.equal(calls.length, 1, 'five messages from the same user → a single request');
  assert.deepEqual(calls[0], [ANA]);
  for (const m of arrivals) assert.equal(cache.apply(m).sender_avatar, 'https://img.example/ana.jpg');
  await cache.ensure([ANA]);
  assert.equal(calls.length, 1, 'known now: never asked again');
}

// 3. Different users at once are batched; each user is asked once; in-flight users are not asked twice.
{
  const { cache, calls } = makeCache(PROFILES, { delay: 20 });
  const first = cache.ensure([ANA, BOB]);
  const second = cache.ensure([BOB, ME]); // BOB is already in flight
  await Promise.all([first, second]);
  assert.deepEqual(calls.map((c) => c.slice().sort()), [[ANA, BOB].sort(), [ME]]);
}

// 4. A person with no photo is remembered as such (avatar undefined, not re-fetched).
{
  const { cache, calls } = makeCache(PROFILES);
  await cache.ensure([BOB]);
  assert.equal(cache.known(BOB), true);
  const out = cache.apply(msg('x', BOB));
  assert.equal(out.sender_name, 'Bob');
  assert.equal(out.sender_avatar, undefined);
  await cache.ensure([BOB]);
  assert.equal(calls.length, 1);
}

// 5. A profile the server does not return is remembered too (no request per message); a FAILED lookup is not.
{
  const { cache, calls } = makeCache(PROFILES, { failTimes: 1 });
  await cache.ensure(['ghost-9999']);
  assert.equal(cache.known('ghost-9999'), false, 'a failed lookup is not remembered');
  await cache.ensure(['ghost-9999']);
  assert.equal(calls.length, 2, 'the next message retries');
  assert.equal(cache.known('ghost-9999'), true, 'answered without a row = no visible profile, remembered');
  await cache.ensure(['ghost-9999']);
  assert.equal(calls.length, 2);
}

// 6. Incognito senders are never decorated with the real profile; empty / null ids are ignored.
{
  const { cache, calls } = makeCache(PROFILES);
  cache.prime(ME, { name: 'Test', avatar: 'https://img.example/me.jpg' });
  const incognito = msg('i', ME, { sender_name: 'Nick' });
  assert.deepEqual(cache.apply(incognito, { incognito: true }), incognito);
  await cache.ensure([null, undefined, '']);
  assert.equal(calls.length, 0);
}

// 6b. A message flagged incognito in its own metadata gets NEITHER the real photo NOR the real name, even though the
// author's profile is in the cache (with or without the explicit option): the nickname / no-photo stays.
{
  const { cache } = makeCache(PROFILES);
  cache.prime(ANA, { name: 'Ana', avatar: 'https://img.example/ana.jpg' });
  const flagged = msg('inc-1', ANA, { metadata: { incognito: true, nickname: 'Nick' }, sender_name: 'Nick' });
  const out = cache.apply(flagged);
  assert.deepEqual(out, flagged, 'unchanged');
  assert.equal(out.sender_name, 'Nick');
  assert.equal(out.sender_avatar, undefined);
  assert.equal(cache.apply(flagged, { incognito: true }).sender_avatar, undefined);
  // The same author, not incognito, is decorated as usual.
  const normal = cache.apply(msg('inc-2', ANA, { metadata: { incognito: false } }));
  assert.equal(normal.sender_name, 'Ana');
  assert.equal(normal.sender_avatar, 'https://img.example/ana.jpg');
  const noMeta = cache.apply(msg('inc-3', ANA));
  assert.equal(noMeta.sender_avatar, 'https://img.example/ana.jpg');
}

// 7. My optimistic message is born with my photo and name (primed own profile) …
const { cache: own } = makeCache(PROFILES);
own.prime(ME, { name: 'Test', avatar: 'https://img.example/me.jpg' });
const optimistic = own.apply(msg('optimistic-1', ME, { body: 'hola' }));
assert.equal(optimistic.sender_avatar, 'https://img.example/me.jpg');
assert.equal(optimistic.sender_name, 'Test');

// … and keeps them when the server confirms it (the confirmed row is the bare messages row).
const confirmed = msg('real-1', ME, { body: 'hola' });
let list = settleOptimistic([msg('older', ANA), optimistic], 'optimistic-1', confirmed);
assert.deepEqual(list.map((m) => m.id), ['older', 'real-1']);
assert.equal(list[1].sender_avatar, 'https://img.example/me.jpg', 'the confirmed message keeps my photo');
assert.equal(list[1].sender_name, 'Test');

// A Realtime copy of my message that arrived first is dropped (no duplicate) and my photo survives.
list = settleOptimistic([own.apply(msg('real-1', ME)), optimistic, msg('older', ANA)], 'optimistic-1', confirmed);
assert.deepEqual(list.map((m) => m.id), ['real-1', 'older']);
assert.equal(list[0].sender_avatar, 'https://img.example/me.jpg');

// Incognito: the optimistic nickname is what stays.
const nick = { ...msg('optimistic-2', ME), sender_name: 'Nick' };
list = settleOptimistic([nick], 'optimistic-2', msg('real-2', ME));
assert.equal(list[0].sender_name, 'Nick');
assert.equal(list[0].sender_avatar, undefined);

// The optimistic row is gone (e.g. send failed and was removed): the confirmed row is not lost.
assert.deepEqual(settleOptimistic([msg('older', ANA)], 'optimistic-9', confirmed).map((m) => m.id), ['older']);

console.log('message profiles OK');
