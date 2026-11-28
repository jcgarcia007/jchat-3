// Run: node --test lib/registerErrors.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { registerErrorKind } from "./registerErrors.ts";

test("the code the server really raises (PLAN_LIMIT_COMBINED) is recognised", () => {
  const raised = "PLAN_LIMIT_COMBINED: plan regular allows 0 business(es)+event(s) total, already have 0";
  assert.equal(registerErrorKind(raised), "planLimit");
  assert.equal(registerErrorKind(`Error: ${raised}`), "planLimit");
});

test("the old codes still read well", () => {
  assert.equal(registerErrorKind("PLAN_LIMIT_BUSINESSES: x"), "planLimitBusinesses");
  assert.equal(registerErrorKind("PLAN_LIMIT_EVENTS: x"), "planLimitEvents");
});

test("any other error is left for the caller to show as it came", () => {
  assert.equal(registerErrorKind("duplicate key value violates unique constraint"), null);
  assert.equal(registerErrorKind(""), null);
});
