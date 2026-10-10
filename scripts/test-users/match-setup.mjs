#!/usr/bin/env node
/**
 * Gets the seeded test users ready for Match in the venue, doing everything AS each user (their own session, never the server
 * key for the actions): 3 illustrated photos, a few interests, and the venue entry + Match check-in. NOT RUN by the assistant:
 * read scripts/test-users/README.md first.
 *
 *   node scripts/test-users/match-setup.mjs --dry-run                  # plan + requirements, touches nothing, needs no keys
 *   node scripts/test-users/match-setup.mjs --users 20 --photos 3 --wait 90
 *
 * What it does, per user (exactly what the app does, see mobile/services/matchProfile.ts and mobile/services/match.ts):
 *   1. Photos: downloads DiceBear ILLUSTRATIONS (lorelei, notionists, adventurer — drawings, never photos of real people) as WebP,
 *      uploads them to the private bucket `match-photos` at `{uid}/{uuid}.webp` (image/webp) and inserts the `match_photos` rows as
 *      'pending'. The normal moderation (trigger → Edge Function moderate-match-photo) decides; this script NEVER sets a status.
 *   2. Interests: picks a few neutral ones (only orders the deck; not required).
 *   3. Venue + Match: check_geofence_and_join_room with the venue position, then match_check_in. The check-in is also the Match
 *      opt-in (the server inserts game_optins itself). A script's coordinates are supplied, not sensed, so it sends p_mocked = true;
 *      the server then leaves the presence 'pending' until a venue QR is scanned. That is reported at the end, not bypassed.
 *   4. Waits for the moderation verdicts and prints the state.
 */
import { randomUUID } from 'node:crypto';
import {
  MATCH_STYLES, SCRIPT_LOCATION_IS_SIMULATED, adminClient, config, enterVenue, flag, isTestEmail, matchCheckIn, matchPhotoUrl, opt,
  pick, readCredentials, sleep, userClient,
} from './lib.mjs';

const dryRun = flag('dry-run');
const photosPerUser = Math.min(6, Math.max(1, Number(opt('photos', '3')) || 3));
const usersWanted = Math.max(0, Number(opt('users', '0')) || 0); // 0 = every seeded user
const waitSeconds = Math.max(0, Number(opt('wait', '90')) || 0);
const INTERESTS_PER_USER = 4;

/** What a user needs to appear in another user's Match deck (read from migrations 189–197 and the app). */
const REQUIREMENTS = [
  'Match switched ON at the venue by its owner (business_games.enabled for game "match"; match_enabled_for_business).',
  'Age confirmed (users.age_confirmed_at, rpc confirm_age; seed.mjs does it) and "play games" not turned off (settings.gamesEnabled, default true).',
  'Not kicked from Match at that venue (match_kicks).',
  'Inside the venue per the server: a live room_geo_presence row (check_geofence_and_join_room within the radius +25 m, TTL 10 min).',
  'An ACTIVE Match presence: match_check_in with a valid venue QR token, or GPS without a mocked flag; renewed at least every 15 min. ' +
    'Mocked/simulated location stays "pending" until a QR is scanned (migrations 196/197).',
  'Match opt-in for that venue (game_optins): inserted by match_check_in itself; there is no separate opt-in call. (The switch in the app is local.)',
  'At least ONE approved photo (match_photos.status = approved), set only by the moderation (Edge Function moderate-match-photo, Google Vision SafeSearch) or a superadmin review. Max 6 photos, bucket match-photos, path {uid}/{uuid}.webp, image/webp, ≤ 5 MB.',
  'Not blocked either way with the viewer, and not already swiped by the viewer; age filter ±1 year only if the viewer set matchAgeMin/Max and the candidate has a birth_year.',
  'Profile fields shown on the card (not required to be in the deck): display_name, username, avatar_url, bio, interests (interests only improve the order).',
  'To swipe, the viewer needs the same ACTIVE presence and the target must be in the same venue deck (match_swipe → not_in_same_venue otherwise).',
];

const saved = readCredentials();
let pool = saved.users.filter((u) => isTestEmail(u.email));
if (usersWanted > 0) pool = pool.slice(0, usersWanted);
if (pool.length === 0) {
  console.error('No seeded users in scripts/test-users/out/credentials.json (run seed.mjs first).');
  process.exit(1);
}
const venueSlug = opt('venue', saved.venue?.slug ?? 'bar-xzx');

function printRequirements() {
  console.log('\nWhat a user needs to appear in another user\'s Match deck:');
  REQUIREMENTS.forEach((line, i) => console.log(`  ${i + 1}. ${line}`));
}

if (dryRun) {
  console.log(`DRY RUN — ${pool.length} users in "${venueSlug}"; nothing is downloaded, uploaded or written.`);
  for (const u of pool) {
    const seeds = Array.from({ length: photosPerUser }, (_, i) => `${MATCH_STYLES[i % MATCH_STYLES.length]}:${u.username}-${MATCH_STYLES[i % MATCH_STYLES.length]}-${i}`);
    console.log(`  ${u.email}  photos → ${seeds.join('  ')}`);
  }
  console.log(`Per photo: GET https://api.dicebear.com/9.x/<style>/webp?size=512&seed=<seed> → upload match-photos/{uid}/{uuid}.webp (image/webp) → insert match_photos { user_id, path, sort, status: 'pending' }.`);
  console.log(`Per user: ${INTERESTS_PER_USER} neutral interests (if none), check_geofence_and_join_room(venue position), match_check_in(p_mocked = ${SCRIPT_LOCATION_IS_SIMULATED}).`);
  console.log(`Then wait up to ${waitSeconds}s for the moderation verdicts and report them (never set by this script).`);
  printRequirements();
  console.log('\nNothing was done.');
  process.exit(0);
}

const cfg = config();
const admin = adminClient(cfg);
const { data: venue } = await admin.from('businesses').select('id, name, slug, lat, lng').eq('slug', venueSlug).maybeSingle();
if (!venue) { console.error(`Venue "${venueSlug}" not found.`); process.exit(1); }
const { data: room } = await admin.from('rooms').select('id').eq('business_id', venue.id).eq('is_main', true).maybeSingle();
if (!room) { console.error('The venue has no main room.'); process.exit(1); }

const report = { photosUploaded: 0, photosFailed: 0, photosExisting: 0, interests: 0, checkins: {}, profileGaps: [] };
const tally = (obj, key) => { obj[key] = (obj[key] ?? 0) + 1; };

const sessions = [];
for (const u of pool) {
  const client = await userClient(cfg, admin, u);
  if (!client) { console.error(`  ! no session for ${u.email} — skipped`); continue; }
  sessions.push({ user: u, client });
}
if (sessions.length === 0) { console.error('No session could be opened.'); process.exit(1); }

// Is Match on at the venue? (owner's switch; this script never flips it)
const { data: matchOn } = await sessions[0].client.rpc('match_enabled_for_business', { p_business_id: venue.id });
if (matchOn !== true) console.log(`! Match is OFF at "${venue.name}" (the owner's switch, business_games). Check-ins will be denied with match_disabled.`);

// Interest catalog (neutral picks).
const { data: catalog } = await sessions[0].client.from('interests').select('key').eq('is_active', true);
const interestKeys = (catalog ?? []).map((r) => r.key);

console.log(`Preparing ${sessions.length} users for Match in "${venue.name}"…`);
for (const s of sessions) {
  const { user, client } = s;

  // 1. Photos — as the app: webp in {uid}/{uuid}.webp, row inserted 'pending', moderation decides.
  const { data: existing } = await client.from('match_photos').select('id').eq('user_id', user.id);
  const have = existing?.length ?? 0;
  report.photosExisting += have;
  for (let i = have; i < photosPerUser; i += 1) {
    const style = MATCH_STYLES[i % MATCH_STYLES.length];
    try {
      const res = await fetch(matchPhotoUrl(style, `${user.username}-${style}-${i}`));
      if (!res.ok) throw new Error(`DiceBear ${res.status}`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      const path = `${user.id}/${randomUUID()}.webp`;
      const { error: upError } = await client.storage.from('match-photos').upload(path, bytes, { contentType: 'image/webp', upsert: false });
      if (upError) throw upError;
      const { error: rowError } = await client.from('match_photos').insert({ user_id: user.id, path, sort: i, status: 'pending' });
      if (rowError) {
        await client.storage.from('match-photos').remove([path]).catch(() => undefined); // no orphan object, like the app
        throw rowError;
      }
      report.photosUploaded += 1;
    } catch (error) {
      report.photosFailed += 1;
      console.error(`  ! ${user.email}: photo ${i + 1} (${style}) failed: ${error.message ?? error.code}`);
    }
  }

  // 2. Interests (only orders the deck).
  const { data: mine } = await client.from('user_interests').select('interest_key').eq('user_id', user.id);
  if ((mine?.length ?? 0) === 0 && interestKeys.length > 0) {
    const chosen = [...new Set(Array.from({ length: INTERESTS_PER_USER * 2 }, () => pick(interestKeys)))].slice(0, INTERESTS_PER_USER);
    const { error } = await client.from('user_interests').insert(chosen.map((interest_key) => ({ user_id: user.id, interest_key })));
    if (error) console.error(`  ! ${user.email}: interests failed (${error.code ?? error.message})`);
    else report.interests += chosen.length;
  }

  // 3. Profile fields the card shows + age confirmation (read-only check; seed.mjs fills them).
  const { data: me } = await client.from('users').select('age_confirmed_at, bio, avatar_url, display_name').eq('id', user.id).maybeSingle();
  const gaps = [];
  if (!me?.age_confirmed_at) gaps.push('age_confirmed_at');
  if (!me?.bio) gaps.push('bio');
  if (!me?.avatar_url) gaps.push('avatar_url');
  if (!me?.display_name) gaps.push('display_name');
  if (gaps.length) report.profileGaps.push(`${user.email}: ${gaps.join(', ')}`);

  // 4. Venue + Match check-in (also the opt-in).
  const entered = await enterVenue(client, room, venue);
  if (!entered.granted) {
    tally(report.checkins, `venue-refused/${entered.code}`);
  } else {
    const result = await matchCheckIn(client, venue);
    tally(report.checkins, result.reason ? `${result.status}/${result.reason}` : result.status);
  }
  console.log(`  ✔ ${user.email}`);
  await sleep(300);
}

// 5. Moderation verdicts (never set here).
const verdicts = async () => {
  const total = { approved: 0, pending: 0, needs_review: 0, rejected: 0 };
  for (const s of sessions) {
    const { data } = await s.client.from('match_photos').select('status, needs_review').eq('user_id', s.user.id);
    for (const row of data ?? []) {
      if (row.status === 'pending' && row.needs_review) total.needs_review += 1;
      else total[row.status] = (total[row.status] ?? 0) + 1;
    }
  }
  return total;
};
let state = await verdicts();
const deadline = Date.now() + waitSeconds * 1000;
while (state.pending > 0 && Date.now() < deadline) {
  await sleep(10_000);
  state = await verdicts();
}

console.log('\nResult');
console.log(`  photos: ${report.photosUploaded} uploaded, ${report.photosFailed} failed, ${report.photosExisting} already there`);
console.log(`  moderation now: approved ${state.approved}, pending ${state.pending}, needs manual review ${state.needs_review}, rejected ${state.rejected}`);
console.log(`  interests added: ${report.interests}`);
console.log('  venue + match_check_in outcomes:');
for (const [key, n] of Object.entries(report.checkins).sort()) console.log(`    ${key}: ${n}`);
if (report.profileGaps.length) {
  console.log('  profile gaps:');
  for (const line of report.profileGaps) console.log(`    ${line}`);
}
if (Object.keys(report.checkins).some((k) => k.startsWith('pending'))) {
  console.log('\n! BLOCKED: the check-ins stayed "pending" (mocked_location). A script cannot honestly give what the server asks for an active');
  console.log('  Match presence: either a real GPS reading (no mocked flag) or a scanned venue QR. These users will NOT appear in the Match deck');
  console.log('  until that changes. Nothing was bypassed.');
}
printRequirements();
process.exit(0); // the clients may hold open sockets
