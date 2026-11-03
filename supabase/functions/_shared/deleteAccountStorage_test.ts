import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildPurgePlan,
  chunk,
  listAllObjects,
  purgePlan,
  type StorageApi,
  type StorageEntry,
} from "./deleteAccountStorage.ts";

const UID = "3ddf4a2e-1111-4222-8333-444455556666";
const OTHER = "99999999-aaaa-4bbb-8ccc-dddddddddddd";
const CONV = "c0c0c0c0-1111-4222-8333-444455556666";
const ROOM = "r0r0r0r0".replace(/r/g, "a") + "-1111-4222-8333-444455556666";

/** A fake bucket tree: path → entries. A key like "u" lists the folder "u". */
function fakeStorage(tree: Record<string, Record<string, StorageEntry[]>>, opts: { failRemoveIn?: string; missing?: string[] } = {}) {
  const removed: Record<string, string[]> = {};
  const storage: StorageApi = {
    from(bucket: string) {
      return {
        list(path, { limit, offset }) {
          if (opts.missing?.includes(bucket)) return Promise.resolve({ data: null, error: { message: "Bucket not found" } });
          const entries = tree[bucket]?.[path] ?? [];
          return Promise.resolve({ data: entries.slice(offset, offset + limit), error: null });
        },
        remove(paths) {
          if (opts.failRemoveIn === bucket) return Promise.resolve({ error: { message: "boom" } });
          (removed[bucket] ??= []).push(...paths);
          return Promise.resolve({ error: null });
        },
      };
    },
  };
  return { storage, removed };
}

Deno.test("plan: every user-folder bucket gets <uid>/, dm-media gets <conversation>/<uid>/ per conversation, menu-photos never", () => {
  const plan = buildPurgePlan(UID, { conversationIds: [CONV, CONV, "not-a-uuid"] });
  const folders = plan.folders.map((f) => `${f.bucket}:${f.prefix}`);
  for (const bucket of ["avatars", "covers", "profile-media", "post-media", "match-photos", "story-media", "verification-selfies"]) {
    assertEquals(folders.includes(`${bucket}:${UID}`), true, bucket);
  }
  assertEquals(folders.filter((f) => f.startsWith("dm-media:")), [`dm-media:${CONV}/${UID}`]);
  assertEquals(folders.some((f) => f.startsWith("menu-photos")), false);
});

Deno.test("plan: only the person's own voice paths survive (other uid, other bucket layout, traversal)", () => {
  const own = `room/${ROOM}/${UID}/a.m4a`;
  const plan = buildPurgePlan(UID, {
    voiceRoomPaths: [own, own, `room/${ROOM}/${OTHER}/b.m4a`, `room/${ROOM}/${UID}/../x.m4a`, `other/${ROOM}/${UID}/c.m4a`, `room/${ROOM}/${UID}/d/e.m4a`],
  });
  assertEquals(plan.objects, [{ bucket: "voice-notes", path: own }]);
});

Deno.test("plan: a malformed uid is refused", () => {
  assertEquals((() => { try { buildPurgePlan("../etc"); return "built"; } catch (e) { return (e as Error).message; } })(), "invalid_uid");
});

Deno.test("chunk splits in 100s", () => {
  assertEquals(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assertEquals(chunk(Array.from({ length: 250 }, (_, i) => i)).map((c) => c.length), [100, 100, 50]);
});

Deno.test("listing is recursive and paged", async () => {
  const many = Array.from({ length: 150 }, (_, i) => ({ name: `f${i}.png`, id: `id${i}` }));
  const { storage } = fakeStorage({ covers: { [UID]: [{ name: "biz", id: null }], [`${UID}/biz`]: [{ name: "cover", id: null }], [`${UID}/biz/cover`]: many } });
  const paths = await listAllObjects(storage, "covers", UID);
  assertEquals(paths.length, 150);
  assertEquals(paths.includes(`${UID}/biz/cover/f149.png`), true);
});

Deno.test("purge removes only what the plan lists, in batches, and a missing bucket is not an error", async () => {
  const { storage, removed } = fakeStorage(
    {
      avatars: { [UID]: [{ name: "1.jpg", id: "a" }, { name: "2.jpg", id: "b" }] },
      "dm-media": { [`${CONV}/${UID}`]: [{ name: "v.m4a", id: "c" }] },
    },
    { missing: ["story-media"] },
  );
  const plan = buildPurgePlan(UID, { conversationIds: [CONV], voiceRoomPaths: [`room/${ROOM}/${UID}/n.m4a`] });
  const count = await purgePlan(storage, plan);
  assertEquals(count, 4);
  assertEquals(removed["avatars"], [`${UID}/1.jpg`, `${UID}/2.jpg`]);
  assertEquals(removed["dm-media"], [`${CONV}/${UID}/v.m4a`]);
  assertEquals(removed["voice-notes"], [`room/${ROOM}/${UID}/n.m4a`]);
});

Deno.test("a Storage error makes the purge throw (the function then answers storage_purge_failed and deletes nothing)", async () => {
  const { storage } = fakeStorage({ avatars: { [UID]: [{ name: "1.jpg", id: "a" }] } }, { failRemoveIn: "avatars" });
  await assertRejects(() => purgePlan(storage, buildPurgePlan(UID)), Error, "remove avatars");
});
