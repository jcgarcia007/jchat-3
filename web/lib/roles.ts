/**
 * JChat 3.0 — Role / plan gating helpers (web, Stage 3 cleanup)
 * Resolves the current user's business plan (for Pro gating) and admin role
 * (for Super Admin gating). In demo mode (no Supabase) access is allowed so the
 * UI stays viewable without a backend.
 */

import { supabase, isSupabaseConfigured } from './supabase';

/** The owner's business plan (regular|verified|business|pro), or null. */
export async function getOwnerPlan(): Promise<string | null> {
  if (!isSupabaseConfigured) return null;
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return null;
  const { data } = await supabase
    .from('businesses')
    .select('plan')
    .eq('owner_id', uid)
    .maybeSingle();
  return (data?.plan as string | undefined) ?? null;
}

/** True when the current owner is on the Business Pro plan. Demo → true. */
export async function isBusinessPro(): Promise<boolean> {
  if (!isSupabaseConfigured) return true;
  return (await getOwnerPlan()) === 'pro';
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
