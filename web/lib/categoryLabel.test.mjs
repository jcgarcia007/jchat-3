// Run: node --test lib/categoryLabel.test.mjs  (Node 22.18+/24 strip the TypeScript types of the import below)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { categoryKey, categoryLabel } from "./categoryLabel.ts";

const load = (l) => JSON.parse(readFileSync(new URL(`../messages/${l}.json`, import.meta.url), "utf8"));
const translator = (dict) => Object.assign((k) => dict[k], { has: (k) => k in dict });

test("categoryKey normalizes accents, case and symbols", () => {
  assert.equal(categoryKey("Bar & Nightclub"), "bar_nightclub");
  assert.equal(categoryKey("  Café "), "cafe");
  assert.equal(categoryKey("Rooftop Bar"), "rooftop_bar");
  assert.equal(categoryKey(null), "");
});

test("every category of the registration form has a key in both languages", () => {
  const reg = readFileSync(new URL("../app/business/register/page.tsx", import.meta.url), "utf8");
  const list = reg.match(/const CATEGORIES = \[([\s\S]*?)\];/)[1];
  const names = [...list.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(names.length >= 10);
  for (const lang of ["es", "en"]) {
    const dict = load(lang).businessCategories;
    for (const n of names) assert.ok(categoryKey(n) in dict, `${lang}: ${n}`);
  }
});

test("known category is translated, unknown free text is shown as written", () => {
  const es = translator(load("es").businessCategories);
  assert.equal(categoryLabel("Restaurant", es), "Restaurante");
  assert.equal(categoryLabel("café", es), "Café");
  assert.equal(categoryLabel("Panadería artesanal", es), "Panadería artesanal");
  assert.equal(categoryLabel("", es), "");
});
