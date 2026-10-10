#!/usr/bin/env node
/**
 * Creates test users <name>NN@test.jchat.cloud (default 20) with a generated avatar, name, bio and a confirmed age (18+).
 * NOT RUN by the assistant: read scripts/test-users/README.md first.
 *
 *   node scripts/test-users/seed.mjs --dry-run                 # shows what would be created, touches nothing
 *   node scripts/test-users/seed.mjs --count 20 --venue bar-xzx
 *
 * Passwords are random and live only in scripts/test-users/out/credentials.json (git-ignored, chmod 600). Nothing secret is printed.
 */
import { randomBytes } from 'node:crypto';
import {
  FIRST_NAMES, BIOS, DOMAIN, adminClient, avatarUrl, config, flag, isTestEmail, opt, pick, readCredentials,
  slug, sleep, termsVersion, userClient, writeCredentials,
} from './lib.mjs';

const dryRun = flag('dry-run');
const count = Math.max(1, Math.min(200, Number(opt('count', '20')) || 20));
const venueSlug = opt('venue', 'bar-xzx');

const plan = Array.from({ length: count }, (_, i) => {
  const first = FIRST_NAMES[i % FIRST_NAMES.length];
  const n = String(i + 1).padStart(2, '0');
  return { first, n, email: `${slug(first)}${n}@${DOMAIN}`, username: `qa_${slug(first)}${n}` };
});

if (dryRun) {
  console.log(`DRY RUN — would create ${count} users on ${DOMAIN} (venue "${venueSlug}"):`);
  for (const p of plan) console.log(`  ${p.email}  (${p.first}, @${p.username})`);
  console.log('Nothing was created. Run again without --dry-run to apply.');
  process.exit(0);
}

const cfg = config();
const admin = adminClient(cfg);

// The venue must exist (simulate.mjs enters its main room).
const { data: venue, error: venueError } = await admin.from('businesses').select('id, name, slug').eq('slug', venueSlug).maybeSingle();
if (venueError || !venue) {
  console.error(`Venue with slug "${venueSlug}" not found.`);
  process.exit(1);
}

const saved = readCredentials();
const byEmail = new Map(saved.users.map((u) => [u.email, u]));
// Is the optional is_test column there (pending/215)? If not, the e-mail domain is the only marker.
const probe = await admin.from('users').select('is_test').limit(1);
const hasIsTest = !probe.error;
if (!hasIsTest) console.log('Note: users.is_test does not exist yet (pending/215_test_users_flag.sql); the @' + DOMAIN + ' domain is the marker.');

let created = 0;
let skipped = 0;
for (const p of plan) {
  if (!isTestEmail(p.email)) throw new Error('refusing a non-test e-mail');
  const known = byEmail.get(p.email);
  const password = known?.password ?? randomBytes(18).toString('base64url');

  let userId = known?.id ?? null;
  if (!userId) {
    const { data, error } = await admin.auth.admin.createUser({
      email: p.email,
      password,
      email_confirm: true,
      user_metadata: { display_name: p.first, username: p.username, is_test: true },
    });
    if (error) {
      // Already registered but not in credentials.json: set a fresh password and keep going.
      const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const existing = list?.users?.find((u) => u.email?.toLowerCase() === p.email);
      if (!existing) { console.error(`  ✘ ${p.email}: ${error.message}`); continue; }
      userId = existing.id;
      await admin.auth.admin.updateUserById(userId, { password });
    } else {
      userId = data.user.id;
      created += 1;
    }
  } else {
    skipped += 1;
  }

  // Profile row (created by the auth trigger): name, bio, avatar. The avatar is generated and re-hosted in our own bucket.
  const profile = { display_name: p.first, bio: pick(BIOS) };
  try {
    const res = await fetch(avatarUrl(`${p.username}`));
    if (res.ok) {
      const bytes = new Uint8Array(await res.arrayBuffer());
      const objectPath = `${userId}/avatar.png`;
      const { error: upError } = await admin.storage.from('avatars').upload(objectPath, bytes, { contentType: 'image/png', upsert: true });
      if (!upError) profile.avatar_url = admin.storage.from('avatars').getPublicUrl(objectPath).data.publicUrl;
    }
  } catch {
    // no avatar: the initials fallback of the app is used
  }
  if (hasIsTest) profile.is_test = true;
  const { error: profError } = await admin.from('users').update(profile).eq('id', userId);
  if (profError) console.error(`  ! ${p.email}: profile update failed (${profError.message})`);

  // Age confirmation AS the user (rpc confirm_age checks 18+ and stores only the birth year).
  const user = { id: userId, email: p.email, password, username: p.username, name: p.first };
  const client = await userClient(cfg, admin, user);
  if (client) {
    const year = 1985 + Math.floor(Math.random() * 15);
    const { error: ageError } = await client.rpc('confirm_age', { p_birth_date: `${year}-06-15`, p_terms_version: termsVersion() });
    if (ageError) console.error(`  ! ${p.email}: confirm_age failed (${ageError.message})`);
  } else {
    console.error(`  ! ${p.email}: could not open a session to confirm the age`);
  }

  byEmail.set(p.email, user);
  console.log(`  ✔ ${p.email}`);
  await sleep(250); // be gentle with the Auth API
}

writeCredentials({ venue: { id: venue.id, slug: venue.slug, name: venue.name }, users: [...byEmail.values()] });
console.log(`Done: ${created} created, ${skipped} already existed. Credentials: scripts/test-users/out/credentials.json (not printed).`);
