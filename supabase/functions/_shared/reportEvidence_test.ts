import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { copyHeldEvidence, evidencePath, planRows, runEvidenceStep, type EvidenceDeps, type EvidenceEntry, type HeldEvidenceRow } from "./reportEvidence.ts";

const UID = "3ddf4a2e-1111-4222-8333-444455556666";
const R1 = "aaaaaaaa-1111-4222-8333-444455556666";
const R2 = "bbbbbbbb-1111-4222-8333-444455556666";

const row = (report_id: string, src_bucket: string, src_path: string, content_type = "post"): HeldEvidenceRow => ({ report_id, content_type, src_bucket, src_path });

/** Fake world: the RPC answers `rows`, copy() records calls (and can fail / say "exists"), reports.evidence lives in a map. */
function fake(rows: HeldEvidenceRow[], opts: { evidence?: Record<string, EvidenceEntry[]>; copyError?: (from: string, to: string) => string | null; saveError?: boolean } = {}) {
  const evidence = new Map<string, EvidenceEntry[]>(Object.entries(opts.evidence ?? {}));
  const copies: { bucket: string; from: string; to: string; destinationBucket?: string }[] = [];
  const saves: string[] = [];
  const deps: EvidenceDeps = {
    heldEvidence(userId) {
      assertEquals(userId, UID);
      return Promise.resolve(rows);
    },
    getEvidence: (id) => Promise.resolve(evidence.get(id) ?? []),
    saveEvidence(id, entries) {
      if (opts.saveError) return Promise.reject(new Error("save failed"));
      saves.push(id);
      evidence.set(id, entries);
      return Promise.resolve();
    },
    storage: {
      from(bucket: string) {
        return {
          copy(from: string, to: string, options?: { destinationBucket?: string }) {
            copies.push({ bucket, from, to, destinationBucket: options?.destinationBucket });
            const err = opts.copyError?.(from, to) ?? null;
            return Promise.resolve({ error: err ? { message: err } : null });
          },
        };
      },
    },
    now: () => new Date("2026-11-08T12:00:00.000Z"),
  };
  return { deps, evidence, copies, saves };
}

Deno.test("copy ok: each file goes to report-evidence/<report>/<bucket>/<basename> and is recorded", async () => {
  const f = fake([row(R1, "profile-media", `${UID}/p1.jpg`), row(R1, "post-media", `${UID}/business/b/x.png`), row(R2, "dm-media", `c1/${UID}/v.m4a`, "dm_message")]);
  const out = await copyHeldEvidence(f.deps, UID);
  assertEquals(out, { copied: 3, skipped: 0 });
  assertEquals(f.copies.map((c) => [c.bucket, c.from, c.to, c.destinationBucket]), [
    ["profile-media", `${UID}/p1.jpg`, `${R1}/profile-media/p1.jpg`, "report-evidence"],
    ["post-media", `${UID}/business/b/x.png`, `${R1}/post-media/x.png`, "report-evidence"],
    ["dm-media", `c1/${UID}/v.m4a`, `${R2}/dm-media/v.m4a`, "report-evidence"],
  ]);
  assertEquals(f.evidence.get(R1)!.length, 2);
  assertEquals(f.evidence.get(R1)![0], { bucket: "report-evidence", path: `${R1}/profile-media/p1.jpg`, src_bucket: "profile-media", src_path: `${UID}/p1.jpg`, copied_at: "2026-11-08T12:00:00.000Z" });
  assertEquals(f.saves, [R1, R2]);
});

Deno.test("already copied: an entry already in reports.evidence is not copied again and the record is not rewritten", async () => {
  const done: EvidenceEntry = { bucket: "report-evidence", path: evidencePath(row(R1, "profile-media", `${UID}/p1.jpg`)), src_bucket: "profile-media", src_path: `${UID}/p1.jpg`, copied_at: "2026-11-01T00:00:00.000Z" };
  const f = fake([row(R1, "profile-media", `${UID}/p1.jpg`)], { evidence: { [R1]: [done] } });
  assertEquals(await copyHeldEvidence(f.deps, UID), { copied: 0, skipped: 1 });
  assertEquals(f.copies.length, 0);
  assertEquals(f.saves.length, 0);
});

Deno.test("a new file next to an existing record: the old entry is kept and the new one is appended", async () => {
  const done: EvidenceEntry = { bucket: "report-evidence", path: `${R1}/profile-media/p1.jpg`, src_bucket: "profile-media", src_path: `${UID}/p1.jpg`, copied_at: "2026-11-01T00:00:00.000Z" };
  const f = fake([row(R1, "profile-media", `${UID}/p1.jpg`), row(R1, "profile-media", `${UID}/p2.jpg`)], { evidence: { [R1]: [done] } });
  assertEquals(await copyHeldEvidence(f.deps, UID), { copied: 1, skipped: 1 });
  assertEquals(f.evidence.get(R1)!.map((e) => e.path), [`${R1}/profile-media/p1.jpg`, `${R1}/profile-media/p2.jpg`]);
  assertEquals(f.evidence.get(R1)![0].copied_at, "2026-11-01T00:00:00.000Z");
});

Deno.test("a copy that exists in Storage but was never recorded is recorded, not a failure", async () => {
  const f = fake([row(R1, "avatars", `${UID}/avatar.png`, "user")], { copyError: () => "The resource already exists" });
  assertEquals(await copyHeldEvidence(f.deps, UID), { copied: 1, skipped: 0 });
  assertEquals(f.evidence.get(R1)!.length, 1);
});

Deno.test("a failing copy throws and records NOTHING for that report (the caller stops the deletion)", async () => {
  const f = fake([row(R1, "profile-media", `${UID}/p1.jpg`), row(R1, "profile-media", `${UID}/p2.jpg`)], { copyError: (from) => (from.endsWith("p2.jpg") ? "storage unavailable" : null) });
  await assertRejects(() => copyHeldEvidence(f.deps, UID), Error, "storage unavailable");
  assertEquals(f.saves.length, 0, "the first copy was not recorded either: the next attempt starts clean (copying again is harmless)");
});

Deno.test("a failure while recording throws too", async () => {
  const f = fake([row(R1, "avatars", `${UID}/avatar.png`, "user")], { saveError: true });
  await assertRejects(() => copyHeldEvidence(f.deps, UID), Error, "save failed");
});

Deno.test("no reports in hold: nothing is touched", async () => {
  const f = fake([]);
  assertEquals(await copyHeldEvidence(f.deps, UID), { copied: 0, skipped: 0 });
  assertEquals(f.copies.length, 0);
  assertEquals(f.saves.length, 0);
});

Deno.test("an RPC failure throws", async () => {
  const f = fake([]);
  f.deps.heldEvidence = () => Promise.reject(new Error("rpc down"));
  await assertRejects(() => copyHeldEvidence(f.deps, UID), Error, "rpc down");
});

Deno.test("planRows drops bad buckets (match-photos, the evidence bucket itself), traversal, bad ids, empty names and duplicates", () => {
  const out = planRows([
    row(R1, "profile-media", `${UID}/ok.jpg`),
    row(R1, "profile-media", `${UID}/ok.jpg`),
    row(R1, "match-photos", `${UID}/m.jpg`),
    row(R1, "verification-selfies", `${UID}/s.jpg`),
    row(R1, "report-evidence", `${R1}/x/y.jpg`),
    row(R1, "profile-media", `${UID}/../other/x.jpg`),
    row(R1, "profile-media", ""),
    row(R1, "profile-media", `${UID}/`),
    row("not-a-uuid", "profile-media", `${UID}/z.jpg`),
    null as unknown as HeldEvidenceRow,
  ]);
  assertEquals(out.map((r) => r.src_path), [`${UID}/ok.jpg`]);
  assertEquals(planRows(null), []);
});

Deno.test("runEvidenceStep: ok returns the report and logs nothing", async () => {
  const logs: string[][] = [];
  const out = await runEvidenceStep({ copy: () => Promise.resolve({ copied: 2, skipped: 0 }), log: (a, d) => { logs.push([a, d]); return Promise.resolve(); } });
  assertEquals(out, { ok: true, report: { copied: 2, skipped: 0 } });
  assertEquals(logs.length, 0);
});

Deno.test("runEvidenceStep: a failure → ok false and ONE security_logs row without paths; a failing log does not hide the failure", async () => {
  const logs: string[][] = [];
  const bad = await runEvidenceStep({ copy: () => Promise.reject(new Error(`copy profile-media: boom ${UID}/secret.jpg`)), log: (a, d) => { logs.push([a, d]); return Promise.resolve(); } });
  assertEquals(bad, { ok: false });
  assertEquals(logs, [["evidence_copy_failed", "copy_failed"]]);
  const worse = await runEvidenceStep({ copy: () => Promise.reject(new Error("x")), log: () => Promise.reject(new Error("db down")) });
  assertEquals(worse, { ok: false });
});
