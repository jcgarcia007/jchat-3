// Run: node --test lib/sitemapEntries.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSitemap, isIndexableBusiness } from "./sitemapEntries.ts";

const B = "https://jchat.cloud";
const biz = (over) => ({ slug: "demo", status: "verified", is_active: true, updated_at: "2026-10-01T12:00:00Z", ...over });

test("verified and active businesses are listed with their own updated_at", () => {
  const out = buildSitemap(B, [biz({})]);
  const e = out.find((x) => x.url === `${B}/b/demo`);
  assert.ok(e);
  assert.equal(e.lastModified?.toISOString(), "2026-10-01T12:00:00.000Z");
});

test("pending, inactive and slug-less businesses are left out", () => {
  const out = buildSitemap(B, [biz({ slug: "a", status: "pending" }), biz({ slug: "b", is_active: false }), biz({ slug: null }), biz({ slug: "../x" })]);
  assert.equal(out.filter((x) => x.url.includes("/b/")).length, 0);
  assert.equal(isIndexableBusiness(biz({})), true);
});

test("pages without a real date have no lastModified instead of 'now'", () => {
  const out = buildSitemap(B, []);
  for (const path of ["", "/pricing", "/download"]) {
    const e = out.find((x) => x.url === `${B}${path}`);
    assert.ok(e, path);
    assert.equal(e.lastModified, undefined);
  }
  assert.ok(out.find((x) => x.url === `${B}/privacy`).lastModified instanceof Date);
});

test("the help center pages are listed, without a date", () => {
  const out = buildSitemap(B, [], ["/help", "/help/users", "/help/users/getting-started"]);
  for (const path of ["/help", "/help/users", "/help/users/getting-started"]) {
    const e = out.find((x) => x.url === `${B}${path}`);
    assert.ok(e, path);
    assert.equal(e.lastModified, undefined);
  }
  assert.equal(buildSitemap(B, []).some((x) => x.url.includes("/help")), false, "no help pages unless they are passed");
});

test("a missing or invalid updated_at gives no lastModified", () => {
  const out = buildSitemap(B, [biz({ slug: "x", updated_at: null }), biz({ slug: "y", updated_at: "nope" })]);
  assert.equal(out.find((e) => e.url.endsWith("/b/x")).lastModified, undefined);
  assert.equal(out.find((e) => e.url.endsWith("/b/y")).lastModified, undefined);
});
