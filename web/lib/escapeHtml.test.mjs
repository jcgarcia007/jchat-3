// Run: node --test lib/escapeHtml.test.mjs  (Node 22.18+/24 strip the TypeScript types of the import below)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { escapeHtml } from "./escapeHtml.ts";

test("escapes the characters that open markup", () => {
  assert.equal(escapeHtml(`</title><script>alert("x")</script>`), "&lt;/title&gt;&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
  assert.equal(escapeHtml(`Tom & Jerry's`), "Tom &amp; Jerry&#39;s");
  assert.equal(escapeHtml("Mesa 5"), "Mesa 5");
});

test("the table QR print window escapes the owner's table label", () => {
  const src = readFileSync(new URL("../components/dashboard/TableQrModal.tsx", import.meta.url), "utf8");
  assert.match(src, /import \{ escapeHtml \} from "@\/lib\/escapeHtml"/);
  assert.match(src, /const title = escapeHtml\(t\("tablesQrModalTitle", \{ label: table\.label \}\)\)/);
});
