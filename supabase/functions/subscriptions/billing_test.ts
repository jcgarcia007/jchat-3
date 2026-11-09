import { assert, assertEquals, assertFalse, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildPriceIds,
  buildSubscriptionEmailPayload,
  checkoutInterval,
  emailDedupeKey,
  enqueueOutboundEmail,
  intervalFromPrice,
  periodEndOf,
  planFromPrice,
  priceIdsOfPlan,
  type QueuedEmail,
} from "./billing.ts";
import { readSubscriptionPayload } from "../_shared/emails/common.ts";
import { renderEmail } from "../_shared/emails/render.ts";

const env: Record<string, string> = {
  STRIPE_PRICE_BUSINESS: "pb", STRIPE_PRICE_BUSINESS_6M: "pb6", STRIPE_PRICE_BUSINESS_1Y: "pb1",
  STRIPE_PRICE_PRO: "pp", STRIPE_PRICE_PRO_6M: "pp6", STRIPE_PRICE_PRO_1Y: "pp1",
};
const ids = buildPriceIds((n) => env[n]);
const noWarn = () => {};

Deno.test("buildPriceIds: the six secrets, the monthly ones keep their names; a missing or empty one is undefined", () => {
  assertEquals(ids.business, { month: "pb", "6month": "pb6", year: "pb1" });
  assertEquals(ids.pro, { month: "pp", "6month": "pp6", year: "pp1" });
  const partial = buildPriceIds((n) => (n === "STRIPE_PRICE_PRO" ? "pp" : n === "STRIPE_PRICE_PRO_6M" ? "" : undefined));
  assertEquals(partial.pro, { month: "pp", "6month": undefined, year: undefined });
});

Deno.test("priceIdsOfPlan: all intervals of a plan, nothing for other plans", () => {
  assertEquals(priceIdsOfPlan(ids, "pro"), ["pp", "pp6", "pp1"]);
  assertEquals(priceIdsOfPlan(ids, "business"), ["pb", "pb6", "pb1"]);
  assertEquals(priceIdsOfPlan(ids, "verified"), []);
});

Deno.test("checkoutInterval: absent → month; the three values pass", () => {
  assertEquals(checkoutInterval("business", undefined), { ok: true, interval: "month" });
  assertEquals(checkoutInterval("pro", null), { ok: true, interval: "month" });
  for (const i of ["month", "6month", "year"] as const) assertEquals(checkoutInterval("pro", i), { ok: true, interval: i });
});

Deno.test("checkoutInterval: unknown values and wrong types → INVALID_INTERVAL", () => {
  for (const bad of ["6m", "1y", "YEAR", "", "weekly", 6, true, {}, []]) {
    assertEquals(checkoutInterval("business", bad), { ok: false, error: "INVALID_INTERVAL" });
  }
});

Deno.test("checkoutInterval: plans other than business/pro only allow month", () => {
  assertEquals(checkoutInterval("verified", "month"), { ok: true, interval: "month" });
  assertEquals(checkoutInterval("verified", "year"), { ok: false, error: "INVALID_INTERVAL" });
  assertEquals(checkoutInterval("regular", "6month"), { ok: false, error: "INVALID_INTERVAL" });
});

Deno.test("intervalFromPrice: the three known shapes", () => {
  assertEquals(intervalFromPrice({ recurring: { interval: "month", interval_count: 1 } }, noWarn), "month");
  assertEquals(intervalFromPrice({ recurring: { interval: "month", interval_count: 6 } }, noWarn), "6month");
  assertEquals(intervalFromPrice({ recurring: { interval: "year", interval_count: 1 } }, noWarn), "year");
  assertEquals(intervalFromPrice({ recurring: { interval: "month" } }, noWarn), "month"); // interval_count defaults to 1
});

Deno.test("intervalFromPrice: anything else → null and a warning", () => {
  const warnings: string[] = [];
  const warn = (m: string) => warnings.push(m);
  assertEquals(intervalFromPrice({ id: "p1", recurring: { interval: "month", interval_count: 3 } }, warn), null);
  assertEquals(intervalFromPrice({ id: "p2", recurring: { interval: "year", interval_count: 2 } }, warn), null);
  assertEquals(intervalFromPrice({ id: "p3", recurring: { interval: "week", interval_count: 1 } }, warn), null);
  assertEquals(intervalFromPrice({ id: "p4", recurring: null }, warn), null);
  assertEquals(intervalFromPrice(null, warn), null);
  assertEquals(warnings.length, 5);
});

Deno.test("planFromPrice: price.metadata.plan wins over a stale subscription metadata", () => {
  // portal swap Business → Pro: the price says pro, the subscription metadata still says business
  assertEquals(planFromPrice({ id: "pp6", metadata: { plan: "pro" } }, "business", ids), "pro");
});

Deno.test("planFromPrice: monthly prices (no metadata) fall back to the subscription metadata", () => {
  assertEquals(planFromPrice({ id: "pb", metadata: {} }, "business", ids), "business");
  assertEquals(planFromPrice({ id: "pb", metadata: null }, "pro", ids), "pro");
});

Deno.test("planFromPrice: last resort is the configured price ids", () => {
  assertEquals(planFromPrice({ id: "pp1", metadata: {} }, undefined, ids), "pro");
  assertEquals(planFromPrice({ id: "pb6", metadata: {} }, "garbage", ids), "business");
});

Deno.test("planFromPrice: nothing valid → null (never 'regular')", () => {
  assertEquals(planFromPrice({ id: "x", metadata: { plan: "regular" } }, "regular", ids), null);
  assertEquals(planFromPrice({ id: "x", metadata: { plan: "enterprise" } }, undefined, ids), null);
  assertEquals(planFromPrice(null, undefined, ids), null);
  assertEquals(planFromPrice({ id: "x" }, 42, undefined), null);
});

Deno.test("periodEndOf reads the root (API 2024-06-20)", () => {
  assertEquals(periodEndOf({ id: "sub_1", current_period_end: 1_800_000_000 }), new Date(1_800_000_000 * 1000).toISOString());
});

Deno.test("periodEndOf falls back to items.data[0] (API 2025+, root field removed)", () => {
  const sub = { id: "sub_2", items: { data: [{ current_period_end: 1_800_000_000 }] } };
  assertEquals(periodEndOf(sub), new Date(1_800_000_000 * 1000).toISOString());
});

Deno.test("periodEndOf prefers the root over the item", () => {
  const sub = { current_period_end: 1_800_000_000, items: { data: [{ current_period_end: 1_900_000_000 }] } };
  assertEquals(periodEndOf(sub), new Date(1_800_000_000 * 1000).toISOString());
});

Deno.test("periodEndOf never builds an invalid Date: null + warning", () => {
  const warnings: string[] = [];
  const warn = (m: string) => warnings.push(m);
  for (const bad of [undefined, null, {}, { id: "sub_3" }, { items: { data: [] } }, { current_period_end: NaN }, { current_period_end: null, items: { data: [{}] } }]) {
    assertEquals(periodEndOf(bad as never, warn), null);
  }
  assertEquals(warnings.length, 7);
});

// ── E3: subscription e-mail payload, dedupe key and queueing ────────────────────────────────────────────────────────────────────────────────

const TRIAL_END_S = Date.UTC(2026, 11, 8, 15, 0, 0) / 1000; // 2026-12-08T15:00:00Z
const PERIOD_END_S = Date.UTC(2027, 5, 8, 15, 0, 0) / 1000; // 2027-06-08T15:00:00Z
const subOf = (over: Record<string, unknown> = {}) => ({ id: "sub_TEST1", current_period_end: TRIAL_END_S, trial_end: TRIAL_END_S, ...over });
const priceOf = (cents: number) => ({ unit_amount: cents, currency: "usd" });

Deno.test("buildSubscriptionEmailPayload: the three intervals, with a free trial", () => {
  const cases: [import("./billing.ts").Interval, "business" | "pro", number][] = [["month", "business", 4900], ["6month", "pro", 53400], ["year", "pro", 94800]];
  for (const [interval, plan, cents] of cases) {
    const p = buildSubscriptionEmailPayload(subOf(), priceOf(cents), plan, interval, noWarn)!;
    assertEquals(p, {
      plan,
      interval,
      amount_cents: cents,
      currency: "usd",
      trial_end: "2026-12-08T15:00:00.000Z",
      period_end: "2026-12-08T15:00:00.000Z",
      subscription_id: "sub_TEST1",
    });
  }
});

Deno.test("buildSubscriptionEmailPayload: without a trial (trial_end null/absent/0) → trial_end null, period end kept", () => {
  for (const trial_end of [null, undefined, 0]) {
    const p = buildSubscriptionEmailPayload(subOf({ trial_end, current_period_end: PERIOD_END_S }), priceOf(46800), "business", "year", noWarn)!;
    assertEquals(p.trial_end, null);
    assertEquals(p.period_end, "2027-06-08T15:00:00.000Z");
  }
});

Deno.test("buildSubscriptionEmailPayload: period end from items[0] (API 2025+), currency lower-cased", () => {
  const p = buildSubscriptionEmailPayload(
    { id: "sub_T", trial_end: null, items: { data: [{ current_period_end: PERIOD_END_S }] } },
    { unit_amount: 9900, currency: "USD" },
    "pro",
    "month",
    noWarn,
  )!;
  assertEquals(p.period_end, "2027-06-08T15:00:00.000Z");
  assertEquals(p.currency, "usd");
});

Deno.test("buildSubscriptionEmailPayload: last4 only when the payment method came expanded (and is four digits)", () => {
  const expanded = buildSubscriptionEmailPayload(subOf({ default_payment_method: { id: "pm_1", card: { last4: "4242" } } }), priceOf(9900), "pro", "month", noWarn)!;
  assertEquals(expanded.last4, "4242");
  for (const pm of ["pm_123", null, undefined, {}, { card: {} }, { card: { last4: "42" } }, { card: { last4: "42; x" } }, { card: { last4: 4242 } }]) {
    assertFalse("last4" in buildSubscriptionEmailPayload(subOf({ default_payment_method: pm }), priceOf(9900), "pro", "month", noWarn)!);
  }
});

Deno.test("buildSubscriptionEmailPayload: nothing honest to send → null", () => {
  const ok = [subOf(), priceOf(9900), "pro", "month"] as const;
  assertEquals(buildSubscriptionEmailPayload(null, ok[1], "pro", "month", noWarn), null);
  assertEquals(buildSubscriptionEmailPayload(subOf({ id: "" }), ok[1], "pro", "month", noWarn), null);
  assertEquals(buildSubscriptionEmailPayload(subOf({ id: undefined }), ok[1], "pro", "month", noWarn), null);
  assertEquals(buildSubscriptionEmailPayload(ok[0], ok[1], "verified", "month", noWarn), null); // only business/pro get these e-mails
  assertEquals(buildSubscriptionEmailPayload(ok[0], ok[1], null, "month", noWarn), null);
  assertEquals(buildSubscriptionEmailPayload(ok[0], ok[1], "pro", null, noWarn), null);
  assertEquals(buildSubscriptionEmailPayload(ok[0], null, "pro", "month", noWarn), null);
  assertEquals(buildSubscriptionEmailPayload(ok[0], { unit_amount: null, currency: "usd" }, "pro", "month", noWarn), null);
  assertEquals(buildSubscriptionEmailPayload(ok[0], { unit_amount: 99.5, currency: "usd" }, "pro", "month", noWarn), null);
  assertEquals(buildSubscriptionEmailPayload(ok[0], { unit_amount: 9900, currency: "dollars" }, "pro", "month", noWarn), null);
  assertEquals(buildSubscriptionEmailPayload(subOf({ current_period_end: undefined, items: { data: [] } }), ok[1], "pro", "month", noWarn), null);
});

Deno.test("the payload satisfies the E2 templates: readSubscriptionPayload accepts it and both e-mails render (3 intervals, with/without trial)", () => {
  for (const [interval, cents] of [["month", 9900], ["6month", 53400], ["year", 94800]] as const) {
    for (const trial_end of [TRIAL_END_S, null]) {
      const p = buildSubscriptionEmailPayload(subOf({ trial_end, current_period_end: TRIAL_END_S }), priceOf(cents), "pro", interval, noWarn)!;
      assert(readSubscriptionPayload(p) !== null, `${interval} ${trial_end}`);
      const started = renderEmail("subscription_started", "es", p)!;
      assertStringIncludes(started.text, "Tu plan Pro está activo.");
      assertFalse(started.text.includes("sub_TEST1"));
      const ends = renderEmail("trial_will_end", "en", p);
      assertEquals(ends === null, trial_end === null); // the trial notice needs a trial end
      if (ends) assertStringIncludes(ends.text, `$${cents / 100}.00`);
    }
  }
});

Deno.test("emailDedupeKey: one key per kind and subscription", () => {
  assertEquals(emailDedupeKey("subscription_started", "sub_1"), "subscription_started:sub_1");
  assertEquals(emailDedupeKey("trial_will_end", "sub_1"), "trial_will_end:sub_1");
  assert(emailDedupeKey("subscription_started", "sub_1") !== emailDedupeKey("trial_will_end", "sub_1"));
});

function fakeOutbox(result: () => Promise<{ error: unknown }> | { error: unknown }) {
  const calls: { table: string; row: Record<string, unknown>; options: { onConflict: string; ignoreDuplicates: boolean } }[] = [];
  const db = { from: (table: string) => ({ upsert: (row: Record<string, unknown>, options: { onConflict: string; ignoreDuplicates: boolean }) => { calls.push({ table, row, options }); return Promise.resolve(result()); } }) };
  return { db, calls };
}

const queued = (): QueuedEmail => ({
  kind: "subscription_started",
  user_id: "00000000-0000-4000-8000-000000000001",
  payload: buildSubscriptionEmailPayload(subOf(), priceOf(9900), "pro", "month", noWarn)!,
  dedupe_key: "subscription_started:sub_TEST1",
});

Deno.test("enqueueOutboundEmail: upserts into outbound_emails on dedupe_key with ignoreDuplicates (a resent event queues nothing new)", async () => {
  const f = fakeOutbox(() => ({ error: null }));
  assertEquals(await enqueueOutboundEmail(f.db, queued(), () => {}), true);
  assertEquals(f.calls.length, 1);
  assertEquals(f.calls[0].table, "outbound_emails");
  assertEquals(f.calls[0].options, { onConflict: "dedupe_key", ignoreDuplicates: true });
  assertEquals(f.calls[0].row.kind, "subscription_started");
  assertEquals(f.calls[0].row.user_id, "00000000-0000-4000-8000-000000000001");
  assertEquals(f.calls[0].row.dedupe_key, "subscription_started:sub_TEST1");
  assertEquals((f.calls[0].row.payload as { plan: string }).plan, "pro");
});

Deno.test("enqueueOutboundEmail never throws: a queue error or exception is logged (generic, no payload) and reported as false", async () => {
  const logs: string[] = [];
  const log = (m: string, d?: unknown) => logs.push(m + JSON.stringify(d ?? ""));
  assertEquals(await enqueueOutboundEmail(fakeOutbox(() => ({ error: { code: "23514", message: "boom" } })).db, queued(), log), false);
  const throwing = { from: () => ({ upsert: () => { throw new Error("db down"); } }) };
  assertEquals(await enqueueOutboundEmail(throwing, queued(), log), false);
  const rejecting = { from: () => ({ upsert: () => Promise.reject(new Error("net")) }) };
  assertEquals(await enqueueOutboundEmail(rejecting, queued(), log), false);
  assertEquals(logs.length, 3);
  for (const line of logs) {
    assertStringIncludes(line, "could not queue e-mail");
    assertFalse(line.includes("amount_cents")); // the payload is never logged
    assertFalse(line.includes("@"));
  }
});
