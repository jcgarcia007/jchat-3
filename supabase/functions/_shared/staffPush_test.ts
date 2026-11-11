import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { staffPushContent } from "./staffPush.ts";

const P = { business_id: "b1", business_name: "Bar Luna", role_label: "Cajero" };

Deno.test("staff_added: es and en with the role", () => {
  assertEquals(staffPushContent("staff_added", P, false).body, "Bar Luna te agregó como Cajero");
  assertEquals(staffPushContent("staff_added", P, true).body, "Bar Luna added you as Cajero");
});

Deno.test("staff_added without a role: still a sentence (es and en)", () => {
  const p = { business_id: "b1", business_name: "Bar Luna", role_label: " " };
  assertEquals(staffPushContent("staff_added", p, false).body, "Bar Luna te agregó al personal");
  assertEquals(staffPushContent("staff_added", p, true).body, "Bar Luna added you to the staff");
});

Deno.test("staff_removed: es and en", () => {
  assertEquals(staffPushContent("staff_removed", P, false).body, "Ya no formas parte del personal de Bar Luna");
  assertEquals(staffPushContent("staff_removed", P, true).body, "You're no longer on the staff of Bar Luna");
});

Deno.test("without a venue name the text still reads well", () => {
  assertEquals(staffPushContent("staff_removed", { business_id: "b1" }, false).body, "Ya no formas parte del personal de Un local");
  assertEquals(staffPushContent("staff_added", { business_id: "b1" }, true).body, "A venue added you to the staff");
});

Deno.test("the push carries only the type and the business id (no role, no name)", () => {
  const c = staffPushContent("staff_added", P, false);
  assertEquals(c.title, "JChat");
  assertEquals(c.data, { type: "staff_added", payload: { business_id: "b1" } });
});
