/**
 * JChat Match — seed of 20 test profiles (seed01@jchat.test … seed20@jchat.test).
 *
 * Reads SUPABASE_URL and SB_SECRET_KEY (or the legacy SUPABASE_SERVICE_ROLE_KEY) from the environment (never from code/git).
 * Idempotent: a seedNN user that already exists is skipped entirely.
 *
 *   SUPABASE_URL=... SB_SECRET_KEY=... node seed.mjs
 */

import { randomBytes, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SB_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error('Missing SUPABASE_URL or SB_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) in the environment.');
  process.exit(1);
}

const BUSINESS_ID = '0478b8d5-5217-4369-9fa2-128dbe5b38f8'; // Bar XZX
const TEST_USER = 'a613d6a9-b798-41b0-8f8f-9b4e88ed7083'; // "test"
const TEST1_USER = '0b4895d0-5dc5-4c7f-8303-52748d0fe823'; // "test1"
const TOTAL = 20;
const BUCKET = 'match-photos';

const supabase = createClient(URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const NAMES = [
  'Valentina', 'Mateo', 'Camila', 'Santiago', 'Sofía', 'Diego', 'Lucía', 'Andrés', 'Emma', 'Liam',
  'Olivia', 'Noah', 'Isabella', 'Lucas', 'Mia', 'Ethan', 'Daniela', 'Sebastián', 'Ava', 'Jack',
];
const BIOS_ES = [
  'Me gusta el café, los viajes y las buenas conversaciones.',
  'Fan del fútbol y de los domingos de playa.',
  'Cocino mejor de lo que bailo, pero bailo igual.',
  'Busco buena música y gente con quien reír.',
  'Perro, libros y un buen vino. Sin drama.',
  'Aprendiendo a hacer fotos y a no perderme.',
  'Gym por la mañana, tacos por la noche.',
  'Soy de los que se quedan hasta el último tema.',
  'Cine de autor, series de domingo.',
  'Me encanta descubrir bares nuevos.',
];
const BIOS_EN = [
  'Coffee, travel and good conversations.',
  'Football fan and Sunday beach person.',
  'I cook better than I dance, but I dance anyway.',
  'Here for good music and people who make me laugh.',
  'Dogs, books and a nice glass of wine. No drama.',
  'Learning photography and how not to get lost.',
  'Gym in the morning, tacos at night.',
  'The one who stays until the last song.',
  'Indie movies and Sunday TV shows.',
  'I love finding new bars.',
];

const pad = (n) => String(n).padStart(2, '0');
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const randInt = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
const shuffle = (list) => [...list].sort(() => Math.random() - 0.5);

async function existingSeedEmails() {
  const emails = new Map();
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    for (const u of data.users) if (u.email?.endsWith('@jchat.test')) emails.set(u.email, u.id);
    if (data.users.length < 1000) break;
  }
  return emails;
}

/** Illustrated avatar (DiceBear), never a real person's photo. Returns a Buffer or null. */
async function fetchAvatar(seed, style) {
  const url = `https://api.dicebear.com/9.x/${style}/png?seed=${encodeURIComponent(seed)}&size=512`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

async function main() {
  const { data: interests, error: interestsError } = await supabase.from('interests').select('key').eq('is_active', true);
  if (interestsError) throw interestsError;
  const interestKeys = (interests ?? []).map((r) => r.key);
  if (interestKeys.length < 6) throw new Error('interests catalog looks empty');

  const existing = await existingSeedEmails();
  const now = new Date();
  const nowIso = now.toISOString();
  const expiresIso = new Date(now.getTime() + 12 * 60 * 60 * 1000).toISOString();

  const created = [];
  let skipped = 0;

  for (let i = 1; i <= TOTAL; i += 1) {
    const nn = pad(i);
    const email = `seed${nn}@jchat.test`;
    const username = `seed_${nn}`;
    if (existing.has(email)) {
      skipped += 1;
      continue;
    }

    const language = i % 2 === 0 ? 'en' : 'es';
    const displayName = NAMES[i - 1];
    const bio = pick(language === 'es' ? BIOS_ES : BIOS_EN);

    const { data: auth, error: authError } = await supabase.auth.admin.createUser({
      email,
      password: randomBytes(24).toString('base64url'),
      email_confirm: true,
    });
    if (authError) {
      console.error(`✗ ${email}: ${authError.message}`);
      continue;
    }
    const userId = auth.user.id;

    // public.users row (a trigger usually creates it; upsert covers the case it does not).
    const profile = {
      display_name: displayName,
      username,
      bio,
      language,
      birth_year: randInt(1975, 2004),
      age_confirmed_at: nowIso,
      terms_accepted_at: nowIso,
      terms_version: '2026-10',
    };
    const { data: updated, error: updateError } = await supabase.from('users').update(profile).eq('id', userId).select('id');
    if (updateError) throw new Error(`${email}: users update failed: ${updateError.message}`);
    if (!updated || updated.length === 0) {
      const { error: insertError } = await supabase.from('users').upsert({ id: userId, ...profile }, { onConflict: 'id' });
      if (insertError) throw new Error(`${email}: users insert failed: ${insertError.message}`);
    }

    // Interests: 3–6 random keys.
    const picked = shuffle(interestKeys).slice(0, randInt(3, 6));
    const { error: interestError } = await supabase
      .from('user_interests')
      .insert(picked.map((interest_key) => ({ user_id: userId, interest_key })));
    if (interestError) throw new Error(`${email}: interests failed: ${interestError.message}`);

    // Photos: 1–2 illustrated avatars, already approved.
    const photoCount = randInt(1, 2);
    let uploaded = 0;
    for (let p = 0; p < photoCount; p += 1) {
      const style = p === 0 ? 'notionists' : 'adventurer';
      const png = await fetchAvatar(`${username}${p === 0 ? '' : '_2'}`, style);
      if (!png) {
        console.warn(`  ! ${email}: avatar ${p + 1} could not be downloaded`);
        continue;
      }
      const path = `${userId}/${randomUUID()}.png`;
      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, png, { contentType: 'image/png', upsert: false });
      if (uploadError) {
        console.warn(`  ! ${email}: upload failed: ${uploadError.message}`);
        continue;
      }
      const { error: photoError } = await supabase.from('match_photos').insert({
        user_id: userId,
        path,
        sort: uploaded,
        status: 'approved',
        reviewed_at: nowIso,
        moderated_at: nowIso,
        needs_review: false,
        moderation: { seed: true },
      });
      if (photoError) {
        await supabase.storage.from(BUCKET).remove([path]);
        console.warn(`  ! ${email}: photo row failed: ${photoError.message}`);
        continue;
      }
      uploaded += 1;
    }

    // Presence at Bar XZX (strong check-in via "qr", valid for 12 hours).
    const { error: optinError } = await supabase
      .from('game_optins')
      .upsert({ user_id: userId, business_id: BUSINESS_ID, game_key: 'match' }, { onConflict: 'user_id,business_id,game_key' });
    if (optinError) throw new Error(`${email}: game_optins failed: ${optinError.message}`);
    const { error: presenceError } = await supabase.from('match_presence').upsert(
      {
        user_id: userId,
        business_id: BUSINESS_ID,
        active_since: nowIso,
        entered_at: nowIso,
        last_seen_at: nowIso,
        expires_at: expiresIso,
        method: 'qr',
        readings: 1,
        mocked: false,
      },
      { onConflict: 'user_id,business_id' },
    );
    if (presenceError) throw new Error(`${email}: match_presence failed: ${presenceError.message}`);

    created.push({ index: i, userId, email, photos: uploaded });
    console.log(`✓ ${email} (${displayName}, ${picked.length} interests, ${uploaded} photos)`);
  }

  // Likes toward the test accounts: seeds 1–5 → test (seed 1 is a super like),
  // seeds 6–10 → test1 (seed 6 is a super like). Only for seeds created in this run.
  const likePlan = [
    ...[1, 2, 3, 4, 5].map((index) => ({ index, target: TEST_USER, action: index === 1 ? 'super' : 'like' })),
    ...[6, 7, 8, 9, 10].map((index) => ({ index, target: TEST1_USER, action: index === 6 ? 'super' : 'like' })),
  ];
  let likes = 0;
  for (const plan of likePlan) {
    const seed = created.find((c) => c.index === plan.index);
    if (!seed) continue;
    const { data: swipe, error: swipeError } = await supabase
      .from('match_swipes')
      .upsert(
        { business_id: BUSINESS_ID, swiper_id: seed.userId, target_id: plan.target, action: plan.action },
        { onConflict: 'business_id,swiper_id,target_id' },
      )
      .select('id')
      .single();
    if (swipeError) {
      console.warn(`  ! like from ${seed.email} failed: ${swipeError.message}`);
      continue;
    }
    const { error: notificationError } = await supabase.from('notifications').insert({
      user_id: plan.target,
      type: plan.action === 'super' ? 'match_super' : 'match_like',
      payload: { business_id: BUSINESS_ID, from_user_id: seed.userId, swipe_id: swipe.id },
    });
    if (notificationError) console.warn(`  ! notification for ${seed.email} failed: ${notificationError.message}`);
    likes += 1;
  }

  console.log(`\nDone: ${created.length} users created, ${skipped} already existed, ${likes} likes sent.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
