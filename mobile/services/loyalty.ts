/**
 * JChat 3.0 — Mobile Loyalty Service (Task 2.20)
 *
 * Pure async functions wrapping the Supabase loyalty tables for the mobile app.
 * All functions guard with `isSupabaseConfigured`.
 *
 * Schema reference (migrations 001 + 004):
 *   loyalty_points(id, user_id, business_id, points, created_at)
 *     UNIQUE(user_id, business_id)
 *   loyalty_rules(id, business_id, points_per_dollar, is_active, created_at)
 *   loyalty_rewards(id, business_id, name, description, cost_points, is_active, created_at)
 *   loyalty_tiers(id, business_id, name, min_points, created_at)
 *
 * TODO(Task 3.x): award points on order completion — call awardPoints() from the
 *   order-completion handler once Task 3.x (order tracking) is wired up.
 * TODO(Task 3.5): redemption discount application happens in checkout —
 *   redeemReward() deducts points; the price discount is applied server-side.
 */

import { supabase, isSupabaseConfigured } from './supabase';

// ── Co-located types ──────────────────────────────────────────────────────────

export interface LoyaltyBalance {
  id: string;
  user_id: string;
  business_id: string;
  points: number;
  created_at: string;
}

/** Balance enriched with business name for the "All Balances" list view. */
export interface LoyaltyBalanceWithBusiness extends LoyaltyBalance {
  business: { id: string; name: string; slug: string } | null;
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

export interface LoyaltyRule {
  id: string;
  business_id: string;
  points_per_dollar: number;
  is_active: boolean;
  created_at: string;
}

/**
 * Stub history entry.
 * TODO(schema): a `loyalty_ledger` table would back this with real debit/credit
 *   rows (order completions, redemptions, adjustments). For now we derive a
 *   synthetic entry from the current balance row.
 */
export interface LoyaltyHistoryEntry {
  id: string;
  /** ISO timestamp of when the entry was recorded. */
  occurred_at: string;
  /** Human-readable description — e.g. "Order #123", "Redeemed: Free Coffee". */
  description: string;
  /** Positive = earned, negative = redeemed/deducted. */
  delta: number;
  /** Running balance after this entry. */
  balance_after: number;
}

// ── getBalance ────────────────────────────────────────────────────────────────

/**
 * Fetch a user's point balance at a specific business.
 * Returns `null` when the user has no balance yet (first visit).
 */
export async function getBalance(
  userId: string,
  businessId: string
): Promise<LoyaltyBalance | null> {
  if (!isSupabaseConfigured) return null;

  const { data, error } = await supabase
    .from('loyalty_points')
    .select('*')
    .eq('user_id', userId)
    .eq('business_id', businessId)
    .maybeSingle();

  if (error) throw error;
  return (data as LoyaltyBalance | null) ?? null;
}

// ── getAllBalances ─────────────────────────────────────────────────────────────

/**
 * Fetch all point balances for a user across every business they have visited.
 * Includes business name and slug for display in the loyalty wallet screen.
 * Results are ordered by points descending.
 */
export async function getAllBalances(
  userId: string
): Promise<LoyaltyBalanceWithBusiness[]> {
  if (!isSupabaseConfigured) return [];

  const { data, error } = await supabase
    .from('loyalty_points')
    .select(`
      id,
      user_id,
      business_id,
      points,
      created_at,
      business:businesses!loyalty_points_business_id_fkey (
        id,
        name,
        slug
      )
    `)
    .eq('user_id', userId)
    .gt('points', 0)
    .order('points', { ascending: false });

  if (error) throw error;
  return (data ?? []) as unknown as LoyaltyBalanceWithBusiness[];
}

// ── getPointsHistory ──────────────────────────────────────────────────────────

/**
 * Return a synthetic history for a user at a business.
 *
 * TODO(schema): a `loyalty_ledger` table would back this with real debit/credit
 *   rows. Until that table is added, we synthesize a single entry from the
 *   current balance row so the UI has something to render without crashing.
 *   Replace this stub once Task 3.x wires up ledger inserts.
 */
export async function getPointsHistory(
  userId: string,
  businessId: string
): Promise<LoyaltyHistoryEntry[]> {
  if (!isSupabaseConfigured) return [];

  const balance = await getBalance(userId, businessId);
  if (!balance || balance.points === 0) return [];

  // Synthetic single entry — represents total accumulated balance
  const stub: LoyaltyHistoryEntry = {
    id: balance.id,
    occurred_at: balance.created_at,
    description: 'Points balance',
    delta: balance.points,
    balance_after: balance.points,
  };

  return [stub];
}

// ── listRewards ───────────────────────────────────────────────────────────────

/**
 * List active redeemable rewards for a business, ordered by cost ascending.
 */
export async function listRewards(businessId: string): Promise<LoyaltyReward[]> {
  if (!isSupabaseConfigured) return [];

  const { data, error } = await supabase
    .from('loyalty_rewards')
    .select('*')
    .eq('business_id', businessId)
    .eq('is_active', true)
    .order('cost_points', { ascending: true });

  if (error) throw error;
  return (data ?? []) as LoyaltyReward[];
}

// ── listTiers ─────────────────────────────────────────────────────────────────

/**
 * List tiers for a business, ordered by min_points ascending.
 */
export async function listTiers(businessId: string): Promise<LoyaltyTier[]> {
  if (!isSupabaseConfigured) return [];

  const { data, error } = await supabase
    .from('loyalty_tiers')
    .select('*')
    .eq('business_id', businessId)
    .order('min_points', { ascending: true });

  if (error) throw error;
  return (data ?? []) as LoyaltyTier[];
}

// ── getTierForPoints ──────────────────────────────────────────────────────────

/**
 * Resolve which tier a user is in given their current point total.
 * Returns the highest tier whose `min_points` ≤ `points`.
 * Returns `null` when no tiers are configured for the business.
 */
export function getTierForPoints(
  points: number,
  tiers: LoyaltyTier[]
): LoyaltyTier | null {
  if (tiers.length === 0) return null;
  // Sort descending by min_points; first match wins
  const sorted = [...tiers].sort((a, b) => b.min_points - a.min_points);
  return sorted.find((t) => points >= t.min_points) ?? null;
}

// ── redeemReward ──────────────────────────────────────────────────────────────

/**
 * Deduct `reward.cost_points` from the user's balance at `businessId`.
 * Throws if the user does not have enough points.
 *
 * TODO(Task 3.5): the actual discount is applied server-side in the checkout
 *   Edge Function — this function only deducts points from `loyalty_points`.
 *   Wire this call into the checkout flow once Task 3.5 is implemented.
 *
 * NOTE: In production, wrap this in a Postgres function / Edge Function to
 *   make the balance check + deduction atomic (avoid TOCTOU races).
 */
export async function redeemReward(
  userId: string,
  businessId: string,
  reward: LoyaltyReward
): Promise<LoyaltyBalance> {
  if (!isSupabaseConfigured) {
    return Promise.reject(new Error('Supabase is not configured'));
  }

  // 1. Fetch current balance
  const current = await getBalance(userId, businessId);
  const currentPoints = current?.points ?? 0;

  if (currentPoints < reward.cost_points) {
    throw new Error(
      `Not enough points. You have ${currentPoints} pts but need ${reward.cost_points} pts for "${reward.name}".`
    );
  }

  const newPoints = currentPoints - reward.cost_points;

  // 2. Upsert balance row — decrement points
  const { data, error } = await supabase
    .from('loyalty_points')
    .upsert(
      {
        user_id: userId,
        business_id: businessId,
        points: newPoints,
      },
      { onConflict: 'user_id,business_id' }
    )
    .select()
    .single();

  if (error) throw error;

  // TODO(Task 3.5): notify checkout that reward was redeemed so the
  //   discount can be applied to the order total server-side.

  return data as LoyaltyBalance;
}

// ── awardPoints (stub for Stage 3) ───────────────────────────────────────────

/**
 * Add `points` to a user's balance at `businessId`.
 * Performs an upsert on the UNIQUE(user_id, business_id) constraint.
 *
 * TODO(Task 3.x): award points on order completion — call this from the
 *   order-completion handler in the checkout / order-tracking flow (Stage 3).
 *   The caller should compute `points = Math.floor(orderTotalCents / 100 * rule.points_per_dollar)`.
 */
export async function awardPoints(
  userId: string,
  businessId: string,
  pointsToAdd: number
): Promise<LoyaltyBalance> {
  if (!isSupabaseConfigured) {
    return Promise.reject(new Error('Supabase is not configured'));
  }

  // Read current balance to compute new total
  const current = await getBalance(userId, businessId);
  const newPoints = (current?.points ?? 0) + pointsToAdd;

  const { data, error } = await supabase
    .from('loyalty_points')
    .upsert(
      {
        user_id: userId,
        business_id: businessId,
        points: newPoints,
      },
      { onConflict: 'user_id,business_id' }
    )
    .select()
    .single();

  if (error) throw error;
  return data as LoyaltyBalance;
}
