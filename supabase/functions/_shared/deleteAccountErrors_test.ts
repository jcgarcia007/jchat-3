import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { classifyDeleteError } from "./deleteAccountErrors.ts";

Deno.test("the auth admin API's 'Database error deleting user' is a fk_violation", () => {
  assertEquals(classifyDeleteError("Database error deleting user"), "fk_violation");
  assertEquals(classifyDeleteError("DATABASE ERROR DELETING USER"), "fk_violation");
});

Deno.test("constraint messages are fk_violation", () => {
  assertEquals(classifyDeleteError('update or delete on table "users" violates foreign key constraint'), "fk_violation");
  assertEquals(classifyDeleteError('null value in column "user_id" violates not-null constraint (23502)'), "fk_violation");
});

Deno.test("anything else (network, rate limit, unknown, empty) is delete_failed", () => {
  assertEquals(classifyDeleteError("fetch failed"), "delete_failed");
  assertEquals(classifyDeleteError("Too many requests"), "delete_failed");
  assertEquals(classifyDeleteError(""), "delete_failed");
  assertEquals(classifyDeleteError(undefined), "delete_failed");
});
