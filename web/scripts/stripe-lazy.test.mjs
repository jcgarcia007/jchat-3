// Lote 3 / H-068: stripe.js (~300 KB) must not be fetched when the public menu opens. The default entry of @stripe/stripe-js injects the
// <script> as soon as the module is evaluated; `@stripe/stripe-js/pure` only does it when loadStripe() is called (the payment step).
// Run from web/:  node --test scripts/stripe-lazy.test.mjs
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const ROOT = new URL("..", import.meta.url).pathname;

function* sources(dir) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* sources(full);
    else if (/\.(ts|tsx)$/.test(name) && !/\.d\.ts$/.test(name)) yield full;
  }
}

test("no source imports the side-effect entry of @stripe/stripe-js (only /pure)", () => {
  const offenders = [];
  for (const dir of ["app", "components", "lib", "hooks", "services"]) {
    let files = [];
    try {
      files = [...sources(join(ROOT, dir))];
    } catch {
      continue; // folder does not exist
    }
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      // `import type { … } from "@stripe/stripe-js"` is fine: it is erased and evaluates nothing.
      const runtimeText = text.replace(/import\s+type\s+[^;]*?from\s+["']@stripe\/stripe-js["'];?/g, "");
      if (/from\s+["']@stripe\/stripe-js["']|import\(\s*["']@stripe\/stripe-js["']\s*\)|require\(\s*["']@stripe\/stripe-js["']\s*\)/.test(runtimeText)) {
        offenders.push(file.replace(ROOT, ""));
      }
    }
  }
  assert.deepEqual(offenders, []);
});

test("the two payment components load Stripe from /pure and call loadStripe only with a key in hand", () => {
  for (const file of ["app/m/[slug]/CheckoutStep.tsx", "app/m/[slug]/StripePaymentFormQr.tsx"]) {
    const text = readFileSync(join(ROOT, file), "utf8");
    assert.match(text, /from "@stripe\/stripe-js\/pure"/, file);
    assert.match(text, /\(\s*(intent\?\.publishableKey|publishableKey)\s*\?\s*loadStripe\(/, `${file}: loadStripe must stay behind the key check`);
  }
});
