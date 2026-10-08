/**
 * JChat Match — removes EVERYTHING of the test users (…@jchat.test).
 *
 * Reads SUPABASE_URL and SB_SECRET_KEY from the environment (never from code/git).
 * For each @jchat.test user: Match notifications they caused, their objects in the match-photos
 * bucket ('{user_id}/'), and the auth user itself (public rows cascade).
 *
 *   SUPABASE_URL=... SB_SECRET_KEY=... node cleanup.mjs
 */

import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SB_SECRET_KEY;
if (!URL || !KEY) {
  console.error('Missing SUPABASE_URL or SB_SECRET_KEY in the environment.');
  process.exit(1);
}

const BUCKET = 'match-photos';
const supabase = createClient(URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } });

async function testUsers() {
  const users = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    for (const u of data.users) if (u.email?.endsWith('@jchat.test')) users.push({ id: u.id, email: u.email });
    if (data.users.length < 1000) break;
  }
  return users;
}

async function removeUserObjects(userId) {
  let removed = 0;
  for (;;) {
    const { data, error } = await supabase.storage.from(BUCKET).list(userId, { limit: 1000 });
    if (error) throw error;
    if (!data || data.length === 0) break;
    const paths = data.map((f) => `${userId}/${f.name}`);
    const { error: removeError } = await supabase.storage.from(BUCKET).remove(paths);
    if (removeError) throw removeError;
    removed += paths.length;
    if (data.length < 1000) break;
  }
  return removed;
}

async function main() {
  const users = await testUsers();
  if (users.length === 0) {
    console.log('No @jchat.test users found. Nothing to delete.');
    return;
  }

  // Match notifications that these users caused (they live in OTHER users' rows, so no cascade).
  const ids = users.map((u) => u.id);
  const { error: notificationError } = await supabase
    .from('notifications')
    .delete()
    .in('type', ['match_like', 'match_super', 'match_match'])
    .in('payload->>from_user_id', ids);
  if (notificationError) console.warn(`! could not delete their notifications: ${notificationError.message}`);

  let deleted = 0;
  let objects = 0;
  for (const user of users) {
    try {
      objects += await removeUserObjects(user.id);
      const { error } = await supabase.auth.admin.deleteUser(user.id);
      if (error) throw error;
      deleted += 1;
      console.log(`✓ ${user.email}`);
    } catch (err) {
      console.error(`✗ ${user.email}: ${err.message ?? err}`);
    }
  }

  console.log(`\nDone: ${deleted} users deleted, ${objects} storage objects removed.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
