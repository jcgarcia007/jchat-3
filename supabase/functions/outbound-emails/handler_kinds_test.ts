import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleOutboundEmails, type HandlerDeps } from "./handler.ts";

const SECRET = "test-secret-value";
const ID_REQ = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ID_SUB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ID_NEWS = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

// The handler passes the new columns through: kind, to_email and reply_to reach Resend as the right recipient and Reply-To.
Deno.test("handler: one call delivers a sales e-mail (to_email + reply_to), a customer e-mail and skips an unknown kind", async () => {
  const marks: Record<string, string> = {};
  const bodies: Record<string, unknown>[] = [];
  const rows = [
    { id: ID_REQ, kind: "business_plan_request", user_id: null, to_email: "ventas@jchat.cloud", reply_to: "dueno@example.com", payload: { business_name: "Grupo Demo", email: "dueno@example.com", locations_count: 3 }, attempts: 1 },
    { id: ID_SUB, kind: "subscription_started", user_id: "u1", payload: { plan: "business", interval: "month", amount_cents: 4900, currency: "usd", trial_end: null, period_end: "2026-12-08T15:00:00Z" }, attempts: 0 },
    { id: ID_NEWS, kind: "newsletter", user_id: "u1", payload: {}, attempts: 0 },
  ];
  const deps: HandlerDeps = {
    secret: SECRET,
    resendKey: "re_test",
    loadRows: (ids) => Promise.resolve(rows.filter((r) => ids.includes(r.id))),
    recipient: (uid) => Promise.resolve(uid === "u1" ? { email: "cliente@example.test", language: "en" as const } : null),
    markRow: (id, status, error) => { marks[id] = error ? `${status}:${error}` : status; return Promise.resolve(); },
    fetchFn: (_u, init) => { bodies.push(JSON.parse(String(init?.body))); return Promise.resolve(new Response("{}", { status: 200 })); },
  };
  const req = new Request("http://local/outbound-emails", { method: "POST", headers: { "Content-Type": "application/json", "x-push-secret": SECRET }, body: JSON.stringify({ ids: [ID_REQ, ID_SUB, ID_NEWS] }) });
  const res = await handleOutboundEmails(req, deps);
  assertEquals(await res.json(), { sent: 2, failed: 0, skipped: 1, pending: 0 });
  assertEquals(marks, { [ID_REQ]: "sent", [ID_SUB]: "sent", [ID_NEWS]: "skipped:unknown_kind" });
  assertEquals(bodies[0].to, ["ventas@jchat.cloud"]);
  assertEquals(bodies[0].reply_to, "dueno@example.com");
  assertEquals(bodies[1].to, ["cliente@example.test"]);
  assertEquals(bodies[1].subject, "Your Business plan is active");
});
