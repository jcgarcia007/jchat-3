// Run: node --test lib/stripeAccount.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isStripeConnectedId } from "./stripeAccount.ts";

test("only a real Stripe account id counts as connected", () => {
  assert.equal(isStripeConnectedId("acct_123"), true);
  assert.equal(isStripeConnectedId("acct_1Pq2RsABCdef"), true);
  assert.equal(isStripeConnectedId("  acct_123  "), true);
});

test("empty values are not connected", () => {
  assert.equal(isStripeConnectedId(null), false);
  assert.equal(isStripeConnectedId(undefined), false);
  assert.equal(isStripeConnectedId(""), false);
  assert.equal(isStripeConnectedId("   "), false);
  assert.equal(isStripeConnectedId("acct_"), false);
});

test("the made-up ids of the old sign-up are not connected", () => {
  assert.equal(isStripeConnectedId("acct_STUB_x"), false);
  assert.equal(isStripeConnectedId("acct_STUB_k3j9d0aa"), false);
  assert.equal(isStripeConnectedId("not_an_account"), false);
});

test("the business sign-up never writes stripe_account_id and carries no fake account", () => {
  const src = readFileSync(new URL("../app/business/register/page.tsx", import.meta.url), "utf8");
  // Drop comments: the rule may be mentioned there, but no code may touch the column.
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  assert.ok(!/stripe_account_id/.test(code), "register/page.tsx must not reference stripe_account_id in code");
  assert.ok(!/acct_STUB/.test(code), "register/page.tsx must not create acct_STUB_ ids");
  assert.ok(!/onConnected|handleConnect/.test(code), "the sign-up must not simulate a Stripe connection");
});
