import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleChatMediaPurge, isChatMediaPath, MAX_IDS, type ChatMediaBucket, type HandlerDeps, type QueueRow } from "./handler.ts";

const SECRET = "test-secret-value";
const UID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ROOM = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const BIZ = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const PHOTO = `${UID}/1790000000000.jpg`;
const PHOTO2 = `${UID}/1790000000001-x1y2z3.png`;
const VOICE = `room/${ROOM}/${UID}/abcdef0123456789.m4a`;
const BUSINESS_POST = `${UID}/business/${BIZ}/1790000000002.jpg`;

function mk(rows: QueueRow[], over: Partial<HandlerDeps> = {}, used: string[] = []) {
  const queue = new Map<string, QueueRow>(rows.map((r) => [r.id, r]));
  const removed: Array<{ bucket: string; paths: string[] }> = [];
  const errors: Record<string, string> = {};
  const asked: Array<{ bucket: string; paths: string[] }> = [];
  const deps: HandlerDeps = {
    secret: SECRET,
    loadRows: (ids) => Promise.resolve(ids.filter((i) => queue.has(i)).map((i) => queue.get(i)!)),
    inUse: (bucket: ChatMediaBucket, paths) => { asked.push({ bucket, paths }); return Promise.resolve(paths.filter((p) => used.includes(p))); },
    remove: (bucket, paths) => { removed.push({ bucket, paths }); return Promise.resolve({ error: null }); },
    deleteRows: (ids) => { for (const i of ids) queue.delete(i); return Promise.resolve(); },
    markError: (ids, e) => { for (const i of ids) errors[i] = e; return Promise.resolve(); },
    ...over,
  };
  return { deps, queue, removed, errors, asked };
}

function post(ids: unknown, secret: string | null = SECRET, method = "POST"): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (secret !== null) headers["x-push-secret"] = secret;
  return new Request("http://local/chat-media-purge", { method, headers, body: method === "POST" ? JSON.stringify({ ids }) : undefined });
}

const BASE: QueueRow[] = [
  { id: ID(1), bucket: "post-media", path: PHOTO },
  { id: ID(2), bucket: "voice-notes", path: VOICE },
];

Deno.test("wrong or missing secret → 401, nothing touched", async () => {
  const t = mk(BASE);
  assertEquals((await handleChatMediaPurge(post([ID(1)], "nope"), t.deps)).status, 401);
  assertEquals((await handleChatMediaPurge(post([ID(1)], null), t.deps)).status, 401);
  assertEquals(t.removed.length, 0);
  assertEquals(t.queue.size, 2);
});

Deno.test("no secret configured → 500; not a POST → 405; bad body → 400", async () => {
  assertEquals((await handleChatMediaPurge(post([ID(1)]), mk(BASE, { secret: undefined }).deps)).status, 500);
  assertEquals((await handleChatMediaPurge(post([ID(1)], SECRET, "GET"), mk(BASE).deps)).status, 405);
  const bad = new Request("http://local/x", { method: "POST", headers: { "x-push-secret": SECRET }, body: "not json" });
  assertEquals((await handleChatMediaPurge(bad, mk(BASE).deps)).status, 400);
  assertEquals((await handleChatMediaPurge(post("nope"), mk(BASE).deps)).status, 400);
});

Deno.test("ok: the photo and the voice note are removed from THEIR bucket and the queue rows deleted", async () => {
  const t = mk(BASE);
  const res = await handleChatMediaPurge(post([ID(1), ID(2), ID(99)]), t.deps);
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { removed: 2, kept: 0, failed: 0 });
  assertEquals(t.removed, [{ bucket: "post-media", paths: [PHOTO] }, { bucket: "voice-notes", paths: [VOICE] }]);
  assertEquals(t.queue.size, 0);
});

Deno.test("a path that something still references is NOT removed and leaves the queue", async () => {
  const rows: QueueRow[] = [...BASE, { id: ID(3), bucket: "post-media", path: PHOTO2 }];
  const t = mk(rows, {}, [PHOTO]); // a pinned message still points at PHOTO
  const res = await handleChatMediaPurge(post([ID(1), ID(2), ID(3)]), t.deps);
  assertEquals(await res.json(), { removed: 2, kept: 1, failed: 0 });
  assertEquals(t.removed, [{ bucket: "post-media", paths: [PHOTO2] }, { bucket: "voice-notes", paths: [VOICE] }]);
  assertEquals(t.queue.size, 0);
});

Deno.test("if the in-use check fails, NOTHING is removed (500) and the rows stay", async () => {
  const t = mk(BASE, { inUse: () => Promise.reject(new Error("in_use_failed")) });
  const res = await handleChatMediaPurge(post([ID(1), ID(2)]), t.deps);
  assertEquals(res.status, 500);
  assertEquals(t.removed.length, 0);
  assertEquals(t.queue.size, 2);
});

Deno.test("a business post in post-media (4 segments), another bucket or a path that leaves its folder is never removed", async () => {
  const rows: QueueRow[] = [
    { id: ID(1), bucket: "post-media", path: BUSINESS_POST },
    { id: ID(2), bucket: "profile-media", path: PHOTO },
    { id: ID(3), bucket: "post-media", path: `${UID}/../${UID}/x.jpg` },
    { id: ID(4), bucket: "voice-notes", path: `${UID}/x.m4a` },
    { id: ID(5), bucket: "post-media", path: "" },
    { id: ID(6), bucket: "post-media", path: PHOTO },
  ];
  const t = mk(rows);
  const res = await handleChatMediaPurge(post([ID(1), ID(2), ID(3), ID(4), ID(5), ID(6)]), t.deps);
  assertEquals(await res.json(), { removed: 1, kept: 0, failed: 5 });
  assertEquals(t.removed, [{ bucket: "post-media", paths: [PHOTO] }]);
  assertEquals([ID(1), ID(2), ID(3), ID(4), ID(5)].every((i) => t.errors[i] === "invalid_row" && t.queue.has(i)), true);
});

Deno.test("a failed removal keeps the rows with a generic error; the other bucket is still handled", async () => {
  const t = mk(BASE, {
    remove: (bucket) => bucket === "post-media" ? Promise.resolve({ error: { message: "boom /secret/path" } }) : Promise.resolve({ error: null }),
  });
  const res = await handleChatMediaPurge(post([ID(1), ID(2)]), t.deps);
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { removed: 1, kept: 0, failed: 1 });
  assertEquals(t.errors[ID(1)], "remove_failed"); // generic: never the storage message or a path
  assertEquals(t.queue.has(ID(1)), true);
  assertEquals(t.queue.has(ID(2)), false);
});

Deno.test("ids: only uuids, deduplicated, at most MAX_IDS; empty → nothing", async () => {
  const t = mk(BASE);
  const res = await handleChatMediaPurge(post([ID(1), ID(1), "not-a-uuid", 7, null]), t.deps);
  assertEquals(await res.json(), { removed: 1, kept: 0, failed: 0 });
  assertEquals(t.removed, [{ bucket: "post-media", paths: [PHOTO] }]);
  const empty = await handleChatMediaPurge(post([]), mk(BASE).deps);
  assertEquals(await empty.json(), { removed: 0, kept: 0, failed: 0 });
  const many = Array.from({ length: MAX_IDS + 20 }, (_, i) => ({ id: ID(i + 1), bucket: "post-media", path: `${UID}/f${i}.jpg` }));
  const big = mk(many);
  const r = await handleChatMediaPurge(post(many.map((m) => m.id)), big.deps);
  assertEquals((await r.json()).removed, MAX_IDS);
});

Deno.test("isChatMediaPath: the exact shapes the app uploads", () => {
  assertEquals(isChatMediaPath("post-media", PHOTO), true);
  assertEquals(isChatMediaPath("post-media", PHOTO2), true);
  assertEquals(isChatMediaPath("voice-notes", VOICE), true);
  assertEquals(isChatMediaPath("post-media", BUSINESS_POST), false);
  assertEquals(isChatMediaPath("voice-notes", PHOTO), false);
  assertEquals(isChatMediaPath("post-media", VOICE), false);
  assertEquals(isChatMediaPath("dm-media", `${ROOM}/${UID}/a.m4a`), false);
  assertEquals(isChatMediaPath("report-evidence", "r1/avatars/a.png"), false);
});
