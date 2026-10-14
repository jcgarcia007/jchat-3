/**
 * JChat 3.0 — result of the server-side check-in (pure: no React, no Supabase, runs in Node tests).
 *
 * The `check_in(p_business_id)` RPC (migration 235) decides everything: presence (venue_presence_ok — physically at the
 * venue, proven by the server), the owner, an inactive venue and the one-per-venue-per-24-h rule. It answers one row
 * `{ ok, reason, check_in_id, visit_count }`; this maps it to the discriminated union the UI works with.
 */

export type CheckInDeniedReason =
  | 'not_present'
  | 'already_checked_in_24h'
  | 'owner'
  | 'invalid_business'
  | 'business_inactive'
  | 'auth_required';

export type CheckInResult =
  | { ok: true; checkInId: string; visitCount: number }
  | { ok: false; reason: CheckInDeniedReason }
  | { ok: false; reason: 'not_configured' }
  | { ok: false; reason: 'db_error'; message: string };

const DENIED: ReadonlySet<string> = new Set<CheckInDeniedReason>([
  'not_present',
  'already_checked_in_24h',
  'owner',
  'invalid_business',
  'business_inactive',
  'auth_required',
]);

export interface CheckInRpcRow {
  ok?: boolean | null;
  reason?: string | null;
  check_in_id?: string | null;
  visit_count?: number | null;
}

/** An RPC answer (`data`, or null with an `error`) → CheckInResult. Anything unexpected is a `db_error`, never a success. */
export function mapCheckInResponse(response: { data: unknown; error: { message?: string } | null }): CheckInResult {
  if (response.error) return { ok: false, reason: 'db_error', message: response.error.message ?? 'rpc_error' };
  const row = Array.isArray(response.data) ? (response.data[0] as CheckInRpcRow | undefined) : undefined;
  if (!row || typeof row !== 'object') return { ok: false, reason: 'db_error', message: 'empty_response' };

  if (row.ok === true) {
    if (row.reason === 'checked_in' && typeof row.check_in_id === 'string' && row.check_in_id.length > 0) {
      return { ok: true, checkInId: row.check_in_id, visitCount: typeof row.visit_count === 'number' ? row.visit_count : 1 };
    }
    return { ok: false, reason: 'db_error', message: 'unexpected_success' };
  }
  if (typeof row.reason === 'string' && DENIED.has(row.reason)) return { ok: false, reason: row.reason as CheckInDeniedReason };
  return { ok: false, reason: 'db_error', message: 'unexpected_reason' };
}
