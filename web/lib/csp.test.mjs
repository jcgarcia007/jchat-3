// Run: node --test lib/csp.test.mjs  (Node 22.18+/24 strip the TypeScript types of the import below)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildStrictCsp, generateNonce, isEmbeddablePath, SHARED_DIRECTIVES, STRICT_CSP_REPORT_ONLY_ENABLED, STRICT_REPORT_URI } from "./csp.ts";

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
  // every next() goes through nextWithCsp (fresh headers); the only bare one is the disabled branch, which is cbcdc1b6's behaviour
  assert.equal(source.split("NextResponse.next({ request })").length - 1, 1);
  assert.match(source, /if \(nonce === null \|\| strictCsp === null\) return NextResponse\.next\(\{ request \}\);/);
});

// The switch: OFF until after launch (HALLAZGOS H-066). Off = the middleware of cbcdc1b6: no nonce, no x-nonce, no CSP on the request,
// no Content-Security-Policy-Report-Only on the response. On = everything the tests above pin.
test("the strict policy is switched OFF", () => {
  assert.equal(STRICT_CSP_REPORT_ONLY_ENABLED, false);
  assert.match(readFileSync(new URL("./csp.ts", import.meta.url), "utf8"), /export const STRICT_CSP_REPORT_ONLY_ENABLED = false;/);
});

test("with the switch off the middleware generates no nonce and writes no CSP header anywhere", () => {
  const source = readFileSync(new URL("../middleware.ts", import.meta.url), "utf8");
  // nonce only exists behind the switch; strictCsp only exists when there is a nonce
  assert.match(source, /const nonce = STRICT_CSP_REPORT_ONLY_ENABLED \? generateNonce\(\) : null;/);
  assert.match(source, /nonce === null\s*\?\s*null\s*:\s*buildStrictCsp\(/);
  // every x-nonce / CSP write (request or response) sits after the early return of the disabled branch, or under `strictCsp !== null`
  const afterEarlyReturn = source.slice(source.indexOf("if (nonce === null || strictCsp === null) return"));
  const beforeEarlyReturn = source.slice(0, source.indexOf("if (nonce === null || strictCsp === null) return"));
  assert.ok(!/x-nonce|STRICT_CSP_HEADER, |'Content-Security-Policy'/.test(beforeEarlyReturn.replace(/\/\/.*$/gm, "").replace(/const STRICT_CSP_HEADER = [^;]+;/, "")));
  assert.match(afterEarlyReturn, /if \(strictCsp !== null\) res\.headers\.set\(STRICT_CSP_HEADER, strictCsp\)/);
});

test("the optional nonce of the JSON-LD adds no attribute without x-nonce", () => {
  const page = readFileSync(new URL("../app/b/[slug]/page.tsx", import.meta.url), "utf8");
  assert.match(page, /\.get\("x-nonce"\) \?\? undefined/); // undefined => React renders no nonce attribute
});

test("middleware puts the strict policy on the REQUEST as content-security-policy too, and never on the response", () => {
  const source = readFileSync(new URL("../middleware.ts", import.meta.url), "utf8");
  assert.match(source, /requestHeaders\.set\('Content-Security-Policy', strictCsp\)/);
  // the only response header the middleware writes for CSP is the report-only one
  const responseWrites = [...source.matchAll(/(?:res|response)\.headers\.(?:set|append)\(\s*([^,)]+)/g)].map((m) => m[1].trim());
  assert.deepEqual(responseWrites, ["STRICT_CSP_HEADER"]);
  assert.ok(!/(?:res|response)\.headers\.(?:set|append)\(\s*['"]content-security-policy['"]/i.test(source));
});
