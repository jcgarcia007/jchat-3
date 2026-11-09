/**
 * JChat 3.0 — Plan limits the app knows about (mirror of the employees part of web/lib/planLimits.ts).
 *
 * The DATABASE is the authority: the trigger `public.enforce_employee_plan_limit` (D-42) refuses an employees INSERT when the venue already has
 * `business → 10` / `pro → 50` rows (it counts every row of the venue, whatever its status). The app repeats the number only to answer before
 * the insert and to name the limit in the message. Keep both in sync; change them together in a migration and here and in the web.
 */

export type Plan = 'regular' | 'verified' | 'business' | 'pro';

/** Employees per venue, by the OWNER's plan (same values as the trigger). */
export const EMPLOYEE_LIMITS: Record<'business' | 'pro', number> = {
  business: 10,
  pro: 50,
};

/**
 * Employees per venue for a plan read from `users.plan`: 50 for `pro`, 10 for anything else. (The trigger gives 0 to a plan that is neither
 * business nor pro; those accounts never reach the screen that adds staff, so the UI uses the Business number instead of a confusing "0".)
 */
export function employeeLimitFor(plan: string | null | undefined): number {
  return plan === 'pro' ? EMPLOYEE_LIMITS.pro : EMPLOYEE_LIMITS.business;
}
