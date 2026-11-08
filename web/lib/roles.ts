/**
 * JChat 3.0 — Role / plan gating helpers (web, Stage 3 cleanup)
 * Resolves the current user's plan (for Pro gating) and admin role
 * (for Super Admin gating). In demo mode (no Supabase) access is allowed so the
 * UI stays viewable without a backend.
 */

import { supabase, isSupabaseConfigured } from './supabase';

/** Plan statuses that keep the paid features on (same rule as the dashboard gate, the menu and the AI assistant). */
const ACTIVE_PLAN_STATUSES = ['active', 'trialing'];

/** Pure rule: the owner's PLAN is Pro and the subscription is active or in trial. */
export function isProPlan(plan: string | null | undefined, planStatus: string | null | undefined): boolean {
  return plan === 'pro' && ACTIVE_PLAN_STATUSES.includes(planStatus ?? '');
}

/**
 * The CURRENT USER's plan and status (regular|verified|business|pro) from `users` — the plan belongs to the owner, not to a
 * business (`businesses.plan` is not kept in sync with the subscription and must not be used for gating). One row per user, so it
 * works the same with one business or ten. Null when there is no session / demo mode.
 */
export async function getOwnerPlan(): Promise<{ plan: string; planStatus: string | null } | null> {
  if (!isSupabaseConfigured) return null;
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return null;
  const { data } = await supabase.from('users').select('plan, plan_status').eq('id', uid).maybeSingle();
  if (!data) return null;
  return { plan: data.plan, planStatus: data.plan_status };
}

/**
 * True when THIS business has the Pro features: the caller is its owner or an accepted employee, and the OWNER's plan is Pro with an active/trialing
 * subscription (RPC `business_owner_is_pro`, migration 270). Use it for any Pro gate that depends on the selected business. Anything else —
 * no business id, no session, a stranger, an RPC error — is false. Demo → true.
 */
export async function isBusinessProFor(businessId: string | null | undefined): Promise<boolean> {
  if (!isSupabaseConfigured) return true;
  if (!businessId) return false;
  const { data, error } = await supabase.rpc('business_owner_is_pro', { p_business_id: businessId });
  return !error && data === true;
}

/**
 * True when the CURRENT USER's own plan is Pro with an active/trialing subscription. Demo → true.
 * Only for ACCOUNT screens (billing…). For anything tied to the selected business use isBusinessProFor(businessId): a manager or employee
 * uses the Pro features their owner paid for, and their own plan says nothing about that.
 */
export async function isBusinessPro(): Promise<boolean> {
  if (!isSupabaseConfigured) return true;
  const owner = await getOwnerPlan();
  return owner != null && isProPlan(owner.plan, owner.planStatus);
}

/** True when the current user is a Super Admin (users.role or admin_roles). Demo → true. */
export async function isSuperAdmin(): Promise<boolean> {
  if (!isSupabaseConfigured) return true;
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return false;
  const { data: u } = await supabase.from('users').select('role').eq('id', uid).maybeSingle();
  if ((u?.role as string | undefined) === 'super_admin') return true;
  const { data: roles } = await supabase.from('admin_roles').select('role').eq('user_id', uid);
  return Array.isArray(roles) && roles.length > 0;
}
