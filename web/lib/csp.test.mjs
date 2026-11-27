// Run: node --test lib/csp.test.mjs  (Node 22.18+/24 strip the TypeScript types of the import below)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildStrictCsp, generateNonce, isEmbeddablePath, SHARED_DIRECTIVES, STRICT_REPORT_URI } from "./csp.ts";

const NONCE = "dGVzdC1ub25jZS0xMjM0NQ==";
const directives = (csp) => csp.split("; ");
const directive = (csp, name) => directives(csp).find((d) => d === name || d.startsWith(`${name} `));

test("script-src: nonce + strict-dynamic, https: and unsafe-inline only as fallback, no unsafe-eval in production", () => {
  const csp = buildStrictCsp({ nonce: NONCE, frameAncestors: "'none'", isDev: false });
  assert.equal(directive(csp, "script-src"), `script-src 'self' 'nonce-${NONCE}' 'strict-dynamic' https: 'unsafe-inline'`);
  assert.ok(!csp.includes("unsafe-eval"));
});

test("script-src: development adds unsafe-eval (Next needs it there)", () => {
  const csp = buildStrictCsp({ nonce: NONCE, frameAncestors: "'none'", isDev: true });
  assert.match(directive(csp, "script-src"), /'unsafe-eval'/);
});

test("frame-ancestors is whatever the caller gives; report-uri points at the strict tag", () => {
  const none = buildStrictCsp({ nonce: NONCE, frameAncestors: "'none'", isDev: false });
  assert.equal(directive(none, "frame-ancestors"), "frame-ancestors 'none'");
  const embed = buildStrictCsp({ nonce: NONCE, frameAncestors: "'self' https://jchat.cloud", isDev: false });
  assert.equal(directive(embed, "frame-ancestors"), "frame-ancestors 'self' https://jchat.cloud");
  assert.equal(directive(none, "report-uri"), `report-uri ${STRICT_REPORT_URI}`);
  assert.equal(STRICT_REPORT_URI, "/api/csp-report?p=strict");
});

test("only /m and /m/* are embeddable", () => {
  for (const p of ["/m", "/m/", "/m/bar-x", "/m/bar-x/checkout"]) assert.equal(isEmbeddablePath(p), true, p);
  for (const p of ["/", "/menu", "/me", "/mx/y", "/b/m", "/dashboard", "/api/m"]) assert.equal(isEmbeddablePath(p), false, p);
});

test("nonce: base64, 16 random bytes, different on every call", () => {
  const seen = new Set();
  for (let i = 0; i < 50; i++) {
    const n = generateNonce();
    assert.match(n, /^[A-Za-z0-9+/]{22}==$/);
    assert.equal(Buffer.from(n, "base64").length, 16);
    seen.add(n);
  }
  assert.equal(seen.size, 50);
});

// The strict policy must be the enforced one (next.config.ts `buildCsp`) with only script-src swapped: read the real source and compare.
test("every other directive is identical to next.config.ts buildCsp", () => {
  const source = readFileSync(new URL("../next.config.ts", import.meta.url), "utf8");
  const start = source.indexOf("const buildCsp");
  const block = source.slice(start, source.indexOf("].join(", start));
  const actual = [...block.matchAll(/`([^`]*)`/g)].map((m) =>
    m[1]
      .replaceAll("${SUPABASE_WS}", "wss://klfsgcfoahdtkojyqspd.supabase.co")
      .replaceAll("${SUPABASE}", "https://klfsgcfoahdtkojyqspd.supabase.co"),
  );
  const names = actual.map((d) => d.split(" ")[0]);
  assert.ok(names.includes("script-src") && names.includes("frame-ancestors") && names.includes("report-uri"));
  const shared = actual.filter((d) => !/^(script-src|frame-ancestors|report-uri)\b/.test(d));
  assert.deepEqual([...SHARED_DIRECTIVES], shared);
});

test("the enforced policy is untouched: next.config.ts still enforces and knows nothing of the strict one", () => {
  const source = readFileSync(new URL("../next.config.ts", import.meta.url), "utf8");
  assert.match(source, /const CSP_REPORT_ONLY = false;/);
  assert.ok(!/nonce|strict-dynamic/i.test(source.slice(source.indexOf("const buildCsp"))));
});

test("middleware sends the strict policy as report-only on request and response, plus x-nonce", () => {
  const source = readFileSync(new URL("../middleware.ts", import.meta.url), "utf8");
  assert.match(source, /STRICT_CSP_HEADER = 'Content-Security-Policy-Report-Only'/);
  assert.match(source, /requestHeaders\.set\('x-nonce', nonce\)/);
  assert.match(source, /requestHeaders\.set\(STRICT_CSP_HEADER, strictCsp\)/);
  assert.match(source, /res\.headers\.set\(STRICT_CSP_HEADER, strictCsp\)/);
  assert.ok(!source.includes("NextResponse.next({ request })"), "every next() must go through nextWithCsp (fresh headers)");
});
