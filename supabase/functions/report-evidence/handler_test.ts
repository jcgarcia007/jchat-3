import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleReportEvidence, kindOf, type EvidenceEntry, type HandlerDeps } from "./handler.ts";

const RID = "11111111-1111-4111-8111-111111111111";
const ADMIN = "aaaaaaaa-1111-4111-8111-111111111111";

function mk(over: Partial<HandlerDeps> & { evidence?: EvidenceEntry[] | null; admin?: boolean; caller?: string | null } = {}) {
  const logs: [string, string, number][] = [];
  const signed: { bucket: string; paths: string[]; ttl: number }[] = [];
  const evidence = over.evidence === undefined ? [
    { bucket: "report-evidence", path: `${RID}/profile-media/p1.jpg`, src_bucket: "profile-media" },
    { bucket: "report-evidence", path: `${RID}/dm-media/v.m4a`, src_bucket: "dm-media" },
  ] : over.evidence;
  const deps: HandlerDeps = {
    callerId: () => Promise.resolve(over.caller === undefined ? ADMIN : over.caller),
    isAdmin: () => Promise.resolve(over.admin ?? true),
    loadEvidence: () => Promise.resolve(evidence),
    sign: (bucket, paths, ttl) => { signed.push({ bucket, paths, ttl }); return Promise.resolve(paths.map((p) => `https://x.example.com/sign/${p}?token=t`)); },
    log: (actor, report, n) => { logs.push([actor, report, n]); return Promise.resolve(); },
    ...over,
  };
  return { deps, logs, signed };
}

const post = (body: unknown, method = "POST") => new Request("http://local/report-evidence", { method, headers: { "Content-Type": "application/json", Authorization: "Bearer t" }, body: method === "POST" ? JSON.stringify(body) : undefined });

Deno.test("not an admin → 403, nothing signed or logged", async () => {
  const t = mk({ admin: false });
  const res = await handleReportEvidence(post({ report_id: RID }), t.deps);
  assertEquals(res.status, 403);
  assertEquals(t.signed.length, 0);
  assertEquals(t.logs.length, 0);
});

Deno.test("no valid session → 401", async () => {
  assertEquals((await handleReportEvidence(post({ report_id: RID }), mk({ caller: null }).deps)).status, 401);
});

Deno.test("admin → signed URLs for 10 minutes in the stored order, with kind and label, and ONE evidence_viewed log", async () => {
  const t = mk();
  const res = await handleReportEvidence(post({ report_id: RID }), t.deps);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.items.map((i: { kind: string; label: string }) => [i.kind, i.label]), [["image", "profile-media"], ["audio", "dm-media"]]);
  assertEquals(body.items[0].url.startsWith("https://x.example.com/sign/"), true);
  assertEquals(t.signed, [{ bucket: "report-evidence", paths: [`${RID}/profile-media/p1.jpg`, `${RID}/dm-media/v.m4a`], ttl: 600 }]);
  assertEquals(t.logs, [[ADMIN, RID, 2]]);
  assertEquals(JSON.stringify(body).includes("src_path"), false, "the original paths never leave the function");
});

Deno.test("a report without evidence → empty list, no signing, no log", async () => {
  const t = mk({ evidence: [] });
  const res = await handleReportEvidence(post({ report_id: RID }), t.deps);
  assertEquals(await res.json(), { items: [] });
  assertEquals(t.signed.length, 0);
  assertEquals(t.logs.length, 0);
});

Deno.test("unknown report → 404; bad body → 400; GET → 405; OPTIONS → CORS", async () => {
  assertEquals((await handleReportEvidence(post({ report_id: RID }), mk({ evidence: null }).deps)).status, 404);
  assertEquals((await handleReportEvidence(post({ report_id: "nope" }), mk().deps)).status, 400);
  assertEquals((await handleReportEvidence(post({}), mk().deps)).status, 400);
  assertEquals((await handleReportEvidence(post(null, "GET"), mk().deps)).status, 405);
  const opt = await handleReportEvidence(new Request("http://local/", { method: "OPTIONS" }), mk().deps);
  assertEquals(opt.status, 200);
  assertEquals(opt.headers.get("Access-Control-Allow-Origin"), "*");
});

Deno.test("entries outside the evidence bucket or with traversal are never signed; an unsignable object is left out", async () => {
  const t = mk({
    evidence: [
      { bucket: "avatars", path: "x/y.png" },
      { bucket: "report-evidence", path: `${RID}/../z.png` },
      { bucket: "report-evidence", path: `${RID}/story-media/s.jpg`, src_bucket: "story-media" },
      { bucket: "report-evidence", path: `${RID}/story-media/lost.jpg`, src_bucket: "story-media" },
    ],
    sign: (_b, paths) => Promise.resolve(paths.map((p) => (p.endsWith("lost.jpg") ? null : `https://x.example.com/${p}`))),
  });
  const body = await (await handleReportEvidence(post({ report_id: RID }), t.deps)).json();
  assertEquals(body.items.length, 1);
  assertEquals(t.logs, [[ADMIN, RID, 1]]);
});

Deno.test("a failure inside → 500 without details", async () => {
  const t = mk({ loadEvidence: () => Promise.reject(new Error("db down")) });
  const res = await handleReportEvidence(post({ report_id: RID }), t.deps);
  assertEquals(res.status, 500);
  assertEquals(await res.json(), { error: "unexpected" });
});

Deno.test("kindOf: images, audio and the rest", () => {
  assertEquals([kindOf("a/b.JPG"), kindOf("a/b.png"), kindOf("a/b.m4a"), kindOf("a/b.webp"), kindOf("a/b.pdf"), kindOf("a/b")], ["image", "image", "audio", "image", "file", "file"]);
});
