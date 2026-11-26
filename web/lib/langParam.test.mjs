// Run: node --test lib/langParam.test.mjs  (Node 22.18+/24 strip the TypeScript types of the import below)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseLangParam, LANG_COOKIE } from "./langParam.ts";

test("only es and en are accepted", () => {
  assert.equal(parseLangParam("es"), "es");
  assert.equal(parseLangParam("en"), "en");
  for (const bad of ["ES", "fr", "", "es-MX", "en,es", null, undefined, "<script>"]) {
    assert.equal(parseLangParam(bad), null);
  }
});

test("the cookie name matches the one i18n/request.ts reads", () => {
  const req = readFileSync(new URL("../i18n/request.ts", import.meta.url), "utf8");
  assert.ok(req.includes(`COOKIE_NAME = "${LANG_COOKIE}"`));
});

test("middleware wires ?lang into the request and the response cookie", () => {
  const mw = readFileSync(new URL("../middleware.ts", import.meta.url), "utf8");
  assert.match(mw, /parseLangParam\(request\.nextUrl\.searchParams\.get\('lang'\)\)/);
  assert.match(mw, /request\.cookies\.set\(LANG_COOKIE/);
  assert.match(mw, /res\.cookies\.set\(LANG_COOKIE/);
});
