/**
 * JChat 3.0 — Employee data-access service (Task 2.9)
 *
 * Pure async functions wrapping the shared Supabase client.
 * DB tables (001_initial_schema.sql + 004_stage2_schema.sql):
 *   employees(id, business_id, user_id, role, status, last_active_at, created_at)
 *   status ∈ 'pending' | 'accepted' | 'declined'
 *
 * Plan limit: max 10 employees on the default plan; Pro = unlimited.
 * TODO: read real plan from the DB/billing service; default cap is 10.
 *
 * All types are co-located here.
 * Every function guards against unconfigured Supabase with isSupabaseConfigured.
 *
 * // TODO(i18n)
 */

import { supabase, isSupabaseConfigured } from './supabase';

// ─── Roles ────────────────────────────────────────────────────────────────────

export type EmployeeRole =
  | 'Manager'
  | 'Cashier'
  | 'Waiter'
  | 'Kitchen'
  | 'Chat Moderator'
  | 'Analyst';

/** Ordered list of available employee roles for UI pickers. */
export const EMPLOYEE_ROLES: EmployeeRole[] = [
  'Manager',
  'Cashier',
  'Waiter',
  'Kitchen',
  'Chat Moderator',
  'Analyst',
];

// ─── Status ───────────────────────────────────────────────────────────────────

export type EmployeeStatus = 'pending' | 'accepted' | 'declined';

// ─── Plan limits ──────────────────────────────────────────────────────────────

/** Default max employees for non-Pro plans. Pro = unlimited (null). */
const DEFAULT_PLAN_CAP = 10;

// ─── Co-located types ─────────────────────────────────────────────────────────

export interface EmployeeRow {
  id: string;
  business_id: string;
  user_id: string;
  role: EmployeeRole;
  status: EmployeeStatus;
  last_active_at: string | null;
  created_at: string;
}

/** Enriched employee item with basic user profile data. */
export interface EmployeeWithProfile extends EmployeeRow {
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

/** Result returned by addEmployee. */
export type AddEmployeeResult =
  | { ok: true; employee: EmployeeRow }
  | { ok: false; reason: 'plan_limit' | 'already_exists' | 'not_configured' | 'db_error'; message?: string };

// ─── countEmployees ───────────────────────────────────────────────────────────

/**
 * Return the number of accepted + pending employees for a business.
 * Used both for plan-limit enforcement and dashboard display.
 */
export async function countEmployees(businessId: string): Promise<number> {
  if (!isSupabaseConfigured) return 0;

  const { count, error } = await supabase
    .from('employees')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', businessId)
    .in('status', ['pending', 'accepted']);

  if (error) throw error;
  return count ?? 0;
}

// ─── addEmployee ──────────────────────────────────────────────────────────────

/**
 * Invite a user to the business staff roster by creating an employee record
 * with status='pending'. The invited user then calls acceptInvite() to confirm.
 *
 * Plan limit: returns { ok: false, reason: 'plan_limit' } if the business has
 * reached DEFAULT_PLAN_CAP active/pending employees.
 * TODO: read real plan from billing; default cap is DEFAULT_PLAN_CAP.
 *
 * Push notification: stubbed — the invited user is not yet notified.
 * TODO(push): notify invited user that they have been added as employeeRole
 */
export async function addEmployee(
  businessId: string,
  userId: string,
  role: EmployeeRole,
): Promise<AddEmployeeResult> {
  if (!isSupabaseConfigured) {
    return { ok: false, reason: 'not_configured' };
  }

  // ── Plan limit check ───────────────────────────────────────────────────────
  // TODO: read real plan; default cap is DEFAULT_PLAN_CAP. Pro = unlimited.
  const current = await countEmployees(businessId);
  if (current >= DEFAULT_PLAN_CAP) {
    return {
      ok: false,
      reason: 'plan_limit',
      message: `Your plan allows up to ${DEFAULT_PLAN_CAP} employees. Upgrade to Pro for unlimited staff.`,
    };
  }

  // ── Insert ─────────────────────────────────────────────────────────────────
  const { data, error } = await supabase
    .from('employees')
    .insert({
      business_id: businessId,
      user_id: userId,
      role,
      status: 'pending',
    })
    .select('*')
    .single();

  if (error) {
    // Unique constraint violation: (business_id, user_id)
    if (error.code === '23505') {
      return { ok: false, reason: 'already_exists', message: 'This user is already on your staff.' };
    }
    return { ok: false, reason: 'db_error', message: error.message };
  }

  // TODO(push): notify invited user they have been invited as `role` at businessId
  // e.g. await sendPushNotification(userId, { title: 'You have a job offer!', body: `You've been invited as ${role}` });

  return { ok: true, employee: data as EmployeeRow };
}

// ─── acceptInvite ─────────────────────────────────────────────────────────────

/**
 * The invited user accepts their invitation.
 * Sets status='accepted'. After this the business appears in getLinkedBusinesses().
 *
 * Note: staff section on the business profile is visible only to linked
 * employees (status='accepted') — enforce at the UI layer with getLinkedBusinesses().
 */
export async function acceptInvite(employeeId: string): Promise<EmployeeRow> {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase is not configured.');
  }

  const { data, error } = await supabase
    .from('employees')
    .update({ status: 'accepted' })
    .eq('id', employeeId)
    .select('*')
    .single();

  if (error) throw error;
  return data as EmployeeRow;
}

// ─── declineInvite ────────────────────────────────────────────────────────────

/**
 * The invited user declines their invitation.
 * Sets status='declined'. The record is kept for audit purposes.
 */
export async function declineInvite(employeeId: string): Promise<EmployeeRow> {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase is not configured.');
  }

  const { data, error } = await supabase
    .from('employees')
    .update({ status: 'declined' })
    .eq('id', employeeId)
    .select('*')
    .single();

  if (error) throw error;
  return data as EmployeeRow;
}

// ─── listEmployees ────────────────────────────────────────────────────────────

/**
 * Return all employee records for a business (pending + accepted + declined),
 * enriched with the user's profile data.
 * RLS: only the business owner or an accepted employee can read.
 */
export async function listEmployees(businessId: string): Promise<EmployeeWithProfile[]> {
  if (!isSupabaseConfigured) return [];

  // 1 — fetch employee rows
  const { data: rows, error: rowsErr } = await supabase
    .from('employees')
    .select('*')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false });

  if (rowsErr) throw rowsErr;
  if (!rows || rows.length === 0) return [];

  const empRows = rows as EmployeeRow[];

  // 2 — fetch user profiles
  const userIds = [...new Set(empRows.map((e) => e.user_id))];
  const { data: usersData, error: usersErr } = await supabase
    .from('users')
    .select('id, username, display_name, avatar_url')
    .in('id', userIds);

  if (usersErr) throw usersErr;

  type UserProfile = { id: string; username: string; display_name: string | null; avatar_url: string | null };
  const userMap = new Map<string, UserProfile>(
    ((usersData ?? []) as UserProfile[]).map((u) => [u.id, u]),
  );

  return empRows.map((emp) => {
    const profile = userMap.get(emp.user_id) ?? {
      id: emp.user_id,
      username: 'Unknown',
      display_name: null,
      avatar_url: null,
    };
    return {
      ...emp,
      username: profile.username,
      display_name: profile.display_name,
      avatar_url: profile.avatar_url,
    };
  });
}

// ─── removeEmployee ───────────────────────────────────────────────────────────

/**
 * Hard-delete an employee record (owner only — enforced by RLS).
 * This revokes the user's access to the business staff area immediately.
 */
export async function removeEmployee(employeeId: string): Promise<void> {
  if (!isSupabaseConfigured) return;

  const { error } = await supabase
    .from('employees')
    .delete()
    .eq('id', employeeId);

  if (error) throw error;
}

// ─── getLinkedBusinesses ──────────────────────────────────────────────────────

/**
 * Return employee records for the current user where status='accepted'.
 * Each record contains the business_id — the caller can use this to fetch
 * full business data and render the "My Businesses" section on the profile.
 *
 * Note: role determines which chat actions are available to the user
 * (enforced in Task 2.10 — UserActionSheet / ChatRoomScreen).
 * TODO(Stage 4): physical-presence check for Chat Moderator role via geofence.
 */
export async function getLinkedBusinesses(userId: string): Promise<EmployeeRow[]> {
  if (!isSupabaseConfigured) return [];

  const { data, error } = await supabase
    .from('employees')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'accepted')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as EmployeeRow[];
}
