// Run: node --test lib/dateFormat.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { capitalizeFirst, formatMonthYear, formatPanelDate } from "./dateFormat.ts";

test("month and year in Spanish keeps 'de' in lower case", () => {
  assert.equal(formatMonthYear(2026, 10, "es"), "Noviembre de 2026");
});

test("month and year in English", () => {
  assert.equal(formatMonthYear(2026, 10, "en"), "November 2026");
});

test("the panel locale wins over the default: same instant, different language", () => {
  const iso = "2026-11-08T12:00:00";
  const es = formatPanelDate(iso, "es", { month: "short", day: "numeric" });
  const en = formatPanelDate(iso, "en", { month: "short", day: "numeric" });
  assert.match(es, /nov/i);
  assert.equal(en, "Nov 8");
  assert.notEqual(es, en);
});

test("invalid dates give an empty string instead of 'Invalid Date'", () => {
  assert.equal(formatPanelDate("not-a-date", "es", { month: "short" }), "");
});

test("capitalizeFirst only touches the first letter", () => {
  assert.equal(capitalizeFirst("noviembre de 2026"), "Noviembre de 2026");
  assert.equal(capitalizeFirst(""), "");
});
