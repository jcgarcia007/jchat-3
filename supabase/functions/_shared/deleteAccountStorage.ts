/**
 * JChat 3.0 — delete-account: which Storage objects belong to a person (pure, import-free so a Node test can drive it).
 *
 * delete-account purges these BEFORE it deletes auth.users: deleting the user cascades the database rows but never the files, and
 * every file is personal data (photos, voice notes). Layout of the buckets (production, 2026-11):
 *   avatars, covers, profile-media, post-media, match-photos, story-media, verification-selfies → <uid>/…            (any depth)
 *   dm-media                                                                                    → <conversation_id>/<uid>/…
 *   voice-notes                                                                                 → room/<room_id>/<uid>/<file>.m4a
 *   menu-photos                                                                                 → <business_id>/…   (the venue's, NEVER purged here)
 * A business owner cannot reach this code (owner_has_business, 409), so a business folder is never in the plan.
 */

export const USER_FOLDER_BUCKETS = [
  "avatars",
  "covers",
  "profile-media",
  "post-media",
  "match-photos",
  "story-media",
  "verification-selfies",
] as const;
export const DM_BUCKET = "dm-media";
export const VOICE_BUCKET = "voice-notes";

/** Storage `remove` accepts many paths; 100 per call keeps each request small. */
export const REMOVE_BATCH = 100;
/** Folder depth guard for the recursive listing (covers/<uid>/<business>/cover/<file> is 4). */
export const MAX_DEPTH = 8;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

export interface PurgeFolder {
  bucket: string;
  prefix: string;
}
export interface PurgeObject {
  bucket: string;
  path: string;
}
export interface PurgePlan {
  /** Folders to list recursively and empty. */
  folders: PurgeFolder[];
  /** Objects whose exact path is already known (voice notes found through the messages table). */
  objects: PurgeObject[];
}

/**
 * The folders and objects of ONE user. Everything is built from the verified uid, and every id that comes from the database is
 * checked to be a uuid (a malformed value is dropped, never turned into a path).
 *  - conversationIds: the conversations where the user sent something (dm_messages.sender_id).
 *  - voiceRoomPaths:  messages.media_url of the user's room voice notes ('room/<room>/<uid>/<file>.m4a').
 */
export function buildPurgePlan(uid: string, opts: { conversationIds?: string[]; voiceRoomPaths?: string[] } = {}): PurgePlan {
  if (!isUuid(uid)) throw new Error("invalid_uid");
  const folders: PurgeFolder[] = USER_FOLDER_BUCKETS.map((bucket) => ({ bucket, prefix: uid }));

  const conversations = [...new Set((opts.conversationIds ?? []).filter(isUuid))];
  for (const conversation of conversations) folders.push({ bucket: DM_BUCKET, prefix: `${conversation}/${uid}` });

  const own = new RegExp(`^room/${UUID.source.slice(1, -1)}/${uid}/[^/]+$`, "i");
  const voice = [...new Set((opts.voiceRoomPaths ?? []).filter((p) => typeof p === "string" && own.test(p)))];
  const objects: PurgeObject[] = voice.map((path) => ({ bucket: VOICE_BUCKET, path }));
  return { folders, objects };
}

export function chunk<T>(items: T[], size: number = REMOVE_BATCH): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** The slice of the Storage client the purge uses (the Supabase client satisfies it; a test passes a fake). */
export interface StorageEntry {
  name: string;
  /** null for a folder. */
  id: string | null;
}
export interface StorageBucketApi {
  list(path: string, options: { limit: number; offset: number }): Promise<{ data: StorageEntry[] | null; error: { message: string } | null }>;
  remove(paths: string[]): Promise<{ error: { message: string } | null }>;
}
export interface StorageApi {
  from(bucket: string): StorageBucketApi;
}

/** A bucket that is not there has nothing to purge (story-media is in the code but not in production). */
export function isBucketMissing(message: string | undefined): boolean {
  return /bucket not found|not found/i.test(message ?? "");
}

/** Every object path under `prefix`, recursively. Throws on a Storage error (except a missing bucket → []). */
export async function listAllObjects(storage: StorageApi, bucket: string, prefix: string): Promise<string[]> {
  const found: string[] = [];
  const pending: { path: string; depth: number }[] = [{ path: prefix, depth: 0 }];
  while (pending.length > 0) {
    const { path, depth } = pending.pop()!;
    if (depth > MAX_DEPTH) continue;
    for (let offset = 0; ; offset += REMOVE_BATCH) {
      const { data, error } = await storage.from(bucket).list(path, { limit: REMOVE_BATCH, offset });
      if (error) {
        if (isBucketMissing(error.message)) return found;
        throw new Error(`list ${bucket}/${path}: ${error.message}`);
      }
      const entries = data ?? [];
      for (const entry of entries) {
        if (entry.id === null) pending.push({ path: `${path}/${entry.name}`, depth: depth + 1 });
        else found.push(`${path}/${entry.name}`);
      }
      if (entries.length < REMOVE_BATCH) break;
    }
  }
  return found;
}

/** Deletes everything in the plan; returns how many objects were removed. Throws (so the caller answers storage_purge_failed) on any error. */
export async function purgePlan(storage: StorageApi, plan: PurgePlan): Promise<number> {
  const byBucket = new Map<string, Set<string>>();
  const add = (bucket: string, path: string) => {
    if (!byBucket.has(bucket)) byBucket.set(bucket, new Set());
    byBucket.get(bucket)!.add(path);
  };
  for (const folder of plan.folders) {
    for (const path of await listAllObjects(storage, folder.bucket, folder.prefix)) add(folder.bucket, path);
  }
  for (const object of plan.objects) add(object.bucket, object.path);

  let removed = 0;
  for (const [bucket, paths] of byBucket) {
    for (const batch of chunk([...paths])) {
      const { error } = await storage.from(bucket).remove(batch);
      if (error) throw new Error(`remove ${bucket}: ${error.message}`);
      removed += batch.length;
    }
  }
  return removed;
}
