import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { chunk, planFromRows, purgeUserObjects, type PurgeAdmin, type StorageObjectRow } from "./deleteAccountStorage.ts";

const UID = "3ddf4a2e-1111-4222-8333-444455556666";

/** A fake admin: the RPC answers (at most `cap` rows per call) from an in-memory set, remove() deletes from it and records the batches. */
function fakeAdmin(initial: StorageObjectRow[], opts: { cap?: number; rpcError?: string; removeError?: string; neverRemove?: boolean } = {}) {
  const store = new Map(initial.map((r) => [`${r.bucket_id}\u0000${r.name}`, r]));
  const batches: { bucket: string; size: number }[] = [];
  let rpcCalls = 0;
  const admin: PurgeAdmin = {
    rpc(fn, args) {
      rpcCalls += 1;
      assertEquals(fn, "storage_user_object_paths");
      assertEquals(args, { p_user: UID });
      if (opts.rpcError) return Promise.resolve({ data: null, error: { message: opts.rpcError } });
      return Promise.resolve({ data: [...store.values()].slice(0, opts.cap ?? 1000), error: null });
    },
    storage: {
      from(bucket: string) {
        return {
          remove(paths: string[]) {
            if (opts.removeError) return Promise.resolve({ error: { message: opts.removeError } });
            batches.push({ bucket, size: paths.length });
            if (!opts.neverRemove) for (const p of paths) store.delete(`${bucket}\u0000${p}`);
            return Promise.resolve({ error: null });
          },
        };
      },
    },
  };
  return { admin, batches, left: () => store.size, rpcCalls: () => rpcCalls };
}

const rows = (bucket: string, n: number, prefix = UID): StorageObjectRow[] => Array.from({ length: n }, (_, i) => ({ bucket_id: bucket, name: `${prefix}/f${i}.jpg` }));

Deno.test("objects in 3 buckets: batches of 100 per bucket, the count, and a last RPC round that comes back empty", async () => {
  const fake = fakeAdmin([...rows("avatars", 250), ...rows("dm-media", 3, `c0c0/${UID}`), ...rows("voice-notes", 2, `room/r1/${UID}`)]);
  const removed = await purgeUserObjects(fake.admin, UID);
  assertEquals(removed, 255);
  assertEquals(fake.batches.filter((b) => b.bucket === "avatars").map((b) => b.size), [100, 100, 50]);
  assertEquals(fake.batches.filter((b) => b.bucket === "dm-media").map((b) => b.size), [3]);
  assertEquals(fake.batches.filter((b) => b.bucket === "voice-notes").map((b) => b.size), [2]);
  assertEquals(fake.left(), 0);
  assertEquals(fake.rpcCalls(), 2, "one round with everything, one empty round that ends the loop");
});

Deno.test("an API cap on the RPC answer is handled: it asks again until nothing is left", async () => {
  const fake = fakeAdmin([...rows("post-media", 130), ...rows("covers", 130)], { cap: 120 });
  assertEquals(await purgeUserObjects(fake.admin, UID), 260);
  assertEquals(fake.left(), 0);
  assertEquals(fake.rpcCalls() > 2, true);
});

Deno.test("nothing to delete: 0 removed, no Storage call", async () => {
  const fake = fakeAdmin([]);
  assertEquals(await purgeUserObjects(fake.admin, UID), 0);
  assertEquals(fake.batches.length, 0);
});

Deno.test("menu-photos, unknown buckets, empty names, '..' and duplicates are never deleted", () => {
  const plan = planFromRows([
    { bucket_id: "menu-photos", name: `biz/${UID}/x.png` },
    { bucket_id: "secrets", name: `${UID}/x.png` },
    { bucket_id: "avatars", name: "" },
    { bucket_id: "avatars", name: `${UID}/../other/x.png` },
    { bucket_id: "avatars", name: `${UID}/ok.png` },
    { bucket_id: "avatars", name: `${UID}/ok.png` },
    // deno-lint-ignore no-explicit-any
    { bucket_id: 5, name: "x" } as any,
  ]);
  assertEquals(plan.objects, [{ bucket: "avatars", path: `${UID}/ok.png` }]);
});

Deno.test("if the RPC fails the purge throws (the function answers storage_purge_failed and deletes nothing)", async () => {
  const fake = fakeAdmin([], { rpcError: "function does not exist" });
  await assertRejects(() => purgeUserObjects(fake.admin, UID), Error, "storage_user_object_paths");
});

Deno.test("if a Storage delete fails the purge throws", async () => {
  const fake = fakeAdmin(rows("avatars", 2), { removeError: "boom" });
  await assertRejects(() => purgeUserObjects(fake.admin, UID), Error, "remove avatars");
});

Deno.test("objects that keep coming back never loop forever", async () => {
  const fake = fakeAdmin(rows("avatars", 2), { neverRemove: true });
  await assertRejects(() => purgeUserObjects(fake.admin, UID), Error, "did not converge");
});

Deno.test("chunk splits in 100s", () => {
  assertEquals(chunk(Array.from({ length: 250 }, (_, i) => i)).map((c) => c.length), [100, 100, 50]);
});
