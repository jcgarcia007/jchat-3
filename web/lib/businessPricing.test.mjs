// Run: node --test web/lib/businessPricing.test.mjs  (Node 22.18+/24 strip the TypeScript types of the import below)
//
// The amounts the page shows (lib/businessPricing.ts) must equal the Stripe prices of the phase-A script
// (supabase/scripts/stripe_create_interval_prices.ts). The script is Deno code, so it is read as text, not imported.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BUSINESS_INTERVALS, BILLING_INTERVALS, formatUsd, firstChargeAt, DEFAULT_TRIAL_DAYS } from "./businessPricing.ts";

const script = readFileSync(new URL("../../supabase/scripts/stripe_create_interval_prices.ts", import.meta.url), "utf8");

/** { business_6m: 26400, … } from the `lookupKey: "…", cents: N` pairs of the script. */
const scriptCents = Object.fromEntries(
  [...script.matchAll(/lookupKey:\s*"([a-z_0-9]+)",\s*cents:\s*(\d+)/g)].map((m) => [m[1], Number(m[2])]),
);
const baseCents = Object.fromEntries([...script.matchAll(/BASE_CENTS\s*=\s*\{\s*business:\s*(\d+),\s*pro:\s*(\d+)/g)].flatMap((m) => [["business", Number(m[1])], ["pro", Number(m[2])]]));

test("the script exposes the 4 interval prices and the 2 monthly bases", () => {
  assert.deepEqual(Object.keys(scriptCents).sort(), ["business_1y", "business_6m", "pro_1y", "pro_6m"]);
  assert.deepEqual(baseCents, { business: 4900, pro: 9900 });
});

test("the charge per period matches the Stripe price in cents (month, 6 months, year)", () => {
  for (const plan of ["business", "pro"]) {
    assert.equal(BUSINESS_INTERVALS[plan].month.totalCents, baseCents[plan], `${plan} month`);
    assert.equal(BUSINESS_INTERVALS[plan]["6month"].totalCents, scriptCents[`${plan}_6m`], `${plan} 6 months`);
    assert.equal(BUSINESS_INTERVALS[plan].year.totalCents, scriptCents[`${plan}_1y`], `${plan} year`);
  }
});

test("the per-month figure is the total divided by the months, and the discounts are 0 / 10 / 20 %", () => {
  for (const plan of ["business", "pro"]) {
    const base = BUSINESS_INTERVALS[plan].month.totalCents;
    for (const [interval, pct] of [["month", 0], ["6month", 10], ["year", 20]]) {
      const row = BUSINESS_INTERVALS[plan][interval];
      assert.equal(row.discountPct, pct);
      assert.equal(row.monthlyCents * row.months, row.totalCents, `${plan} ${interval}: monthly × months = total`);
      // The shown per-month price is the monthly price minus the discount (rounded down to whole dollars, as in the approved mockups).
      assert.equal(row.monthlyCents, Math.floor((base * (100 - pct)) / 100 / 100) * 100, `${plan} ${interval}: discounted monthly`);
    }
  }
});

test("presented amounts are the approved ones: 49/44/39 and 99/89/79", () => {
  assert.deepEqual(BILLING_INTERVALS.map((i) => BUSINESS_INTERVALS.business[i].monthlyCents / 100), [49, 44, 39]);
  assert.deepEqual(BILLING_INTERVALS.map((i) => BUSINESS_INTERVALS.pro[i].monthlyCents / 100), [99, 89, 79]);
  assert.deepEqual(BILLING_INTERVALS.map((i) => BUSINESS_INTERVALS.business[i].totalCents / 100), [49, 264, 468]);
  assert.deepEqual(BILLING_INTERVALS.map((i) => BUSINESS_INTERVALS.pro[i].totalCents / 100), [99, 534, 948]);
});

test("formatUsd and firstChargeAt", () => {
  assert.equal(formatUsd(4900), "$49");
  assert.equal(formatUsd(26400), "$264");
  assert.equal(formatUsd(4950), "$49.50");
  assert.equal(DEFAULT_TRIAL_DAYS, 30);
  assert.equal(firstChargeAt(0, 30), 30 * 86_400_000);
});
