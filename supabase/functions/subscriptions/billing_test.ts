import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildPriceIds, checkoutInterval, intervalFromPrice, periodEndOf, planFromPrice, priceIdsOfPlan } from "./billing.ts";

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
