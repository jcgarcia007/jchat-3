// Deno tests for the DM photo verdict (decideDmPhoto). Run: deno test supabase/functions/_shared/safesearch_test.ts
import assert from "node:assert/strict";
import { decideDmPhoto, LIKELIHOOD, type Likelihood, type SafeSearch } from "./safesearch.ts";

const NONE: SafeSearch = {
  adult: "VERY_UNLIKELY",
  racy: "VERY_UNLIKELY",
  violence: "VERY_UNLIKELY",
  medical: "VERY_UNLIKELY",
  spoof: "VERY_UNLIKELY",
};
const scores = (over: Partial<SafeSearch>): SafeSearch => ({ ...NONE, ...over });

// Expected verdict per category and likelihood (adult is the only one that can be rejected).
const ADULT: Record<Likelihood, string> = {
  UNKNOWN: "clear", VERY_UNLIKELY: "clear", UNLIKELY: "clear", POSSIBLE: "clear", LIKELY: "blurred", VERY_LIKELY: "rejected",
};
const RACY_OR_VIOLENCE: Record<Likelihood, string> = {
  UNKNOWN: "clear", VERY_UNLIKELY: "clear", UNLIKELY: "clear", POSSIBLE: "clear", LIKELY: "blurred", VERY_LIKELY: "blurred",
};

for (const level of LIKELIHOOD) {
  Deno.test(`adult ${level} → ${ADULT[level]}`, () => {
    assert.equal(decideDmPhoto(scores({ adult: level })), ADULT[level]);
  });
  Deno.test(`racy ${level} → ${RACY_OR_VIOLENCE[level]}`, () => {
    assert.equal(decideDmPhoto(scores({ racy: level })), RACY_OR_VIOLENCE[level]);
  });
  Deno.test(`violence ${level} → ${RACY_OR_VIOLENCE[level]}`, () => {
    assert.equal(decideDmPhoto(scores({ violence: level })), RACY_OR_VIOLENCE[level]);
  });
}

Deno.test("medical and spoof never change the verdict", () => {
  for (const level of LIKELIHOOD) {
    assert.equal(decideDmPhoto(scores({ medical: level })), "clear");
    assert.equal(decideDmPhoto(scores({ spoof: level })), "clear");
  }
});

Deno.test("POSSIBLE in every category at once stays clear", () => {
  assert.equal(
    decideDmPhoto({ adult: "POSSIBLE", racy: "POSSIBLE", violence: "POSSIBLE", medical: "POSSIBLE", spoof: "POSSIBLE" }),
    "clear",
  );
});

Deno.test("rejected wins over blurred", () => {
  assert.equal(decideDmPhoto(scores({ adult: "VERY_LIKELY", racy: "VERY_LIKELY", violence: "VERY_LIKELY" })), "rejected");
});

Deno.test("adult LIKELY with racy POSSIBLE is blurred (adult drives it)", () => {
  assert.equal(decideDmPhoto(scores({ adult: "LIKELY", racy: "POSSIBLE" })), "blurred");
});

Deno.test("adult POSSIBLE with racy LIKELY is blurred (racy drives it)", () => {
  assert.equal(decideDmPhoto(scores({ adult: "POSSIBLE", racy: "LIKELY" })), "blurred");
});
