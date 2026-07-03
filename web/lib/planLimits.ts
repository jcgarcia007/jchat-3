/**
 * JChat 3.0 — Plan limits & usage (server-side enforcement helpers).
 *
 * Businesses and events are independent, each tied to a user via owner_id.
 * Limits are PER TYPE (not combined):
 *   - regular / verified: 0 businesses, 0 events (no dashboard access)
 *   - business:           max 1 business  AND max 1 event
 *   - pro:                max 10 businesses AND max 10 events
 *
 * canCreate additionally requires an active/trialing plan_status.
 */

import { supabase, isSupabaseConfigured } from "./supabase";

export type Plan = "regular" | "verified" | "business" | "pro";

export const PLAN_LIMITS: Record<Plan, { businesses: number; events: number }> = {
  regular:  { businesses: 0,  events: 0  },
  verified: { businesses: 0,  events: 0  },
  business: { businesses: 1,  events: 1  },
  pro:      { businesses: 10, events: 10 },
};

const VALID_PLANS: readonly Plan[] = ["regular", "verified", "business", "pro"];

/** Coerce an arbitrary DB value into a known Plan; unknown → "regular". */
function normalizePlan(value: string | null | undefined): Plan {
  return VALID_PLANS.includes(value as Plan) ? (value as Plan) : "regular";
}

export interface ResourceUsage {
  used: number;
  limit: number;
  canCreate: boolean;
}

export interface UsageAndLimits {
  plan: Plan;
  planStatus: string;
  businesses: ResourceUsage;
  events: ResourceUsage;
}

/**
 * Current user's plan, usage counts, and per-type limits. Returns null when
 * Supabase is unconfigured (demo mode) or there is no authenticated user.
 * Never throws: individual query failures degrade to a used count of 0.
 */
export async function getUsageAndLimits(): Promise<UsageAndLimits | null> {
  if (!isSupabaseConfigured) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // ── Plan + status ──────────────────────────────────────────────────────────
  let plan: Plan = "regular";
  let planStatus = "";
  try {
    const { data: profile, error } = await supabase
      .from("users")
      .select("plan, plan_status")
      .eq("id", user.id)
      .single();
    if (error) throw error;
    plan = normalizePlan(profile?.plan);
    planStatus = profile?.plan_status ?? "";
  } catch (e) {
    console.error("[planLimits] failed to read user plan:", e);
  }

  // ── Count businesses ───────────────────────────────────────────────────────
  let businessesUsed = 0;
  try {
    const { count, error } = await supabase
      .from("businesses")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", user.id);
    if (error) throw error;
    businessesUsed = count ?? 0;
  } catch (e) {
    console.error("[planLimits] failed to count businesses:", e);
  }

  // ── Count events ───────────────────────────────────────────────────────────
  let eventsUsed = 0;
  try {
    const { count, error } = await supabase
      .from("events")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", user.id);
    if (error) throw error;
    eventsUsed = count ?? 0;
  } catch (e) {
    console.error("[planLimits] failed to count events:", e);
  }

  const limits = PLAN_LIMITS[plan];
  const statusActive = planStatus === "active" || planStatus === "trialing";

  return {
    plan,
    planStatus,
    businesses: {
      used: businessesUsed,
      limit: limits.businesses,
      canCreate: businessesUsed < limits.businesses && statusActive,
    },
    events: {
      used: eventsUsed,
      limit: limits.events,
      canCreate: eventsUsed < limits.events && statusActive,
    },
  };
}

/** True if the current user may create another business. */
export async function canCreateBusiness(): Promise<boolean> {
  const usage = await getUsageAndLimits();
  return usage?.businesses.canCreate ?? false;
}

/** True if the current user may create another event. */
export async function canCreateEvent(): Promise<boolean> {
  const usage = await getUsageAndLimits();
  return usage?.events.canCreate ?? false;
}
