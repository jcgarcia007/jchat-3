import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleOutboundEmails, type HandlerDeps } from "./handler.ts";

const ID1 = "11111111-1111-4111-8111-111111111111";
const ID2 = "22222222-2222-4222-8222-222222222222";
const GHOST = "33333333-3333-4333-8333-333333333333";
const SECRET = "test-secret-value";

function mk(over: Partial<HandlerDeps> = {}, fetchStatus = 200) {
  const marks: Record<string, { status: string; error?: string }> = {};
  const sentTo: string[] = [];
  const rows = [
    { id: ID1, user_id: "u1", payload: { business_name: "Bar", reserved_at: "2026-12-01T20:00:00Z", timezone: "America/New_York" }, attempts: 1 },
    { id: ID2, user_id: null, payload: { business_name: "Bar", reserved_at: "2026-12-01T20:00:00Z" }, attempts: 2 },
  ];
  const deps: HandlerDeps = {
    secret: SECRET,
    resendKey: "re_test",
    loadRows: (ids) => Promise.resolve(rows.filter((r) => ids.includes(r.id))),
    recipient: (uid) => Promise.resolve(uid === "u1" ? { email: "a@example.invalid", language: "es" as const } : null),
    markRow: (id, status, error) => { marks[id] = { status, error }; return Promise.resolve(); },
    fetchFn: (_u, init) => { sentTo.push(String(init?.body)); return Promise.resolve(new Response("{}", { status: fetchStatus })); },
    ...over,
  };
  return { deps, marks, sentTo };
}

function post(ids: unknown, secret: string | null = SECRET): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (secret !== null) headers["x-push-secret"] = secret;
  return new Request("http://local/outbound-emails", { method: "POST", headers, body: JSON.stringify({ ids }) });
}

Deno.test("wrong or missing secret → 401, nothing touched", async () => {
  const t = mk();
  assertEquals((await handleOutboundEmails(post([ID1], "nope"), t.deps)).status, 401);
  assertEquals((await handleOutboundEmails(post([ID1], null), t.deps)).status, 401);
  assertEquals(t.marks, {});
  assertEquals(t.sentTo.length, 0);
});

Deno.test("a row whose user is gone (user_id null) → skipped, nothing sent", async () => {
  const t = mk();
  const res = await handleOutboundEmails(post([ID2]), t.deps);
  assertEquals(res.status, 200);
  assertEquals((await res.json()).skipped, 1);
  assertEquals(t.marks[ID2].status, "skipped");
  assertEquals(t.sentTo.length, 0);
});

Deno.test("delivery ok → sent", async () => {
  const t = mk();
  const res = await handleOutboundEmails(post([ID1]), t.deps);
  assertEquals((await res.json()).sent, 1);
  assertEquals(t.marks[ID1], { status: "sent", error: undefined });
  assertEquals(t.sentTo.length, 1);
});

Deno.test("Resend fails → failed with a generic last_error (no address, no provider text)", async () => {
  const t = mk({}, 500);
  const res = await handleOutboundEmails(post([ID1]), t.deps);
  assertEquals((await res.json()).failed, 1);
  assertEquals(t.marks[ID1], { status: "failed", error: "resend_http_500" });
});

Deno.test("unknown ids are ignored; garbage ids dropped", async () => {
  const t = mk();
  const res = await handleOutboundEmails(post([GHOST, "not-a-uuid", 7]), t.deps);
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { sent: 0, failed: 0, skipped: 0, pending: 0 });
  assertEquals(t.marks, {});
});

Deno.test("no RESEND_API_KEY → 503 and no row touched", async () => {
  const t = mk({ resendKey: undefined });
  assertEquals((await handleOutboundEmails(post([ID1]), t.deps)).status, 503);
  assertEquals(t.marks, {});
});

Deno.test("not POST → 405; function without secret configured → 500; bad body → 400", async () => {
  const t = mk();
  assertEquals((await handleOutboundEmails(new Request("http://local/", { method: "GET" }), t.deps)).status, 405);
  assertEquals((await handleOutboundEmails(post([ID1]), mk({ secret: undefined }).deps)).status, 500);
  const bad = new Request("http://local/", { method: "POST", headers: { "x-push-secret": SECRET }, body: "{" });
  assertEquals((await handleOutboundEmails(bad, t.deps)).status, 400);
  const noIds = new Request("http://local/", { method: "POST", headers: { "x-push-secret": SECRET }, body: "{}" });
  assertEquals((await handleOutboundEmails(noIds, t.deps)).status, 400);
});
