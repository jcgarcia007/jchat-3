/**
 * What the business sign-up shows when the database refuses the insert.
 *
 * The plan-limit trigger (`enforce_business_limit`) raises `PLAN_LIMIT_COMBINED: …` (businesses and events counted together).
 * `PLAN_LIMIT_BUSINESSES` / `PLAN_LIMIT_EVENTS` are the older codes, kept so a database still on the old trigger reads well.
 * Anything else is returned as `null`: the caller shows the original message.
 */
export type RegisterErrorKind = "planLimit" | "planLimitBusinesses" | "planLimitEvents";

export function registerErrorKind(message: string): RegisterErrorKind | null {
  if (message.includes("PLAN_LIMIT_COMBINED")) return "planLimit";
  if (message.includes("PLAN_LIMIT_BUSINESSES")) return "planLimitBusinesses";
  if (message.includes("PLAN_LIMIT_EVENTS")) return "planLimitEvents";
  return null;
}
