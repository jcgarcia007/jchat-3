import { assert, assertEquals, assertFalse, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { deliverClosedReservationEmails, deliverQueuedEmails, type EmailDeps, type EmailRow } from "../ownerCloseEmails.ts";

const TRIAL = { plan: "pro", interval: "6month", amount_cents: 53400, currency: "usd", trial_end: "2026-12-08T15:00:00Z", period_end: "2026-12-08T15:00:00Z", subscription_id: "sub_X" };
const REQUEST = {
  business_name: "Grupo Demo", locations_count: 12, phone: null, email: "dueno@example.com", message: null, locale: "en",
  request_id: "11111111-1111-4111-8111-111111111111", created_at: "2026-11-08T15:30:00Z",
};

function fake(rows: EmailRow[], over: Partial<EmailDeps> = {}) {
  const marks: Record<string, { status: string; attempts: number; error?: string }> = {};
  const sent: { url: string; body: Record<string, unknown>; auth: string | null }[] = [];
  const deps: EmailDeps = {
    loadRows: () => Promise.resolve(rows),
    recipient: (uid) => Promise.resolve(uid === "u-es" ? { email: "cliente@example.test", language: "es" as const } : uid === "u-en" ? { email: "customer@example.test", language: "en" as const } : null),
    markRow: (id, status, attempts, error) => { marks[id] = { status, attempts, error }; return Promise.resolve(); },
    resendKey: "re_test",
    fetchFn: (url, init) => {
      sent.push({ url: String(url), body: JSON.parse(String(init?.body)), auth: new Headers(init?.headers).get("Authorization") });
      return Promise.resolve(new Response("{}", { status: 200 }));
    },
    ...over,
  };
  return { deps, marks, sent };
}

Deno.test("external recipient (to_email) with reply_to: sent to ventas@, Reply-To = the requester, Spanish text", async () => {
  const t = fake([{ id: "r1", kind: "business_plan_request", user_id: null, to_email: "ventas@jchat.cloud", reply_to: "dueno@example.com", payload: REQUEST, attempts: 0 }]);
  const report = await deliverQueuedEmails(t.deps, ["r1"]);
  assertEquals(report, { sent: 1, failed: 0, skipped: 0, pending: 0 });
  assertEquals(t.marks.r1, { status: "sent", attempts: 1, error: undefined });
  assertEquals(t.sent.length, 1);
  assertEquals(t.sent[0].url, "https://api.resend.com/emails");
  assertEquals(t.sent[0].auth, "Bearer re_test");
  assertEquals(t.sent[0].body.to, ["ventas@jchat.cloud"]);
  assertEquals(t.sent[0].body.reply_to, "dueno@example.com");
  assertEquals(t.sent[0].body.from, "JChat <noreply@jchat.cloud>");
  assertEquals(t.sent[0].body.subject, "Nueva solicitud de plan Custom — Grupo Demo");
  assertStringIncludes(String(t.sent[0].body.text), "Negocio: Grupo Demo");
});

Deno.test("customer e-mails use the account's address and language; no reply_to key when the row has none", async () => {
  const t = fake([
    { id: "s1", kind: "subscription_started", user_id: "u-es", payload: TRIAL, attempts: 0 },
    { id: "s2", kind: "trial_will_end", user_id: "u-en", payload: TRIAL, attempts: 1 },
  ]);
  const report = await deliverQueuedEmails(t.deps, ["s1", "s2"]);
  assertEquals(report.sent, 2);
  assertEquals(t.sent[0].body.to, ["cliente@example.test"]);
  assertEquals(t.sent[0].body.subject, "Tu plan Pro está activo");
  assertFalse("reply_to" in t.sent[0].body);
  assertEquals(t.sent[1].body.to, ["customer@example.test"]);
  assertEquals(t.sent[1].body.subject, "Your free trial ends on December 8, 2026");
  assertEquals(t.marks.s2.attempts, 2);
});

Deno.test("user_id wins over to_email; an external row takes its language from payload.locale", async () => {
  const t = fake([
    { id: "a", kind: "subscription_started", user_id: "u-es", to_email: "other@example.test", payload: TRIAL, attempts: 0 },
    { id: "b", kind: "subscription_started", user_id: null, to_email: "ext@example.test", payload: { ...TRIAL, locale: "en" }, attempts: 0 },
    { id: "c", kind: "subscription_started", user_id: null, to_email: "ext2@example.test", payload: TRIAL, attempts: 0 },
  ]);
  await deliverQueuedEmails(t.deps, ["a", "b", "c"]);
  assertEquals(t.sent[0].body.to, ["cliente@example.test"]);
  assertEquals(t.sent[1].body.subject, "Your Pro plan is active");
  assertEquals(t.sent[2].body.subject, "Tu plan Pro está activo");
});

Deno.test("unknown kind (or none) → skipped('unknown_kind'), nothing sent", async () => {
  const t = fake([
    { id: "k1", kind: "newsletter", user_id: "u-es", payload: {}, attempts: 0 },
    { id: "k2", user_id: "u-es", payload: {}, attempts: 3 },
  ]);
  const report = await deliverQueuedEmails(t.deps, ["k1", "k2"]);
  assertEquals(report, { sent: 0, failed: 0, skipped: 2, pending: 0 });
  assertEquals(t.marks.k1, { status: "skipped", attempts: 1, error: "unknown_kind" });
  assertEquals(t.marks.k2, { status: "skipped", attempts: 4, error: "unknown_kind" });
  assertEquals(t.sent.length, 0);
});

Deno.test("no recipient, or a payload the template cannot use → skipped with a generic code", async () => {
  const t = fake([
    { id: "n1", kind: "subscription_started", user_id: "u-ghost", payload: TRIAL, attempts: 0 },
    { id: "n2", kind: "subscription_started", user_id: null, to_email: null, payload: TRIAL, attempts: 0 },
    { id: "p1", kind: "trial_will_end", user_id: "u-es", payload: { plan: "pro" }, attempts: 0 },
    { id: "p2", kind: "reservation_cancelled_business_closed", user_id: "u-es", payload: {}, attempts: 0 },
  ]);
  const report = await deliverQueuedEmails(t.deps, ["n1", "n2", "p1", "p2"]);
  assertEquals(report.skipped, 4);
  assertEquals(t.marks.n1.error, "no_recipient_or_payload");
  assertEquals(t.marks.n2.error, "no_recipient_or_payload");
  assertEquals(t.marks.p1.error, "invalid_payload");
  assertEquals(t.marks.p2.error, "no_recipient_or_payload"); // reservation rows keep the pre-E2 code
  assertEquals(t.sent.length, 0);
});

Deno.test("a malformed reply_to is dropped (the e-mail still goes out)", async () => {
  const t = fake([{ id: "m1", kind: "business_plan_request", user_id: null, to_email: "ventas@jchat.cloud", reply_to: "x@y.test\r\nBcc: z@evil.test", payload: REQUEST, attempts: 0 }]);
  assertEquals((await deliverQueuedEmails(t.deps, ["m1"])).sent, 1);
  assertFalse("reply_to" in t.sent[0].body);
});

Deno.test("Resend failure → failed with a generic code; no key → pending; loader error → pending; no ids → zeros", async () => {
  const rows: EmailRow[] = [{ id: "f1", kind: "business_plan_request", user_id: null, to_email: "ventas@jchat.cloud", payload: REQUEST, attempts: 0 }];
  const bad = fake(rows, { fetchFn: () => Promise.resolve(new Response("provider text with dueno@example.com", { status: 422 })) });
  assertEquals((await deliverQueuedEmails(bad.deps, ["f1"])).failed, 1);
  assertEquals(bad.marks.f1.error, "resend_http_422");
  const boom = fake(rows, { fetchFn: () => Promise.reject(new Error("network")) });
  assertEquals((await deliverQueuedEmails(boom.deps, ["f1"])).failed, 1);
  assertEquals(boom.marks.f1.error, "send_exception");
  assertEquals(await deliverQueuedEmails(fake(rows, { resendKey: undefined }).deps, ["f1"]), { sent: 0, failed: 0, skipped: 0, pending: 1 });
  assertEquals(await deliverQueuedEmails(fake(rows, { loadRows: () => Promise.reject(new Error("db")) }).deps, ["f1"]), { sent: 0, failed: 0, skipped: 0, pending: 1 });
  assertEquals(await deliverQueuedEmails(fake(rows).deps, []), { sent: 0, failed: 0, skipped: 0, pending: 0 });
});

Deno.test("deliverClosedReservationEmails (delete-account's entry point): kind-less rows are reservation e-mails, as before", async () => {
  const t = fake([{ id: "d1", user_id: "u-es", payload: { business_name: "Bar", reserved_at: "2026-12-01T20:00:00Z", timezone: "America/New_York" }, attempts: 0 }]);
  const report = await deliverClosedReservationEmails(t.deps, ["d1"]);
  assertEquals(report.sent, 1);
  assertEquals(t.sent[0].body.subject, "Reserva cancelada");
  assert(!("reply_to" in t.sent[0].body));
});
