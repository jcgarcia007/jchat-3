// Match entry is explicit (migration 256, audit B1-5 / B5-1 / B5-5): only Games → Match, "Go to Match" and the venue QR enrol; a GPS reading never does.
// Run from mobile/:  node --test scripts/match-join-venue.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const json = (lang, ns) => JSON.parse(read(`i18n/locales/${lang}/${ns}.json`));

/** services/matchPresence.ts with a fake server behind './match' (no React, no Supabase). */
function loadStore(server) {
  const js = ts.transpileModule(read('services/matchPresence.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const calls = { checkIn: 0, join: 0, joinArgs: [] };
  const fakeMatch = {
    matchCheckIn: async (params) => { calls.checkIn += 1; return server.checkIn(params); },
    matchJoinVenue: async (params) => { calls.join += 1; calls.joinArgs.push(params); return server.join(params); },
  };
  const mod = { exports: {} };
  const req = (name) => {
    if (name === './match') return fakeMatch;
    if (name === 'react') return { useSyncExternalStore: () => null };
    throw new Error(`unexpected import ${name}`);
  };
  new Function('module', 'exports', 'require', js)(mod, mod.exports, req);
  return { store: mod.exports, calls };
}

/** A tiny fake of the server's opt-in rule: check_in needs an opt-in, join creates it, leave removes it. */
function fakeServer() {
  const server = {
    optin: false,
    checkIn: async () => (server.optin ? { status: 'active', expires_at: 'x', method: 'geo' } : { status: 'denied', reason: 'not_joined' }),
    join: async () => { server.optin = true; return { status: 'active', expires_at: 'x', method: 'geo' }; },
    leave: () => { server.optin = false; },
  };
  return server;
}

const BIZ = 'b1';
const ROOM = 'r1';

test('B5-1: after leaving, GPS readings (heartbeats) never call match_join_venue and the person stays out', async () => {
  const server = fakeServer();
  const { store, calls } = loadStore(server);
  assert.equal(await store.joinMatchVenue(BIZ, ROOM), true, 'the explicit entry enrols');
  assert.equal(calls.join, 1);
  assert.equal(store.getMatchPresence().status, 'active');
  assert.equal(await store.runMatchCheckIn(BIZ, ROOM), true, 'the heartbeat renews');

  // "Leave Match": the server wipes the opt-in and the app resets its state (utils/matchLeave)
  server.leave();
  store.resetMatchPresence();
  assert.equal(store.getMatchPresence().status, 'idle');

  // three new GPS readings later: heartbeat only
  for (let i = 0; i < 3; i += 1) assert.equal(await store.runMatchCheckIn(BIZ, ROOM), false);
  assert.equal(calls.join, 1, 'no heartbeat ever calls match_join_venue');
  assert.equal(server.optin, false, 'nobody re-enrolled the person');
  assert.equal(store.getMatchPresence().status, 'not_joined', 'the store shows "at the venue, not in Match"');
  assert.equal(store.getMatchPresence().reason, null, 'not_joined is not a denial reason to show');
  assert.equal(store.getMatchPresence().error, false);

  // an explicit tap brings the person back
  assert.equal(await store.joinMatchVenue(BIZ, ROOM), true);
  assert.equal(calls.join, 2);
  assert.equal(server.optin, true);
});

test('joinMatchVenue sets "checking" synchronously (a Match screen opened right after never sees idle) and passes the GPS reading and mocked flag', async () => {
  const server = fakeServer();
  const { store, calls } = loadStore(server);
  store.setMatchReading({ lat: 40.1, lng: -74.2, mocked: true });
  const pending = store.joinMatchVenue(BIZ, ROOM);
  assert.equal(store.getMatchPresence().status, 'checking', 'set before the first await');
  await pending;
  assert.deepEqual(calls.joinArgs[0], { businessId: BIZ, lat: 40.1, lng: -74.2, qrToken: undefined, mocked: true });
  const withQr = loadStore(fakeServer());
  await withQr.store.joinMatchVenue(BIZ, ROOM, 'qr-token');
  assert.equal(withQr.calls.joinArgs[0].qrToken, 'qr-token', 'the venue QR goes through the join');
});

test('a heartbeat that was in flight when the person left does not bring the state back (stale answer dropped)', async () => {
  const server = fakeServer();
  server.optin = true;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  server.checkIn = async () => { await gate; return { status: 'active', expires_at: 'x', method: 'geo' }; };
  const { store } = loadStore(server);
  const heartbeat = store.runMatchCheckIn(BIZ, ROOM);
  store.resetMatchPresence(); // leave happens while the heartbeat is in flight
  release();
  assert.equal(await heartbeat, false);
  assert.equal(store.getMatchPresence().status, 'idle', 'the old answer (active) did not undo the leave');
});

test('a failed join (network) shows the generic "not available" state and can be retried; a denied join keeps the server reason', async () => {
  const failing = loadStore({ ...fakeServer(), join: async () => { throw new Error('network'); } });
  assert.equal(await failing.store.joinMatchVenue(BIZ, ROOM), false);
  assert.equal(failing.store.getMatchPresence().status, 'denied');
  assert.equal(failing.store.getMatchPresence().error, true);
  const denied = loadStore({ ...fakeServer(), join: async () => ({ status: 'denied', reason: 'not_in_venue' }) });
  assert.equal(await denied.store.joinMatchVenue(BIZ, ROOM), false);
  assert.equal(denied.store.getMatchPresence().reason, 'not_in_venue');
});

test('wiring: matchJoinVenue / joinMatchVenue / joinMatchWithQr are called ONLY from the explicit entries', () => {
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  const chat = strip(read('screens/chat/ChatRoomScreen.tsx'));
  assert.match(chat, /if \(key === 'match'\) \{\s*void joinMatchVenue\(matchBusinessId, rootRoomId\);\s*navigation\.navigate\('MatchHome'/);
  assert.match(chat, /void joinMatchWithQr\(token\)/);
  assert.match(strip(read('screens/match/MatchHomeScreen.tsx')), /void joinMatchWithQr\(token\)/);
  assert.match(strip(read('screens/match/MatchMyProfileScreen.tsx')), /void joinMatchVenue\(session\.businessId, session\.roomId\);\s*navigation\.navigate\('MatchHome'/);
  for (const f of ['hooks/useMatchPresence.ts', 'context/VenueSessionContext.tsx', 'utils/matchLeave.ts', 'hooks/useRequireMatchPresence.ts']) {
    assert.doesNotMatch(strip(read(f)), /joinMatch|matchJoinVenue/, `${f} never enrols the person`);
  }
  assert.match(strip(read('hooks/useMatchPresence.ts')), /runMatchCheckIn\(businessId, roomId\)/, 'the heartbeat is match_check_in');
  assert.match(strip(read('context/VenueSessionContext.tsx')), /runMatchCheckIn\(current\.businessId, current\.roomId\)/);
  // the only RPC callers
  const service = strip(read('services/match.ts'));
  assert.match(service, /callPresenceRpc\('match_join_venue', params\)/);
  assert.match(service, /callPresenceRpc\('match_check_in', params\)/);
});

test('a Match screen that finds "not_joined" goes back to the tabs with the usual notice', () => {
  const hook = read('hooks/useRequireMatchPresence.ts');
  assert.match(hook, /const notJoined = sameVenue && presence\.status === 'not_joined'/);
  assert.match(hook, /if \(notJoined\) \(navigation as unknown as \{ navigate: \(name: string\) => void \}\)\.navigate\('Tabs'\)/);
  assert.match(hook, /showAlert\(t\('presence\.requiredTitle'\), t\('presence\.required'\)\)/);
});

test('B5-5: the button and the warning say "Salir de Match" / "Leave Match" (not "the venue"), still say what is deleted, and Leave goes back to the chat', () => {
  const es = json('es', 'match').leave;
  const en = json('en', 'match').leave;
  assert.equal(es.button, 'Salir de Match');
  assert.equal(en.button, 'Leave Match');
  assert.equal(es.confirm, 'Salir de Match');
  assert.equal(en.confirm, 'Leave Match');
  assert.match(es.title, /Match/);
  assert.match(en.title, /Match/);
  assert.match(es.body, /likes, matches y chats/);
  assert.match(en.body, /likes, matches and chats/);
  assert.match(es.body, /sigues en el chat del local/);
  assert.match(en.body, /stay in the venue's chat/);
  assert.doesNotMatch(JSON.stringify(es), /Salir del local/);
  assert.doesNotMatch(JSON.stringify(en), /Leave the venue/);
  assert.deepEqual(Object.keys(es).sort(), Object.keys(en).sort(), 'es = en keys');
  assert.match(read('screens/match/MatchHomeScreen.tsx'), /onLeft: \(\) => \(navigation\.canGoBack\(\) \? navigation\.goBack\(\) : navigation\.navigate\('Tabs'\)\)/);
  // B3-4: the chat's "Salir del local" warning now says it also leaves Match
  assert.match(json('es', 'chat').venueSession.leaveConfirmBody, /también saldrás de Match/);
  assert.match(json('en', 'chat').venueSession.leaveConfirmBody, /leave Match too/);
});
