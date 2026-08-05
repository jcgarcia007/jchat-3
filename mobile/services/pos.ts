/**
 * JChat 3.0 — POS data-access service (Task 3.x — Work Mode)
 *
 * Wraps the three Supabase RPCs that power employee POS access:
 *   pos_my_businesses()  → list of businesses where the current user has pos_access
 *   pos_set_pin(...)     → store a 4-6 digit PIN for a business
 *   pos_verify_pin(...)  → verify a PIN, returns boolean (errors: no pin set, locked, no pos access)
 *
 * All functions guard against unconfigured Supabase with isSupabaseConfigured.
 * RPCs are not yet in generated types — cast will be removed once types are regenerated.
 */

import { supabase, isSupabaseConfigured } from './supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PosMyBusinessesRow {
  business_id: string;
  business_name: string;
  employee_id: string;
  role: string;
  has_pin: boolean;
}

export type PosSetPinError =
  | 'pin_digits'
  | 'no_access'
  | 'db_error'
  | 'not_configured';

export type PosSetPinResult =
  | { ok: true }
  | { ok: false; reason: PosSetPinError };

export type PosVerifyPinError =
  | 'no_pin'
  | 'locked'
  | 'no_access'
  | 'db_error'
  | 'not_configured';

export type PosVerifyPinResult =
  | { ok: true; verified: boolean }
  | { ok: false; reason: PosVerifyPinError };

// ─── Internal RPC helper ──────────────────────────────────────────────────────

// These RPCs are not yet in generated types; cast until types are regenerated.
type PosRpc = {
  rpc(fn: 'pos_my_businesses'): Promise<{
    data: PosMyBusinessesRow[] | null;
    error: { message: string } | null;
  }>;
  rpc(
    fn: 'pos_set_pin',
    params: { p_business_id: string; p_pin: string },
  ): Promise<{ data: null; error: { message: string } | null }>;
  rpc(
    fn: 'pos_verify_pin',
    params: { p_business_id: string; p_pin: string },
  ): Promise<{ data: boolean | null; error: { message: string } | null }>;
};

const posRpc = supabase as unknown as PosRpc;

// ─── posMyBusinesses ─────────────────────────────────────────────────────────

/**
 * Return all businesses where the current user has the `pos_access` permission.
 * Each row includes whether a PIN has been set for that business.
 *
 * Returns an empty array when Supabase is not configured or the user has no
 * POS-access employees.
 */
export async function posMyBusinesses(): Promise<PosMyBusinessesRow[]> {
  if (!isSupabaseConfigured) return [];

  const { data, error } = await posRpc.rpc('pos_my_businesses');

  if (error) throw new Error(error.message);
  return (data ?? []) as PosMyBusinessesRow[];
}

// ─── posSetPin ───────────────────────────────────────────────────────────────

/**
 * Store a 4-6 digit numeric PIN for the current user at the given business.
 *
 * Possible failure reasons:
 *   'pin_digits'       — PIN is not 4-6 digits
 *   'no_access'        — user does not have pos_access at this business
 *   'db_error'         — unexpected database error
 *   'not_configured'   — Supabase is not configured
 */
export async function posSetPin(
  businessId: string,
  pin: string,
): Promise<PosSetPinResult> {
  if (!isSupabaseConfigured) return { ok: false, reason: 'not_configured' };

  const { error } = await posRpc.rpc('pos_set_pin', {
    p_business_id: businessId,
    p_pin: pin,
  });

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('pin must be 4 to 6 digits')) return { ok: false, reason: 'pin_digits' };
    if (msg.includes('no pos access')) return { ok: false, reason: 'no_access' };
    return { ok: false, reason: 'db_error' };
  }

  return { ok: true };
}

// ─── posVerifyPin ────────────────────────────────────────────────────────────

/**
 * Verify the current user's PIN at the given business.
 * Returns { ok: true, verified: true } on correct PIN, { verified: false } on wrong PIN.
 *
 * Possible failure reasons:
 *   'no_pin'         — no PIN has been set yet for this business
 *   'locked'         — too many incorrect attempts; account is locked
 *   'no_access'      — user does not have pos_access at this business
 *   'db_error'       — unexpected database error
 *   'not_configured' — Supabase is not configured
 */
export async function posVerifyPin(
  businessId: string,
  pin: string,
): Promise<PosVerifyPinResult> {
  if (!isSupabaseConfigured) return { ok: false, reason: 'not_configured' };

  const { data, error } = await posRpc.rpc('pos_verify_pin', {
    p_business_id: businessId,
    p_pin: pin,
  });

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('no pin set')) return { ok: false, reason: 'no_pin' };
    if (msg.includes('locked')) return { ok: false, reason: 'locked' };
    if (msg.includes('no pos access')) return { ok: false, reason: 'no_access' };
    return { ok: false, reason: 'db_error' };
  }

  return { ok: true, verified: data === true };
}
