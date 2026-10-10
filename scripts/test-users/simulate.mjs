#!/usr/bin/env node
/**
 * Makes the seeded test users behave like people: they enter the venue, show up in the venue chat's online bar, write in its
 * chat, send each other DMs, publish, like and (optionally) swipe in Match. NOT RUN by the assistant: read
 * scripts/test-users/README.md first.
 *
 *   node scripts/test-users/simulate.mjs --dry-run                       # plan only
 *   node scripts/test-users/simulate.mjs --minutes 10 --users 8 --actions chat,dm,post,like
 *   node scripts/test-users/simulate.mjs --minutes 15 --users 20 --actions chat,swipe
 *
 * Every action is done AS the user (their own session, never the server key), so RLS and the server rules apply exactly as in
 * the apps: a refused action (cooldown, privacy, presence, rate limit…) is counted and reported, never worked around. The venue
 * coordinates are sent to the geofence RPC like the apps send the GPS fix. Nothing secret is printed.
 *
 * Online bar: unless --no-presence, each user joins the shared Realtime channel `presence:<main room id>` and tracks the same
 * payload a phone does ({ user_id, display_name, avatar_url, is_incognito, nickname }); the bar of the venue chat is built from that
 * channel. They stay in the bar while this script runs and leave when it ends.
 *
 * Match (action "swipe"): the Match check-in is renewed every few minutes for as long as the simulation lasts. The coordinates of a
 * script are supplied, not sensed, so the check-in says so (p_mocked = true, see lib.mjs): the server then keeps the Match presence
 * 'pending' until a venue QR is scanned, and the deck needs an active presence. The owner can hand over the real QR of the venue's
 * main room: put the URL (https://jchat.cloud/c/<token>) or the bare token in the JCHAT_QR_TOKEN environment variable (never as an
 * argument; it is never printed) and every Match check-in sends it as p_qr_token. Without it the outcomes are reported, not bypassed.
 * The Match presence expires after 15 min, so this script renews the check-in every 4 min while it runs.
 */
import {
  CHAT_LINES, DM_LINES, POST_LINES, adminClient, config, enterVenue, flag, isTestEmail, joinVenuePresence, matchCheckIn, opt,
  pick, presencePayload, qrTokenFromEnv, qrTokenStatus, readCredentials, sleep, userClient,
} from './lib.mjs';

const dryRun = flag('dry-run');
const withPresence = !flag('no-presence');
const minutes = Math.max(1, Number(opt('minutes', '5')) || 5);
const usersWanted = Math.max(2, Number(opt('users', '8')) || 8);
const actions = (opt('actions', 'chat,dm,post,like') ?? '').split(',').map((a) => a.trim()).filter(Boolean);
const minGap = Number(opt('min-gap', '3000'));
const maxGap = Number(opt('max-gap', '9000'));
const KEEPALIVE_MS = 4 * 60_000; // geofence presence lasts 10 min, Match presence 15 min: renew well before
const LIKE_REAL = 0.85; // chance of a like when the card is a REAL account (is_test = false), so test/test1 receive matches
const LIKE_TEST = 0.35; // chance of a like between two test accounts

const saved = readCredentials();
const pool = saved.users.filter((u) => isTestEmail(u.email)).slice(0, usersWanted);
if (pool.length < 2) {
  console.error('Need at least 2 seeded users in scripts/test-users/out/credentials.json (run seed.mjs first).');
  process.exit(1);
}
const venueSlug = opt('venue', saved.venue?.slug ?? 'bar-xzx-omd2');
// The venue's QR token, handed over by the owner through the environment (never an argument, never printed).
const qrToken = qrTokenFromEnv();

const unknownActions = actions.filter((a) => !['chat', 'dm', 'post', 'like', 'swipe'].includes(a));
if (unknownActions.length) { console.error(`Unknown actions: ${unknownActions.join(', ')}`); process.exit(1); }

if (dryRun) {
  console.log(`DRY RUN — ${pool.length} users would act for ${minutes} min in "${venueSlug}" with actions: ${actions.join(', ')}.`);
  console.log(`Users: ${pool.map((u) => u.email).join(', ')}`);
  console.log(`Online bar: ${withPresence ? 'each user would join presence:<main room id> and track { user_id, display_name, avatar_url, is_incognito, nickname }' : 'off (--no-presence)'}.`);
  console.log(`Keep-alive every ${KEEPALIVE_MS / 60_000} min: check_geofence_and_join_room${actions.includes('swipe') ? ' + match_check_in (p_mocked = true: the coordinates are supplied by a script)' : ''}.`);
  if (actions.includes('swipe')) {
    console.log(`QR token: ${qrTokenStatus(qrToken)}${qrToken ? ' (sent as p_qr_token on every Match check-in)' : ' — without it the Match presence stays pending and the deck stays closed'}.`);
    console.log(`Swipe: match_get_deck → like with p(${LIKE_REAL}) on real accounts (is_test = false) and p(${LIKE_TEST}) on test accounts, otherwise pass; never super.`);
  }
  console.log('Nothing was done.');
  process.exit(0);
}

const cfg = config();
const admin = adminClient(cfg);
const { data: venue } = await admin.from('businesses').select('id, name, slug, lat, lng').eq('slug', venueSlug).maybeSingle();
if (!venue) { console.error(`Venue "${venueSlug}" not found.`); process.exit(1); }
const { data: room } = await admin.from('rooms').select('id').eq('business_id', venue.id).eq('is_main', true).maybeSingle();
if (!room) { console.error('The venue has no main room.'); process.exit(1); }

const stats = {};
const count = (action, outcome) => {
  const key = `${action}:${outcome}`;
  stats[key] = (stats[key] ?? 0) + 1;
};

// One signed-in client per user (their own session; RLS applies).
const sessions = [];
for (const u of pool) {
  const client = await userClient(cfg, admin, u);
  if (!client) { console.error(`  ! no session for ${u.email} — skipped`); continue; }
  sessions.push({ user: u, client, entered: false, channel: null, payload: null });
}
if (sessions.length < 2) { console.error('Fewer than 2 sessions could be opened.'); process.exit(1); }

// Everything the swipe action did, printed at the end: Match deletes a user's swipes at the venue when their presence expires,
// so afterwards there is nothing left to review.
const swipeLog = { like: { real: 0, test: 0 }, pass: { real: 0, test: 0 }, already: 0, errors: {}, matches: [] };

// Which cards are test accounts? credentials.json knows the seeded ones; users.is_test (when the column exists) also covers others.
const testIds = new Set(saved.users.map((u) => u.id));
async function markTestCards(cards) {
  const unknown = cards.map((c) => c.id).filter((id) => !testIds.has(id));
  if (unknown.length === 0) return;
  const { data, error } = await admin.from('users').select('id, is_test').in('id', unknown);
  if (error) return; // no is_test column: only the credentials list counts as "test"
  for (const row of data ?? []) if (row.is_test === true) testIds.add(row.id);
}

/** Enter the venue (geofence), publish the presence on the online bar and renew the Match check-in. Safe to repeat. */
async function keepAlive(s) {
  const entered = await enterVenue(s.client, room, venue);
  s.entered = entered.granted;
  s.enteredAt = Date.now();
  count('enter', entered.code);
  if (!entered.granted) return;

  if (withPresence) {
    s.payload ??= await presencePayload(s.client, s.user.id);
    if (!s.channel || s.channel.state !== 'joined') {
      if (s.channel) { try { await s.client.removeChannel(s.channel); } catch { /* already gone */ } }
      s.channel = await joinVenuePresence(s.client, room.id, s.payload);
      count('presence', s.channel ? 'joined' : 'failed');
    } else {
      await s.channel.track(s.payload); // re-emit, like the app does on foreground
    }
  }

  if (actions.includes('swipe')) {
    const result = await matchCheckIn(s.client, venue, qrToken);
    s.matchStatus = result.status;
    count('match-checkin', result.reason ? `${result.status}/${result.reason}` : result.status);
  }
}

const doAction = {
  async chat(s) {
    const { error } = await s.client.from('messages').insert({ room_id: room.id, user_id: s.user.id, body: pick(CHAT_LINES), type: 'text', is_system: false, metadata: {} });
    count('chat', error ? (error.code ?? 'error') : 'ok');
  },
  async dm(s) {
    const other = pick(sessions.filter((x) => x.user.id !== s.user.id));
    const { data: conv, error } = await s.client.rpc('start_dm', { p_target_id: other.user.id });
    if (error || !conv?.id) { count('dm', error?.code ?? 'no-conversation'); return; }
    const { error: sendError } = await s.client.from('dm_messages').insert({ conversation_id: conv.id, sender_id: s.user.id, body: pick(DM_LINES) });
    count('dm', sendError ? (sendError.code ?? 'error') : 'ok');
  },
  async post(s) {
    const { error } = await s.client.from('posts').insert({ user_id: s.user.id, caption: pick(POST_LINES), media_urls: [] });
    count('post', error ? (error.code ?? 'error') : 'ok');
  },
  async like(s) {
    const { data: posts } = await s.client.from('posts').select('id').order('created_at', { ascending: false }).limit(20);
    if (!posts?.length) { count('like', 'no-posts'); return; }
    const { error } = await s.client.from('post_likes').insert({ post_id: pick(posts).id, user_id: s.user.id });
    count('like', error ? (error.code ?? 'error') : 'ok');
  },
  /** Match: ask for my deck and like/pass one card at random (real accounts get liked more, so test/test1 receive matches). */
  async swipe(s) {
    const { data: deck, error } = await s.client.rpc('match_get_deck', { p_business_id: venue.id, p_limit: 20 });
    if (error) { count('swipe', `deck:${error.code ?? 'error'}`); return; } // e.g. 42501 not_present: no ACTIVE Match presence
    const cards = Array.isArray(deck) ? deck : [];
    if (cards.length === 0) { count('swipe', 'deck:empty'); return; }
    await markTestCards(cards);
    const card = pick(cards);
    const isTest = testIds.has(card.id);
    const action = Math.random() < (isTest ? LIKE_TEST : LIKE_REAL) ? 'like' : 'pass';
    const { data, error: swipeError } = await s.client.rpc('match_swipe', { p_business_id: venue.id, p_target_id: card.id, p_action: action });
    if (swipeError) {
      const code = swipeError.code ?? 'error';
      swipeLog.errors[code] = (swipeLog.errors[code] ?? 0) + 1;
      count('swipe', `${action}:${code}`);
      return;
    }
    const who = isTest ? 'test' : 'real';
    if (data?.swiped === false) swipeLog.already += 1;
    else swipeLog[action][who] += 1;
    if (data?.swiped !== false && data?.is_match) {
      swipeLog.matches.push({ by: s.user.username, with: card.username || card.display_name || card.id.slice(0, 8), real: !isTest });
    }
    count('swipe', `${action}-${who}:${data?.swiped === false ? 'already' : data?.is_match ? 'match' : 'ok'}`);
  },
};

console.log(`Simulating ${sessions.length} users for ${minutes} min in "${venue.name}"…`);
await Promise.all(sessions.map(keepAlive));
const inside = sessions.filter((s) => s.entered).length;
console.log(`  ${inside}/${sessions.length} users inside the venue${withPresence ? `, ${sessions.filter((s) => s.channel).length} on the online bar` : ''}.`);

// Keep presence alive for the whole run (geofence, online bar and Match check-in), independently of which user acts next.
const keepAliveTimer = setInterval(() => { void Promise.all(sessions.map(keepAlive)); }, KEEPALIVE_MS);

const end = Date.now() + minutes * 60_000;
while (Date.now() < end) {
  const s = pick(sessions);
  if (!s.entered) await keepAlive(s);
  if (s.entered) await doAction[pick(actions)](s);
  await sleep(minGap + Math.random() * Math.max(0, maxGap - minGap));
}

clearInterval(keepAliveTimer);
for (const s of sessions) {
  if (s.channel) { try { await s.channel.untrack(); await s.client.removeChannel(s.channel); } catch { /* socket already gone */ } }
}

console.log('Done. Outcomes (action:result → count; a code is the server refusing, which is expected sometimes):');
for (const [key, n] of Object.entries(stats).sort()) console.log(`  ${key}: ${n}`);

if (actions.includes('swipe')) {
  // Printed NOW, while the presence is still alive: Match wipes the swipes of a user at the venue shortly after it expires.
  console.log('\nMatch summary (this run):');
  console.log(`  likes:  ${swipeLog.like.real} to real accounts, ${swipeLog.like.test} to test accounts`);
  console.log(`  passes: ${swipeLog.pass.real} to real accounts, ${swipeLog.pass.test} to test accounts`);
  console.log(`  already swiped (refused by the server): ${swipeLog.already}`);
  const errorCodes = Object.entries(swipeLog.errors);
  if (errorCodes.length) console.log(`  swipe errors: ${errorCodes.map(([code, n]) => `${code} ×${n}`).join(', ')}`);
  const withReal = swipeLog.matches.filter((m) => m.real).length;
  console.log(`  matches created by these swipes: ${swipeLog.matches.length} (${withReal} with real accounts, ${swipeLog.matches.length - withReal} between test accounts)`);
  for (const m of swipeLog.matches) console.log(`    ${m.by} ↔ ${m.with}${m.real ? '  (real account)' : ''}`);

  // What Match itself holds right now for each simulated user (match_get_activity, as that user).
  let likedMe = 0;
  let matchRows = 0;
  let unavailable = 0;
  for (const s of sessions) {
    const { data, error } = await s.client.rpc('match_get_activity', { p_business_id: venue.id });
    if (error || !data) { unavailable += 1; continue; }
    likedMe += Array.isArray(data.liked_me) ? data.liked_me.length : 0;
    matchRows += Array.isArray(data.matches) ? data.matches.length : 0;
  }
  console.log(`  Match activity now (all simulated users): ${likedMe} "liked me", ${matchRows} match rows${unavailable ? ` (${unavailable} users could not be read)` : ''}`);
}
process.exit(0); // the Realtime sockets would otherwise keep the process alive
