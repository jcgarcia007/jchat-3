import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleEvidencePurge, type HandlerDeps, type QueueRow } from "./handler.ts";

const ID1 = "11111111-1111-4111-8111-111111111111";
const ID2 = "22222222-2222-4222-8222-222222222222";
const ID3 = "33333333-3333-4333-8333-333333333333";
const GHOST = "44444444-4444-4444-8444-444444444444";
const SECRET = "test-secret-value";

function mk(over: Partial<HandlerDeps> = {}, rows?: QueueRow[]) {
  const queue = new Map<string, QueueRow>((rows ?? [
    { id: ID1, bucket: "report-evidence", path: "r1/avatars/a.png" },
    { id: ID2, bucket: "report-evidence", path: "r1/dm-media/b.jpg" },
  ]).map((r) => [r.id, r]));
  const removed: string[][] = [];
  const errors: Record<string, string> = {};
  const deps: HandlerDeps = {
    secret: SECRET,
    loadRows: (ids) => Promise.resolve(ids.filter((i) => queue.has(i)).map((i) => queue.get(i)!)),
    remove: (paths) => { removed.push(paths); return Promise.resolve({ error: null }); },
    deleteRows: (ids) => { for (const i of ids) queue.delete(i); return Promise.resolve(); },
    markError: (ids, e) => { for (const i of ids) errors[i] = e; return Promise.resolve(); },
    ...over,
  };
  return { deps, queue, removed, errors };
}

function post(ids: unknown, secret: string | null = SECRET, method = "POST"): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (secret !== null) headers["x-push-secret"] = secret;
  return new Request("http://local/evidence-purge", { method, headers, body: method === "POST" ? JSON.stringify({ ids }) : undefined });
}

Deno.test("wrong or missing secret → 401, nothing touched", async () => {
  const t = mk();
  assertEquals((await handleEvidencePurge(post([ID1], "nope"), t.deps)).status, 401);
  assertEquals((await handleEvidencePurge(post([ID1], null), t.deps)).status, 401);
  assertEquals(t.removed.length, 0);
  assertEquals(t.queue.size, 2);
});

Deno.test("no secret configured → 500; not a POST → 405", async () => {
  assertEquals((await handleEvidencePurge(post([ID1]), mk({ secret: undefined }).deps)).status, 500);
  assertEquals((await handleEvidencePurge(post([ID1], SECRET, "GET"), mk().deps)).status, 405);
});

Deno.test("ok: the objects are removed from the evidence bucket and the queue rows deleted", async () => {
  const t = mk();
  const res = await handleEvidencePurge(post([ID1, ID2, GHOST]), t.deps);
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { removed: 2, failed: 0 });
  assertEquals(t.removed, [["r1/avatars/a.png", "r1/dm-media/b.jpg"]]);
  assertEquals(t.queue.size, 0);
});

Deno.test("error: Storage fails → the rows stay with a generic last_error (no path) and nothing is deleted from the queue", async () => {
  const t = mk({ remove: () => Promise.resolve({ error: { message: "boom r1/avatars/a.png" } }) });
  const res = await handleEvidencePurge(post([ID1, ID2]), t.deps);
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { removed: 0, failed: 2 });
  assertEquals(t.queue.size, 2);
  assertEquals(t.errors, { [ID1]: "remove_failed", [ID2]: "remove_failed" });
});

Deno.test("a row for another bucket or with a traversal path is never removed", async () => {
  const t = mk({}, [
    { id: ID1, bucket: "avatars", path: "someone/avatar.png" },
    { id: ID2, bucket: "report-evidence", path: "r1/../../x.png" },
    { id: ID3, bucket: "report-evidence", path: "r1/ok.png" },
  ]);
  const res = await handleEvidencePurge(post([ID1, ID2, ID3]), t.deps);
  assertEquals(await res.json(), { removed: 1, failed: 2 });
  assertEquals(t.removed, [["r1/ok.png"]]);
  assertEquals(t.errors, { [ID1]: "invalid_row", [ID2]: "invalid_row" });
  assertEquals([...t.queue.keys()].sort(), [ID1, ID2].sort());
});

Deno.test("bad body → 400; no valid ids → nothing happens; a database error → 500 without details", async () => {
  const t = mk();
  assertEquals((await handleEvidencePurge(new Request("http://local/", { method: "POST", headers: { "x-push-secret": SECRET }, body: "not json" }), t.deps)).status, 400);
  assertEquals((await handleEvidencePurge(post("nope"), t.deps)).status, 400);
  const none = await handleEvidencePurge(post(["x", 5, null]), t.deps);
  assertEquals(await none.json(), { removed: 0, failed: 0 });
  const boom = await handleEvidencePurge(post([ID1]), mk({ loadRows: () => Promise.reject(new Error("db down")) }).deps);
  assertEquals(boom.status, 500);
  assertEquals(await boom.json(), { error: "Internal server error" });
});
