/**
 * JChat 3.0 — D7: signed URLs for the evidence copies of a report, for the platform admin. Import-free, so a Deno test can drive it with fakes.
 *
 * verify_jwt is on (a signed-in caller is required) and the handler checks is_platform_admin() with the CALLER's JWT: anyone else gets 403.
 * Input { report_id }; output { items: [{ url, kind, label }] } with URLs signed for 10 minutes (the service client signs; the paths never leave
 * the function). Every view that issues URLs writes security_logs 'evidence_viewed' (actor = the admin, target = the report).
 */

export const SIGNED_TTL_SECONDS = 600;

export interface EvidenceEntry {
  bucket: string;
  path: string;
  src_bucket?: string;
}

export interface EvidenceItem {
  url: string;
  kind: "image" | "audio" | "file";
  label: string;
}

export interface HandlerDeps {
  /** The caller's id from the verified JWT, or null when there is no valid session. */
  callerId(): Promise<string | null>;
  /** is_platform_admin() evaluated with the caller's JWT. */
  isAdmin(): Promise<boolean>;
  /** reports.evidence of one report; null when the report does not exist. */
  loadEvidence(reportId: string): Promise<EvidenceEntry[] | null>;
  /** Signed URLs (in the same order); a null for an object that could not be signed. */
  sign(bucket: string, paths: string[], ttlSeconds: number): Promise<(string | null)[]>;
  log(actorId: string, reportId: string, count: number): Promise<void>;
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
};
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS } });
}

export function kindOf(path: string): EvidenceItem["kind"] {
  const ext = path.split("?")[0].split(".").pop()?.toLowerCase() ?? "";
  if (["jpg", "jpeg", "png", "webp", "gif", "heic", "heif"].includes(ext)) return "image";
  if (["m4a", "mp3", "aac", "wav", "ogg", "opus", "mp4"].includes(ext)) return "audio";
  return "file";
}

export async function handleReportEvidence(req: Request, deps: HandlerDeps): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const caller = await deps.callerId();
    if (!caller) return json({ error: "invalid_session" }, 401);
    if (!(await deps.isAdmin())) return json({ error: "forbidden" }, 403);

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json({ error: "invalid_request" }, 400);
    }
    const reportId = body && typeof body === "object" ? (body as { report_id?: unknown }).report_id : null;
    if (typeof reportId !== "string" || !UUID_RE.test(reportId)) return json({ error: "invalid_request" }, 400);

    const evidence = await deps.loadEvidence(reportId);
    if (evidence === null) return json({ error: "not_found" }, 404);

    // only well-formed entries of the evidence bucket, grouped by bucket for signing, answered in the stored order
    const entries = (Array.isArray(evidence) ? evidence : []).filter((e) =>
      e && typeof e.bucket === "string" && typeof e.path === "string" && e.bucket === "report-evidence" && e.path !== "" && !e.path.split("/").includes("..")
    );
    if (entries.length === 0) return json({ items: [] });

    const urls = await deps.sign("report-evidence", entries.map((e) => e.path), SIGNED_TTL_SECONDS);
    const items: EvidenceItem[] = [];
    entries.forEach((e, i) => {
      const url = urls[i];
      if (url) items.push({ url, kind: kindOf(e.path), label: e.src_bucket ?? "file" });
    });
    if (items.length > 0) await deps.log(caller, reportId, items.length);
    return json({ items });
  } catch {
    console.error("[report-evidence] unexpected error");
    return json({ error: "unexpected" }, 500);
  }
}
