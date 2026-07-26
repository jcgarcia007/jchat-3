/**
 * JChat 3.0 — Room Access / Password-Protection service (Task 2.14)
 *
 * Handles:
 *   - Server-side password verification (RPC stub — bcrypt server-side only)
 *   - Lockout state tracking via `room_access_attempts` table
 *
 * SECURITY PRINCIPLES (NEVER relax):
 *   - `password_hash` is NEVER selected or compared on the client.
 *   - The plaintext password is passed only to the RPC function, which runs
 *     bcrypt.compare server-side and returns a boolean result.
 *   - The client receives only `{ ok: boolean }` — no hash, no timing oracle.
 *
 * // TODO(i18n)
 */

import { supabase, isSupabaseConfigured } from './supabase';

// ── Constants ────────────────────────────────────────────────────────────────

/** Number of failed attempts before the account is locked for this room. */
export const MAX_ATTEMPTS = 5;

/** Lockout duration in milliseconds (30 minutes). */
export const LOCKOUT_MS = 30 * 60 * 1000;

// ── Types ────────────────────────────────────────────────────────────────────

/** Shape of a row in `room_access_attempts`. */
export interface RoomAccessAttemptRow {
  room_id: string;
  user_id: string;
  fail_count: number;
  /** ISO-8601 string or null — null means "not locked". */
  locked_until: string | null;
  updated_at: string;
}

/** Result of verifyRoomPassword(). */
export type VerifyResult =
  | { ok: true }
  | { ok: false; error: 'locked_out'; lockedUntil?: string }
  | { ok: false; error: 'wrong_password' | 'not_configured' | 'rpc_error'; message?: string };

/** Snapshot of the current lockout state for a (room, user) pair. */
export interface LockState {
  /** Whether the user is currently locked out. */
  locked: boolean;
  /**
   * ISO-8601 timestamp when the lock expires, or null if not locked.
   * Use this to compute "N minutes remaining" in the UI.
   */
  lockedUntil: string | null;
  /** Current failure count. */
  failCount: number;
}

// ── Password verification ─────────────────────────────────────────────────────

/**
 * Verify a room password by calling a server-side RPC.
 *
 * The password is sent to the RPC; bcrypt.compare is done entirely server-side.
 * The client NEVER receives or compares `rooms.password_hash`.
 *
 * TODO(edge/rpc): implement `verify_room_password` Postgres function or
 * Edge Function:
 *
 *   -- Postgres RPC (requires pgcrypto):
 *   create or replace function verify_room_password(room_id uuid, password text)
 *   returns boolean language plpgsql security definer as $$
 *   declare
 *     _hash text;
 *   begin
 *     select password_hash into _hash from rooms where id = room_id;
 *     if _hash is null then return false; end if;
 *     -- pgcrypto does not expose crypt() for bcrypt comparison with `gen_salt`.
 *     -- Use an Edge Function instead if bcrypt is required.
 *     return crypt(password, _hash) = _hash;
 *   end;
 *   $$;
 *
 *   -- Or delegate to a Supabase Edge Function (recommended for true bcrypt):
 *   -- The RPC body calls an internal fetch to the edge function with
 *   -- `room_id` + the plaintext `password`, which never touches the client.
 *
 * NEVER expose `password_hash` to the client.
 */
export async function verifyRoomPassword(
  roomId: string,
  password: string,
): Promise<VerifyResult> {
  if (!isSupabaseConfigured) {
    return { ok: false, error: 'not_configured' };
  }

  const { data, error } = await supabase.rpc('verify_room_password', {
    room_id: roomId,
    // The plaintext password is sent to the RPC only — never stored or logged.
    password,
  });

  if (error) {
    // The RPC raises `locked_out` (with detail = unlock timestamp) when the
    // server-side lockout is active. supabase-js surfaces the RAISE message in
    // `error.message` and the DETAIL in `error.details`.
    const details = (error as { details?: string }).details;
    if (error.message?.includes('locked_out') || details?.includes('locked_out')) {
      // `details` carries the locked_until timestamp (e.g. "2026-06-24 05:19:40+00").
      const lockedUntil =
        details && !details.includes('locked_out') ? details : undefined;
      return { ok: false, error: 'locked_out', lockedUntil };
    }
    return { ok: false, error: 'rpc_error', message: error.message };
  }

  // The RPC returns a boolean: true = password correct.
  if (data === true) {
    return { ok: true };
  }

  return { ok: false, error: 'wrong_password' };
}

// ── Lockout state ─────────────────────────────────────────────────────────────

/**
 * Fetch the current lock state for a (roomId, userId) pair.
 * Returns a safe default (unlocked, 0 fails) when the row does not exist or
 * Supabase is not configured.
 */
export async function getLockState(
  roomId: string,
  userId: string,
): Promise<LockState> {
  if (!isSupabaseConfigured) {
    return { locked: false, lockedUntil: null, failCount: 0 };
  }

  const { data, error } = await supabase
    .from('room_access_attempts')
    .select('fail_count, locked_until')
    .eq('room_id', roomId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) {
    return { locked: false, lockedUntil: null, failCount: 0 };
  }

  const row = data as Pick<RoomAccessAttemptRow, 'fail_count' | 'locked_until'>;
  const now = Date.now();
  const isLocked =
    row.locked_until !== null && new Date(row.locked_until).getTime() > now;

  return {
    locked: isLocked,
    lockedUntil: isLocked ? row.locked_until : null,
    failCount: row.fail_count,
  };
}

