/**
 * JChat 3.0 — delete-account (D7): copy the files of reported content to the private `report-evidence` bucket before the person's
 * Storage objects are purged (import-free, so a Node test and a Deno test can drive it).
 *
 * Which files are in hold comes from the DATABASE (RPC user_held_evidence, migration 272: reports of this person that are pending or inside
 * the NCMEC term, their snapshot files that really exist in storage.objects and are the person's own). This module copies each one to
 *   report-evidence/<report_id>/<src_bucket>/<basename>
 * and records the copy in reports.evidence ({bucket, path, src_bucket, src_path, copied_at}) and reports.evidence_copied_at.
 * Idempotent: a file already listed in reports.evidence is skipped; a copy that exists in Storage but was never recorded (a previous
 * attempt died in between) is recorded without failing. Any other failure throws: delete-account then answers 500 evidence_copy_failed and
 * deletes nothing more (the law says to keep the evidence; the person can try again in minutes).
 */

export const EVIDENCE_BUCKET = "report-evidence";

/** Source buckets a copy may come from (the RPC already limits to these; this is a second lock). */
export const EVIDENCE_SOURCE_BUCKETS = [
  "avatars",
  "covers",
  "profile-media",
  "post-media",
  "story-media",
  "dm-media",
  "voice-notes",
] as const;

export interface HeldEvidenceRow {
  report_id: string;
  content_type: string;
  src_bucket: string;
  src_path: string;
}

export interface EvidenceEntry {
  bucket: string;
  path: string;
  src_bucket: string;
  src_path: string;
  copied_at: string;
}

export interface EvidenceStorageBucketApi {
  copy(from: string, to: string, options?: { destinationBucket?: string }): Promise<{ error: { message: string } | null }>;
}

/** The slice of the world the copy uses: the RPC, Storage and the reports.evidence column (the function adapts the admin client to it; a test passes a fake). */
export interface EvidenceDeps {
  heldEvidence(userId: string): Promise<HeldEvidenceRow[]>;
  getEvidence(reportId: string): Promise<EvidenceEntry[]>;
  /** Writes the full list (evidence = list, evidence_copied_at = now()). */
  saveEvidence(reportId: string, entries: EvidenceEntry[]): Promise<void>;
  storage: { from(bucket: string): EvidenceStorageBucketApi };
  now?: () => Date;
}

export interface CopyReport {
  copied: number;
  skipped: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function basename(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1];
}

/** Destination path of a copy inside report-evidence. */
export function evidencePath(row: HeldEvidenceRow): string {
  return `${row.report_id}/${row.src_bucket}/${basename(row.src_path)}`;
}

/** The RPC rows → the ones this module accepts: known report id, source bucket in the list, no traversal, non-empty names. */
export function planRows(rows: HeldEvidenceRow[] | null | undefined): HeldEvidenceRow[] {
  const allowed = new Set<string>(EVIDENCE_SOURCE_BUCKETS);
  const seen = new Set<string>();
  const out: HeldEvidenceRow[] = [];
  for (const r of rows ?? []) {
    if (!r || typeof r.report_id !== "string" || typeof r.src_bucket !== "string" || typeof r.src_path !== "string") continue;
    if (!UUID.test(r.report_id) || !allowed.has(r.src_bucket)) continue;
    if (r.src_path === "" || r.src_path.split("/").includes("..") || basename(r.src_path) === "") continue;
    const key = `${r.report_id}\u0000${r.src_bucket}\u0000${r.src_path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

/** A copy whose destination already exists in the bucket is fine: the earlier attempt only failed to write the record. */
function isAlreadyThere(message: string): boolean {
  return /already exists|duplicate|resource already/i.test(message);
}

/**
 * Copies every held file of the person to report-evidence and records it. Returns the counts; throws on any failure
 * (the caller maps it to evidence_copy_failed and stops the deletion).
 */
export async function copyHeldEvidence(deps: EvidenceDeps, userId: string): Promise<CopyReport> {
  const rows = planRows(await deps.heldEvidence(userId));
  const byReport = new Map<string, HeldEvidenceRow[]>();
  for (const r of rows) {
    if (!byReport.has(r.report_id)) byReport.set(r.report_id, []);
    byReport.get(r.report_id)!.push(r);
  }

  const report: CopyReport = { copied: 0, skipped: 0 };
  const now = deps.now ?? (() => new Date());
  for (const [reportId, items] of byReport) {
    const existing = await deps.getEvidence(reportId);
    const known = new Set(existing.map((e) => e.path));
    const added: EvidenceEntry[] = [];
    for (const row of items) {
      const dest = evidencePath(row);
      if (known.has(dest)) {
        report.skipped += 1;
        continue;
      }
      const { error } = await deps.storage.from(row.src_bucket).copy(row.src_path, dest, { destinationBucket: EVIDENCE_BUCKET });
      if (error && !isAlreadyThere(error.message)) throw new Error(`copy ${row.src_bucket}: ${error.message}`);
      added.push({ bucket: EVIDENCE_BUCKET, path: dest, src_bucket: row.src_bucket, src_path: row.src_path, copied_at: now().toISOString() });
      known.add(dest);
      report.copied += 1;
    }
    if (added.length > 0) await deps.saveEvidence(reportId, [...existing, ...added]);
  }
  return report;
}

export interface EvidenceStepDeps {
  copy: () => Promise<CopyReport>;
  /** security_logs insert; the detail never carries paths or ids. */
  log: (action: string, detail: string) => Promise<void>;
}

/**
 * The delete-account step: copy the held evidence; on failure log 'evidence_copy_failed' (no paths) and report `ok: false` so the function
 * answers 500 evidence_copy_failed and deletes nothing else.
 */
export async function runEvidenceStep(deps: EvidenceStepDeps): Promise<{ ok: true; report: CopyReport } | { ok: false }> {
  try {
    return { ok: true, report: await deps.copy() };
  } catch (e) {
    console.error("[delete-account] evidence copy failed", e);
    try {
      await deps.log("evidence_copy_failed", "copy_failed");
    } catch {
      console.error("[delete-account] security_logs insert threw (evidence_copy_failed)");
    }
    return { ok: false };
  }
}
