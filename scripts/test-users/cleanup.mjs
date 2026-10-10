#!/usr/bin/env node
/**
 * Deletes ONLY users whose e-mail ends in @test.jchat.cloud (their content goes with them by cascade).
 * Default is a DRY RUN that lists what would be deleted. NOT RUN by the assistant: read scripts/test-users/README.md first.
 *
 *   node scripts/test-users/cleanup.mjs                 # lists, deletes nothing
 *   node scripts/test-users/cleanup.mjs --apply         # deletes
 *
 * Safety rules: exact domain match (never a substring), when users.is_test exists it must be true too, accounts that OWN a
 * business are skipped (deleting them would take the venue), and a hard cap (--max, default 200) stops a runaway list.
 */
import { rmSync } from 'node:fs';
import { CREDENTIALS_PATH, DOMAIN, adminClient, config, flag, isTestEmail, opt } from './lib.mjs';

const apply = flag('apply');
const max = Math.max(1, Number(opt('max', '200')) || 200);

const cfg = config();
const admin = adminClient(cfg);

// Every auth user, paged.
const all = [];
for (let page = 1; page <= 50; page += 1) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) { console.error(`Could not list users: ${error.message}`); process.exit(1); }
  all.push(...(data?.users ?? []));
  if ((data?.users ?? []).length < 1000) break;
}
let targets = all.filter((u) => isTestEmail(u.email));

// When users.is_test exists, require it as a second condition.
const probe = await admin.from('users').select('is_test').limit(1);
if (!probe.error) {
  const { data: flagged } = await admin.from('users').select('id').eq('is_test', true).in('id', targets.map((t) => t.id));
  const ok = new Set((flagged ?? []).map((r) => r.id));
  const dropped = targets.filter((t) => !ok.has(t.id));
  if (dropped.length) console.log(`Skipping ${dropped.length} @${DOMAIN} account(s) not flagged is_test: ${dropped.map((d) => d.email).join(', ')}`);
  targets = targets.filter((t) => ok.has(t.id));
}

// Never take a business with its owner.
const { data: owners } = await admin.from('businesses').select('owner_id').in('owner_id', targets.map((t) => t.id));
const ownerIds = new Set((owners ?? []).map((o) => o.owner_id));
const ownersSkipped = targets.filter((t) => ownerIds.has(t.id));
if (ownersSkipped.length) console.log(`Skipping ${ownersSkipped.length} account(s) that own a business: ${ownersSkipped.map((o) => o.email).join(', ')}`);
targets = targets.filter((t) => !ownerIds.has(t.id));

if (targets.length > max) { console.error(`${targets.length} accounts exceed --max ${max}. Aborting.`); process.exit(1); }

/**
 * Every Match photo file of a user: the paths the DB knows plus anything under `{uid}/` in the private bucket (an upload whose row
 * insert failed leaves an orphan). The rows go with the user by cascade, the Storage objects do NOT, so they are removed first.
 */
async function matchPhotoPaths(userId) {
  const paths = new Set();
  const { data: rows } = await admin.from('match_photos').select('path').eq('user_id', userId);
  for (const row of rows ?? []) if (row.path?.startsWith(`${userId}/`)) paths.add(row.path);
  const { data: files } = await admin.storage.from('match-photos').list(userId, { limit: 1000 });
  for (const file of files ?? []) if (file.name) paths.add(`${userId}/${file.name}`);
  return [...paths];
}

console.log(`${apply ? 'DELETING' : 'DRY RUN — would delete'} ${targets.length} test account(s):`);
for (const t of targets) console.log(`  ${t.email}  (${(await matchPhotoPaths(t.id)).length} Match photo file(s))`);
if (!apply) { console.log('Nothing was deleted. Re-run with --apply to delete.'); process.exit(0); }

let deleted = 0;
for (const t of targets) {
  if (!isTestEmail(t.email)) continue; // belt and braces
  // Same pre-steps as the delete-account Edge Function (NO ACTION references that would block the cascade).
  await admin.from('radius_increase_requests').delete().eq('requested_by', t.id);
  await admin.from('radius_increase_requests').update({ reviewed_by: null }).eq('reviewed_by', t.id);
  // Own avatar object and Match photo files (the match_photos rows go with the user by cascade; the files would stay behind).
  await admin.storage.from('avatars').remove([`${t.id}/avatar.png`]);
  const photoPaths = await matchPhotoPaths(t.id);
  for (let i = 0; i < photoPaths.length; i += 100) {
    const { error: removeError } = await admin.storage.from('match-photos').remove(photoPaths.slice(i, i + 100));
    if (removeError) console.error(`  ! ${t.email}: could not remove some Match photos (${removeError.message})`);
  }
  const { error } = await admin.auth.admin.deleteUser(t.id);
  if (error) console.error(`  ✘ ${t.email}: ${error.message}`);
  else { deleted += 1; console.log(`  ✔ ${t.email}`); }
}
console.log(`Deleted ${deleted}/${targets.length}.`);
if (deleted === targets.length) { try { rmSync(CREDENTIALS_PATH); console.log('Removed scripts/test-users/out/credentials.json.'); } catch { /* none */ } }
