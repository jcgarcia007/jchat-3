/**
 * JChat 3.0 — Lote G: deletion of the files of expired chat messages (buckets post-media and voice-notes). Import-free apart from safeEqual, so a Deno test
 * can drive it with fakes.
 *
 * Called only by the database (chat_media_purge_retry(), migration 278) through pg_net with { ids: [...] } (rows of public.chat_media_purge_queue) and the
 * x-push-secret header. The retry function already counted the attempt before calling. For each row that still exists:
 *   - a row for another bucket, or whose path does not have the exact shape the app uploads (post-media: {uid}/{file}; voice-notes: room/{room}/{uid}/{file}),
 *     is never removed (it stays with last_error 'invalid_row' and the database gives up after 6 attempts);
 *   - a path that is STILL referenced (a pinned or held message, a business post, a report in hold: chat_media_paths_in_use) is not removed and leaves the
 *     queue (if its last reference goes away later, it is queued again by whatever deletes that reference);
 *   - the rest are removed through the Storage API and leave the queue. A file that no longer exists counts as removed (Storage answers success).
 * If a removal fails the rows stay with a GENERIC last_error (never a path) and the database retries with backoff.
 */

import { safeEqual } from "../_shared/safeEqual.ts";

export const MAX_IDS = 50;
export const CHAT_MEDIA_BUCKETS = ["post-media", "voice-notes"] as const;
export type ChatMediaBucket = (typeof CHAT_MEDIA_BUCKETS)[number];

export interface QueueRow {
  id: string;
  bucket: string;
  path: string;
}

export interface HandlerDeps {
  /** PUSH_WEBHOOK_SECRET; undefined = the function is not configured. */
  secret: string | undefined;
  /** Queue rows by id (unknown ids simply do not come back). */
  loadRows(ids: string[]): Promise<QueueRow[]>;
  /** The paths (of `paths`) that something still references: chat_media_paths_in_use. Throws when it cannot know. */
  inUse(bucket: ChatMediaBucket, paths: string[]): Promise<string[]>;
  /** Removes objects from a bucket through the Storage API. */
  remove(bucket: ChatMediaBucket, paths: string[]): Promise<{ error: { message: string } | null }>;
  /** Deletes the queue rows that were handled. */
  deleteRows(ids: string[]): Promise<void>;
  /** Marks rows that failed (generic text). */
  markError(ids: string[], error: string): Promise<void>;
}

const JSON_HEADERS = { "Content-Type": "application/json" };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
// post-media holds chat photos {uid}/{file} (2 segments) AND business posts {uid}/business/{business}/{file} (4): only the 2-segment shape is a chat photo.
const PHOTO_PATH_RE = new RegExp(`^${UID}/[^/]+$`, "i");
const VOICE_PATH_RE = new RegExp(`^room/${UID}/${UID}/[^/]+$`, "i");

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

/** Is this (bucket, path) a file of a chat message, in the exact shape the app uploads? */
export function isChatMediaPath(bucket: string, path: string): bucket is ChatMediaBucket {
  if (path === "" || path.split("/").includes("..")) return false;
  if (bucket === "post-media") return PHOTO_PATH_RE.test(path);
  if (bucket === "voice-notes") return VOICE_PATH_RE.test(path);
  return false;
}

export async function handleChatMediaPurge(req: Request, deps: HandlerDeps): Promise<Response> {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!deps.secret) {
    console.error("[chat-media-purge] PUSH_WEBHOOK_SECRET is not configured");
    return json({ error: "Internal server error" }, 500);
  }
  if (!safeEqual(req.headers.get("x-push-secret") ?? "", deps.secret)) return json({ error: "Unauthorized" }, 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const raw = body && typeof body === "object" ? (body as { ids?: unknown }).ids : null;
  if (!Array.isArray(raw)) return json({ error: "Invalid request" }, 400);
  const ids = [...new Set(raw.filter((v): v is string => typeof v === "string" && UUID_RE.test(v)))].slice(0, MAX_IDS);
  if (ids.length === 0) return json({ removed: 0, kept: 0, failed: 0 });

  try {
    const rows = (await deps.loadRows(ids)).filter((r) => ids.includes(r.id));
    const valid = rows.filter((r) => isChatMediaPath(r.bucket, r.path));
    const invalid = rows.filter((r) => !valid.includes(r));
    let failed = invalid.length;
    if (invalid.length > 0) await deps.markError(invalid.map((r) => r.id), "invalid_row");

    let removed = 0;
    let kept = 0;
    for (const bucket of CHAT_MEDIA_BUCKETS) {
      const mine = valid.filter((r) => r.bucket === bucket);
      if (mine.length === 0) continue;
      // Never remove what something still references. If we cannot know, nothing is removed (the throw lands in the catch: 500, rows stay).
      const used = new Set(await deps.inUse(bucket, mine.map((r) => r.path)));
      const keep = mine.filter((r) => used.has(r.path));
      const doomed = mine.filter((r) => !used.has(r.path));
      if (keep.length > 0) {
        await deps.deleteRows(keep.map((r) => r.id));
        kept += keep.length;
      }
      if (doomed.length === 0) continue;
      const { error } = await deps.remove(bucket, doomed.map((r) => r.path));
      if (error) {
        console.error(`[chat-media-purge] remove failed for ${doomed.length} object(s) in ${bucket}`);
        await deps.markError(doomed.map((r) => r.id), "remove_failed");
        failed += doomed.length;
        continue;
      }
      await deps.deleteRows(doomed.map((r) => r.id));
      removed += doomed.length;
    }
    console.log(`[chat-media-purge] removed ${removed}, kept ${kept}, failed ${failed}`);
    return json({ removed, kept, failed });
  } catch {
    console.error("[chat-media-purge] unexpected error");
    return json({ error: "Internal server error" }, 500);
  }
}
