#!/usr/bin/env node
/**
 * JChat 3.0 — one-off cleanup of Storage objects whose owner no longer exists (audit C-3).
 *
 * Deleting an account never removed its files (fixed in delete-account, audit A1); this script removes the ones already left behind.
 * An object is an ORPHAN when the user folder in its path is a uuid that is not in auth.users:
 *   avatars, covers, profile-media, post-media, match-photos, story-media, verification-selfies   <uid>/…
 *   dm-media                                                                                       <conversation>/<uid>/…
 *   voice-notes                                                                                    room/<room>/<uid>/…
 * menu-photos is NOT checked: its folders are business ids, not people.
 *
 * DRY-RUN by default: it lists and counts, it deletes NOTHING. Add --apply to delete.
 *
 * Run it yourself, from your terminal, with the service role key (never pasted anywhere, never printed):
 *   SUPABASE_URL=https://<project>.supabase.co SB_SECRET_KEY=<service_role key> node supabase/scripts/storage_orphans_cleanup.mjs
 *   SUPABASE_URL=… SB_SECRET_KEY=… node supabase/scripts/storage_orphans_cleanup.mjs --apply
 * (SUPABASE_SERVICE_ROLE_KEY is accepted instead of SB_SECRET_KEY.) Node 18+, no dependencies.
 */

const BASE = (process.env.SUPABASE_URL ?? '').replace(/\/$/, '');
const KEY = process.env.SB_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const APPLY = process.argv.includes('--apply');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE = 100;

if (!BASE || !KEY) {
  console.error('Set SUPABASE_URL and SB_SECRET_KEY (the service role key) in the environment. Nothing was done.');
  process.exit(1);
}

const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

async function api(path, init = {}) {
  const res = await fetch(`${BASE}${path}`, { ...init, headers: { ...headers, ...(init.headers ?? {}) } });
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) {
    const error = new Error(`${init.method ?? 'GET'} ${path} → ${res.status}`);
    error.status = res.status;
    error.body = body;
    throw error;
  }
  return body;
}

/** Every user id in auth.users (admin API, paged). */
async function existingUserIds() {
  const ids = new Set();
  for (let page = 1; ; page += 1) {
    const body = await api(`/auth/v1/admin/users?page=${page}&per_page=1000`);
    const users = body?.users ?? [];
    for (const user of users) ids.add(String(user.id).toLowerCase());
    if (users.length < 1000) break;
  }
  return ids;
}

/** One level of a bucket: [{ name, isFolder }]. Missing bucket → null. */
async function listLevel(bucket, prefix) {
  const out = [];
  for (let offset = 0; ; offset += PAGE) {
    let entries;
    try {
      entries = await api(`/storage/v1/object/list/${encodeURIComponent(bucket)}`, {
        method: 'POST',
        body: JSON.stringify({ prefix, limit: PAGE, offset, sortBy: { column: 'name', order: 'asc' } }),
      });
    } catch (error) {
      if (error.status === 404 || error.status === 400) return null;
      throw error;
    }
    for (const entry of entries ?? []) out.push({ name: entry.name, isFolder: entry.id === null });
    if ((entries ?? []).length < PAGE) break;
  }
  return out;
}

async function allObjects(bucket, prefix) {
  const files = [];
  const pending = [prefix];
  while (pending.length) {
    const path = pending.pop();
    const level = (await listLevel(bucket, path)) ?? [];
    for (const entry of level) (entry.isFolder ? pending.push(`${path}/${entry.name}`) : files.push(`${path}/${entry.name}`));
  }
  return files;
}

/** Folder paths whose last segment is the user id, given how far down the uid sits in each bucket. */
async function userFolders(bucket, uidDepth, startPrefixes = ['']) {
  let level = startPrefixes;
  for (let depth = 0; depth < uidDepth; depth += 1) {
    const next = [];
    for (const prefix of level) {
      const entries = (await listLevel(bucket, prefix)) ?? [];
      for (const entry of entries) if (entry.isFolder) next.push(prefix ? `${prefix}/${entry.name}` : entry.name);
    }
    level = next;
  }
  const folders = [];
  for (const prefix of level) {
    const entries = (await listLevel(bucket, prefix)) ?? [];
    for (const entry of entries) if (entry.isFolder) folders.push(prefix ? `${prefix}/${entry.name}` : entry.name);
  }
  return folders;
}

const BUCKETS = [
  ...['avatars', 'covers', 'profile-media', 'post-media', 'match-photos', 'story-media', 'verification-selfies'].map((bucket) => ({ bucket, uidDepth: 0, start: [''] })),
  { bucket: 'dm-media', uidDepth: 1, start: [''] },
  { bucket: 'voice-notes', uidDepth: 1, start: ['room'] },
];

const users = await existingUserIds();
console.log(`Users in auth.users: ${users.size}`);
console.log(APPLY ? 'MODE: --apply (orphans WILL be deleted)' : 'MODE: dry-run (nothing is deleted; add --apply to delete)');

let total = 0;
for (const { bucket, uidDepth, start } of BUCKETS) {
  const folders = await userFolders(bucket, uidDepth, start);
  const orphanFolders = folders.filter((folder) => {
    const uid = folder.split('/').pop();
    return UUID.test(uid) && !users.has(uid.toLowerCase());
  });
  const objects = [];
  for (const folder of orphanFolders) objects.push(...(await allObjects(bucket, folder)));
  total += objects.length;
  console.log(`${bucket.padEnd(22)} orphan folders: ${String(orphanFolders.length).padStart(3)}   objects: ${String(objects.length).padStart(4)}`);
  if (APPLY && objects.length > 0) {
    for (let i = 0; i < objects.length; i += PAGE) {
      await api(`/storage/v1/object/${encodeURIComponent(bucket)}`, { method: 'DELETE', body: JSON.stringify({ prefixes: objects.slice(i, i + PAGE) }) });
    }
    console.log(`${' '.repeat(22)} deleted ${objects.length}`);
  }
}
console.log(`Total orphan objects: ${total}${APPLY ? ' (deleted)' : ' (not deleted)'}`);
