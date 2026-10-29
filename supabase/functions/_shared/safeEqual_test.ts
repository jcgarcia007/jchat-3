import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { safeEqual } from "./safeEqual.ts";

Deno.test("equal secrets match", () => {
  assertEquals(safeEqual("s3cret-value", "s3cret-value"), true);
});

Deno.test("different secrets of the same length do not match", () => {
  assertEquals(safeEqual("s3cret-valuX", "s3cret-value"), false);
});

Deno.test("different lengths do not match, empty never matches a real secret", () => {
  assertEquals(safeEqual("s3cret", "s3cret-value"), false);
  assertEquals(safeEqual("", "s3cret-value"), false);
});

Deno.test("multi-byte characters compare by bytes", () => {
  assertEquals(safeEqual("ñandú", "ñandú"), true);
  assertEquals(safeEqual("ñandu", "ñandú"), false);
});
