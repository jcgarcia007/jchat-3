// Run: node --test lib/phoneFormat.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatPhone } from "./phoneFormat.ts";

test("a full number gets the complete mask, opening parenthesis included", () => {
  assert.equal(formatPhone("7548005084"), "(754) 800-5084");
  assert.equal(formatPhone("(754) 800-5084"), "(754) 800-5084");
  assert.equal(formatPhone("754) 800-5084"), "(754) 800-5084");
  assert.equal(formatPhone("754-800-5084"), "(754) 800-5084");
});

test("a +1 or 1 prefix is dropped", () => {
  assert.equal(formatPhone("+1 754 800 5084"), "(754) 800-5084");
  assert.equal(formatPhone("17548005084"), "(754) 800-5084");
});

test("progressive while typing", () => {
  assert.equal(formatPhone("7"), "(7");
  assert.equal(formatPhone("754"), "(754");
  assert.equal(formatPhone("7548"), "(754) 8");
  assert.equal(formatPhone("754800"), "(754) 800");
  assert.equal(formatPhone("7548005"), "(754) 800-5");
});

test("extra digits are cut, international numbers are kept", () => {
  assert.equal(formatPhone("754800508499"), "(754) 800-5084");
  assert.equal(formatPhone("+44 20 7946 0958"), "+44 20 7946 0958");
});

test("empty and null give an empty string", () => {
  assert.equal(formatPhone(""), "");
  assert.equal(formatPhone(null), "");
  assert.equal(formatPhone("abc"), "");
});
