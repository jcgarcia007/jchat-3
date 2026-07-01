/**
 * JChat 3.0 — Web Loyalty Data Layer (Task 2.20)
 *
 * Pure async functions wrapping the Supabase loyalty tables.
 * All functions guard with `isSupabaseConfigured` so the dashboard builds and
 * navigates safely before a backend is wired up.
 *
 * Schema reference (migrations 001 + 004):
 *   loyalty_points(id, user_id, business_id, points, created_at)
 *     UNIQUE(user_id, business_id)
 *   loyalty_rules(id, business_id, points_per_dollar, is_active, created_at)
 *   loyalty_rewards(id, business_id, name, description, cost_points, is_active, created_at)
 *   loyalty_tiers(id, business_id, name, min_points, created_at)
 *
 * TODO(Task 3.x): award points on order completion — see mobile/services/loyalty.ts
 * TODO(Task 3.12): Pro-only ROI analytics belong in the Analytics page (Task 3.12)
 */

import { supabase, isSupabaseConfigured } from "@/lib/supabase";

// ── Co-located types ──────────────────────────────────────────────────────────

export interface LoyaltyRule {
  id: string;
  business_id: string;
  points_per_dollar: number;
  is_active: boolean;
  created_at: string;
}

export interface LoyaltyReward {
  id: string;
  business_id: string;
  name: string;
  description: string | null;
  cost_points: number;
  is_active: boolean;
  created_at: string;
}

export interface LoyaltyTier {
  id: string;
  business_id: string;
  name: string;
  min_points: number;
  created_at: string;
}

export interface LoyaltyPoints {
  id: string;
  user_id: string;
  business_id: string;
  points: number;
  created_at: string;
}

export interface CreateRewardInput {
  businessId: string;
  name: string;
  description?: string;
  costPoints: number;
}

export interface UpsertTiersInput {
  businessId: string;
  /** Full set of tiers — this replaces all existing tiers for the business. */
  tiers: Array<{ name: string; min_points: number }>;
}

// ── Rules ─────────────────────────────────────────────────────────────────────

/**
 * Fetch the active loyalty rule for a business.
 * Returns `null` when no rule exists (no rule → loyalty not configured).
 */
export async function getRules(
  businessId: string
): Promise<LoyaltyRule | null> {
  if (!isSupabaseConfigured) return null;

  const { data, error } = await supabase
    .from("loyalty_rules")
    .select("*")
    .eq("business_id", businessId)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data as LoyaltyRule | null) ?? null;
}

/**
 * Create or update the loyalty rule for a business.
 * Uses upsert on `business_id` — each business has at most one active rule.
 * Deactivates any previous rules first, then inserts the new one.
 */
export async function upsertRules(
  businessId: string,
  pointsPerDollar: number
): Promise<LoyaltyRule> {
  if (!isSupabaseConfigured) {
    return Promise.reject(new Error("Supabase is not configured"));
  }

  // Deactivate existing rules for this business
  await supabase
    .from("loyalty_rules")
    .update({ is_active: false })
    .eq("business_id", businessId);

  const { data, error } = await supabase
    .from("loyalty_rules")
    .insert({
      business_id: businessId,
      points_per_dollar: pointsPerDollar,
      is_active: true,
    })
    .select()
    .single();

  if (error) throw error;
  return data as unknown as LoyaltyRule;
}

// ── Rewards ───────────────────────────────────────────────────────────────────

/**
 * List all active rewards for a business, ordered by cost ascending.
 */
export async function listRewards(businessId: string): Promise<LoyaltyReward[]> {
  if (!isSupabaseConfigured) return [];

  const { data, error } = await supabase
    .from("loyalty_rewards")
    .select("*")
    .eq("business_id", businessId)
    .eq("is_active", true)
    .order("cost_points", { ascending: true });

  if (error) throw error;
  return (data ?? []) as LoyaltyReward[];
}

/**
 * Create a new reward for a business.
 */
export async function createReward(
  input: CreateRewardInput
): Promise<LoyaltyReward> {
  if (!isSupabaseConfigured) {
    return Promise.reject(new Error("Supabase is not configured"));
  }

  const { data, error } = await supabase
    .from("loyalty_rewards")
    .insert({
      business_id: input.businessId,
      name: input.name.trim(),
      description: input.description?.trim() ?? null,
      cost_points: input.costPoints,
      is_active: true,
    })
    .select()
    .single();

  if (error) throw error;
  return data as LoyaltyReward;
}

/**
 * Soft-delete a reward by setting `is_active = false`.
 * Hard deletes are avoided to preserve redemption history integrity.
 */
export async function deleteReward(rewardId: string): Promise<void> {
  if (!isSupabaseConfigured) return;

  const { error } = await supabase
    .from("loyalty_rewards")
    .update({ is_active: false })
    .eq("id", rewardId);

  if (error) throw error;
}

// ── Tiers ─────────────────────────────────────────────────────────────────────

/**
 * List all tiers for a business, ordered by min_points ascending.
 */
export async function listTiers(businessId: string): Promise<LoyaltyTier[]> {
  if (!isSupabaseConfigured) return [];

  const { data, error } = await supabase
    .from("loyalty_tiers")
    .select("*")
    .eq("business_id", businessId)
    .order("min_points", { ascending: true });

  if (error) throw error;
  return (data ?? []) as LoyaltyTier[];
}

/**
 * Replace all tiers for a business with the supplied set.
 * Deletes existing tiers first, then inserts new ones in a single batch.
 *
 * Default tiers (Bronze/Silver/Gold) are set by the dashboard UI;
 * this function takes whatever the caller provides.
 */
export async function upsertTiers(input: UpsertTiersInput): Promise<LoyaltyTier[]> {
  if (!isSupabaseConfigured) {
    return Promise.reject(new Error("Supabase is not configured"));
  }

  // Remove all existing tiers for the business
  const { error: delErr } = await supabase
    .from("loyalty_tiers")
    .delete()
    .eq("business_id", input.businessId);

  if (delErr) throw delErr;

  if (input.tiers.length === 0) return [];

  const rows = input.tiers.map((t) => ({
    business_id: input.businessId,
    name: t.name.trim(),
    min_points: t.min_points,
  }));

  const { data, error } = await supabase
    .from("loyalty_tiers")
    .insert(rows)
    .select();

  if (error) throw error;
  return (data ?? []) as LoyaltyTier[];
}
