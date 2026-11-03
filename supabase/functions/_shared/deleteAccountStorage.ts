/**
 * JChat 3.0 — delete-account: remove a person's Storage objects (import-free, so a Node test and a Deno test can drive it).
 *
 * Which objects are the person's is decided by the DATABASE, from storage.objects itself (RPC storage_user_object_paths, migration 258):
 * deriving paths from messages / dm_messages does not work (messages.media_url is NULL in production while voice-notes holds files).
 * This module only deletes what that RPC returns, in batches, and refuses anything outside the buckets below (menu-photos belongs to a
 * venue, never to a person).
 */

/** Buckets that hold a person's files. The RPC never returns anything else; this is a second lock. */
export const PERSON_BUCKETS = [
  "avatars",
  "covers",
  "profile-media",
  "post-media",
  "match-photos",
  "story-media",
  "verification-selfies",
  "dm-media",
  "voice-notes",
] as const;

/** Storage `remove` takes many paths; 100 per call keeps each request small. */
export const REMOVE_BATCH = 100;
/** The RPC answer can be capped by the API (max rows): after removing a page we ask again until it is empty, at most this many times. */
export const MAX_ROUNDS = 200;

export interface StorageObjectRow {
  bucket_id: string;
  name: string;
}

export interface PurgeObject {
  bucket: string;
  path: string;
}
export interface PurgePlan {
  objects: PurgeObject[];
}

export function chunk<T>(items: T[], size: number = REMOVE_BATCH): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** The RPC rows → the objects to delete: only person buckets, non-empty names without traversal, no duplicates. */
export function planFromRows(rows: StorageObjectRow[] | null | undefined): PurgePlan {
  const allowed = new Set<string>(PERSON_BUCKETS);
  const seen = new Set<string>();
  const objects: PurgeObject[] = [];
  for (const row of rows ?? []) {
    if (!row || typeof row.bucket_id !== "string" || typeof row.name !== "string") continue;
    if (!allowed.has(row.bucket_id) || row.name === "" || row.name.split("/").includes("..")) continue;
    const key = `${row.bucket_id}\u0000${row.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    objects.push({ bucket: row.bucket_id, path: row.name });
  }
  return { objects };
}

/** The slice of the Storage client the purge uses (the Supabase client satisfies it; a test passes a fake). */
export interface StorageBucketApi {
  remove(paths: string[]): Promise<{ error: { message: string } | null }>;
}
export interface StorageApi {
  from(bucket: string): StorageBucketApi;
}

/** Deletes every object of the plan, per bucket, in batches of 100. Returns how many were removed; throws on a Storage error. */
export async function purgePlan(storage: StorageApi, plan: PurgePlan): Promise<number> {
  const byBucket = new Map<string, string[]>();
  for (const { bucket, path } of plan.objects) {
    if (!byBucket.has(bucket)) byBucket.set(bucket, []);
    byBucket.get(bucket)!.push(path);
  }
  let removed = 0;
  for (const [bucket, paths] of byBucket) {
    for (const batch of chunk(paths)) {
      const { error } = await storage.from(bucket).remove(batch);
      if (error) throw new Error(`remove ${bucket}: ${error.message}`);
      removed += batch.length;
    }
  }
  return removed;
}

/** The slice of the admin client the purge uses: the RPC and Storage. */
export interface PurgeAdmin {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: StorageObjectRow[] | null; error: { message: string } | null }>;
  storage: StorageApi;
}

/**
 * Asks the database for the person's objects and deletes them, repeating while it still returns some (the API may cap one answer).
 * Throws when the RPC or a delete fails, or when objects keep coming back after MAX_ROUNDS (they are not really going away).
 */
export async function purgeUserObjects(admin: PurgeAdmin, userId: string): Promise<number> {
  let total = 0;
  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const { data, error } = await admin.rpc("storage_user_object_paths", { p_user: userId });
    if (error) throw new Error(`storage_user_object_paths: ${error.message}`);
    const plan = planFromRows(data);
    if (plan.objects.length === 0) return total;
    total += await purgePlan(admin.storage, plan);
  }
  throw new Error("storage purge did not converge");
}
