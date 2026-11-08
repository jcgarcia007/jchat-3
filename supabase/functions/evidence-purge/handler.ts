/**
 * JChat 3.0 — D7: deletion of expired report evidence copies (bucket report-evidence). Import-free apart from safeEqual, so a Deno test can drive it with fakes.
 *
 * Called only by the database (evidence_purge_retry(), migration 268) through pg_net with { ids: [...] } (rows of public.evidence_purge_queue) and the
 * x-push-secret header. The retry function already counted the attempt before calling. For each row that still exists: the object is removed from the
 * report-evidence bucket and the queue row is deleted; if the removal fails the row stays with a GENERIC last_error (never a path) and the database retries
 * with backoff (6 attempts, then it gives up and writes security_logs 'evidence_purge_gave_up'). Only the report-evidence bucket is ever touched.
 */

import { safeEqual } from "../_shared/safeEqual.ts";

export const MAX_IDS = 50;
export const EVIDENCE_BUCKET = "report-evidence";

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
  /** Removes objects from the report-evidence bucket. */
  remove(paths: string[]): Promise<{ error: { message: string } | null }>;
  /** Deletes the queue rows that were handled. */
  deleteRows(ids: string[]): Promise<void>;
  /** Marks rows that failed (generic text). */
  markError(ids: string[], error: string): Promise<void>;
}

const JSON_HEADERS = { "Content-Type": "application/json" };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

export async function handleEvidencePurge(req: Request, deps: HandlerDeps): Promise<Response> {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!deps.secret) {
    console.error("[evidence-purge] PUSH_WEBHOOK_SECRET is not configured");
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
  if (ids.length === 0) return json({ removed: 0, failed: 0 });

  try {
    const rows = (await deps.loadRows(ids)).filter((r) => ids.includes(r.id));
    // a row that is not for the evidence bucket, or whose path tries to leave its folder, is never removed (and is dropped from the queue as invalid)
    const valid = rows.filter((r) => r.bucket === EVIDENCE_BUCKET && r.path !== "" && !r.path.split("/").includes(".."));
    const invalid = rows.filter((r) => !valid.includes(r));
    if (invalid.length > 0) await deps.markError(invalid.map((r) => r.id), "invalid_row");
    if (valid.length === 0) return json({ removed: 0, failed: invalid.length });

    const { error } = await deps.remove(valid.map((r) => r.path));
    if (error) {
      console.error(`[evidence-purge] remove failed for ${valid.length} object(s)`);
      await deps.markError(valid.map((r) => r.id), "remove_failed");
      return json({ removed: 0, failed: valid.length + invalid.length });
    }
    await deps.deleteRows(valid.map((r) => r.id));
    console.log(`[evidence-purge] removed ${valid.length}`);
    return json({ removed: valid.length, failed: invalid.length });
  } catch {
    console.error("[evidence-purge] unexpected error");
    return json({ error: "Internal server error" }, 500);
  }
}
