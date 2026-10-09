#!/usr/bin/env node
/**
 * Makes the seeded test users behave like people: they enter the venue, write in its chat, send each other DMs, publish
 * and like. NOT RUN by the assistant: read scripts/test-users/README.md first.
 *
 *   node scripts/test-users/simulate.mjs --dry-run                       # plan only
 *   node scripts/test-users/simulate.mjs --minutes 10 --users 8 --actions chat,dm,post,like
 *
 * Every action is done AS the user (their own session), so RLS and the server rules apply exactly as in the apps: a refused
 * action (cooldown, privacy, presence, rate limit…) is counted and reported, never worked around. The venue coordinates are
 * sent to the geofence RPC like the apps send the GPS fix. Nothing secret is printed.
 */
import {
  CHAT_LINES, DM_LINES, POST_LINES, adminClient, config, flag, isTestEmail, opt, pick, readCredentials, sleep, userClient,
} from './lib.mjs';

const dryRun = flag('dry-run');
const minutes = Math.max(1, Number(opt('minutes', '5')) || 5);
const usersWanted = Math.max(2, Number(opt('users', '8')) || 8);
const actions = (opt('actions', 'chat,dm,post,like') ?? '').split(',').map((a) => a.trim()).filter(Boolean);
const minGap = Number(opt('min-gap', '3000'));
const maxGap = Number(opt('max-gap', '9000'));

const saved = readCredentials();
const pool = saved.users.filter((u) => isTestEmail(u.email)).slice(0, usersWanted);
if (pool.length < 2) {
  console.error('Need at least 2 seeded users in scripts/test-users/out/credentials.json (run seed.mjs first).');
  process.exit(1);
}
const venueSlug = opt('venue', saved.venue?.slug ?? 'bar-xzx');

if (dryRun) {
  console.log(`DRY RUN — ${pool.length} users would act for ${minutes} min in "${venueSlug}" with actions: ${actions.join(', ')}.`);
  console.log(`Users: ${pool.map((u) => u.email).join(', ')}`);
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
  sessions.push({ user: u, client, entered: false });
}
if (sessions.length < 2) { console.error('Fewer than 2 sessions could be opened.'); process.exit(1); }

/** Enter the venue like the app does (geofence RPC with the venue position). Re-done every few minutes (the presence TTL). */
async function enter(s) {
  const { data, error } = await s.client.rpc('check_geofence_and_join_room', { _room_id: room.id, _lat: venue.lat, _lng: venue.lng });
  const granted = !error && Array.isArray(data) && data[0]?.access_granted === true;
  s.entered = granted;
  s.enteredAt = Date.now();
  count('enter', granted ? 'ok' : (error?.code ?? 'refused'));
  return granted;
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
};

const unknown = actions.filter((a) => !doAction[a]);
if (unknown.length) { console.error(`Unknown actions: ${unknown.join(', ')}`); process.exit(1); }

console.log(`Simulating ${sessions.length} users for ${minutes} min in "${venue.name}"…`);
const end = Date.now() + minutes * 60_000;
while (Date.now() < end) {
  const s = pick(sessions);
  if (!s.entered || Date.now() - (s.enteredAt ?? 0) > 4 * 60_000) await enter(s);
  if (s.entered) await doAction[pick(actions)](s);
  await sleep(minGap + Math.random() * Math.max(0, maxGap - minGap));
}

console.log('Done. Outcomes (action:result → count; a code is the server refusing, which is expected sometimes):');
for (const [key, n] of Object.entries(stats).sort()) console.log(`  ${key}: ${n}`);
