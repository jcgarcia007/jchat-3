import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { venueIsClosed } from "./venue.ts";

const BIZ = "10000000-0000-4000-8000-000000000001";

function client(answer: { data: unknown; error: { message: string } | null }) {
  const calls: { fn: string; args?: Record<string, unknown> }[] = [];
  return {
    calls,
    rpc: (fn: string, args?: Record<string, unknown>) => {
      calls.push({ fn, args });
      // deno-lint-ignore no-explicit-any
      return Promise.resolve(answer as any);
    },
  };
}

Deno.test("venueIsClosed: asks business_is_open_now for that business; false (closed) → true", async () => {
  const c = client({ data: false, error: null });
  assertEquals(await venueIsClosed(c, BIZ), true);
  assertEquals(c.calls, [{ fn: "business_is_open_now", args: { p_business_id: BIZ } }]);
});

Deno.test("venueIsClosed: open (true) → not closed", async () => {
  assertEquals(await venueIsClosed(client({ data: true, error: null }), BIZ), false);
});

Deno.test("venueIsClosed: unknown hours (NULL) never blocks", async () => {
  assertEquals(await venueIsClosed(client({ data: null, error: null }), BIZ), false);
});

Deno.test("venueIsClosed: if the check errors it fails open (does not block selling)", async () => {
  assertEquals(await venueIsClosed(client({ data: null, error: { message: "boom" } }), BIZ), false);
});
