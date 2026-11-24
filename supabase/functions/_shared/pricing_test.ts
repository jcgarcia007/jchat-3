import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { computeTaxCents, getEffectiveTaxRate } from "./pricing.ts";

const BIZ = "10000000-0000-4000-8000-000000000001";

// Fake client: answers the effective_tax_rate RPC like migration 184 does
// (coalesce(business rate, state rate, 0) + source), so the helper's mapping is what is tested.
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

Deno.test("tax: business without rate and without state → 0 (never an invented 8%)", async () => {
  const c = client({ data: [{ rate: 0, source: "none" }], error: null });
  // deno-lint-ignore no-explicit-any
  const tax = await getEffectiveTaxRate(c as any, BIZ);
  assertEquals(tax, { rate: 0, source: "none" });
  assertEquals(c.calls, [{ fn: "effective_tax_rate", args: { p_business_id: BIZ } }]);
  assertEquals(computeTaxCents(1200, (tax as { rate: number }).rate), 0);
});

Deno.test("tax: no own rate, state FL → the state's 6%: $12.00 → $0.72", async () => {
  // deno-lint-ignore no-explicit-any
  const tax = await getEffectiveTaxRate(client({ data: [{ rate: "0.0600", source: "state" }], error: null }) as any, BIZ);
  assertEquals(tax, { rate: 0.06, source: "state" });
  assertEquals(computeTaxCents(1200, (tax as { rate: number }).rate), 72);
});

Deno.test("tax: the business's own rate wins", async () => {
  // deno-lint-ignore no-explicit-any
  const tax = await getEffectiveTaxRate(client({ data: [{ rate: 0.0875, source: "business" }], error: null }) as any, BIZ);
  assertEquals(tax, { rate: 0.0875, source: "business" });
  assertEquals(computeTaxCents(1200, 0.0875), 105);
});

Deno.test("tax: RPC returns a single row (not an array) → same result", async () => {
  // deno-lint-ignore no-explicit-any
  const tax = await getEffectiveTaxRate(client({ data: { rate: 0.06, source: "state" }, error: null }) as any, BIZ);
  assertEquals(tax, { rate: 0.06, source: "state" });
});

Deno.test("tax: DB error → { error } (the caller answers 500 and does NOT charge)", async () => {
  // deno-lint-ignore no-explicit-any
  const tax = await getEffectiveTaxRate(client({ data: null, error: { message: "boom" } }) as any, BIZ);
  assertEquals("error" in tax, true);
});

Deno.test("tax: business not found (no row) → { error }, never a default rate", async () => {
  // deno-lint-ignore no-explicit-any
  const tax = await getEffectiveTaxRate(client({ data: [], error: null }) as any, BIZ);
  assertEquals("error" in tax, true);
});
