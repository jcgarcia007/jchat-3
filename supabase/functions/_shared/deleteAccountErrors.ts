/**
 * JChat 3.0 — delete-account error codes (shared so it can be unit-tested without starting the function).
 *
 * auth.admin.deleteUser() reports a cascade stopped by the database as "Database error deleting user" (a foreign key, or a
 * NOT NULL that an ON DELETE SET NULL cannot satisfy — migration 255). That is the case the app tells apart from a plain API failure.
 */
export type DeleteFailureCode = "fk_violation" | "delete_failed";

export function classifyDeleteError(message: string | undefined): DeleteFailureCode {
  const m = (message ?? "").toLowerCase();
  if (m.includes("database error deleting user") || m.includes("foreign key") || m.includes("violates") || m.includes("23503") || m.includes("23502")) {
    return "fk_violation";
  }
  return "delete_failed";
}
