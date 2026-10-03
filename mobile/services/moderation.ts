/**
 * JChat 3.0 — Moderation service (Task 2.10)
 *
 * Owner/moderator actions for business chat rooms:
 *   muteInRoom   — room-scoped mute (timed or permanent) → room_mutes
 *   unmute       — lift a room mute
 *   banUser      — permanent ban + implied removal → bans
 *   unban        — lift a ban
 *   isBanned     — check whether a user is banned from a room
 *   logAction    — append a row to moderation_logs
 *
 * Every public function that writes to bans or room_mutes also writes a
 * corresponding moderation_logs row so there is a complete audit trail.
 *
 * Guard: all calls no-op (throw) when !isSupabaseConfigured so the app runs
 * safely in demo mode.
 *
 * Co-located types mirror the schema from 004_moderation.sql.
 *
 * // TODO(i18n)
 */

import { supabase, isSupabaseConfigured } from './supabase';

// ── Co-located types ──────────────────────────────────────────────────────────

/** Every supported moderation action written to moderation_logs. */
export type ModerationAction =
  | 'mute'
  | 'unmute'
  | 'ban'
  | 'unban'
  | 'warn'
  | 'remove';

/** Mirrors moderation_logs table row. */
export interface ModerationLogRow {
  id: string;
  business_id: string;
  room_id: string;
  actor_id: string;
  target_id: string;
  action: ModerationAction;
  detail: string | null;
  created_at: string;
}

/** Mirrors bans table row. */
export interface BanRow {
  id: string;
  business_id: string;
  room_id: string;
  user_id: string;
  banned_by: string;
  reason: string | null;
  created_at: string;
}

/** Mirrors room_mutes table row. */
export interface RoomMuteRow {
  id: string;
  room_id: string;
  user_id: string;
  muted_by: string;
  /** ISO-8601 timestamp; null means permanent. */
  expires_at: string | null;
  created_at: string;
}

/** Parameters for logAction. */
export interface LogActionParams {
  businessId: string;
  roomId: string;
  /** The moderator/owner performing the action. */
  actorId: string;
  /** The user being acted upon. */
  targetId: string;
  action: ModerationAction;
  detail?: string | null;
}

// ── Internal guard ────────────────────────────────────────────────────────────

function assertConfigured(): void {
  if (!isSupabaseConfigured) {
    throw new Error(
      '[moderation] Supabase is not configured. Moderation actions are unavailable in demo mode.',
    );
  }
}

// ── logAction ─────────────────────────────────────────────────────────────────

/**
 * Append a row to `moderation_logs`.
 *
 * Call this for every owner/moderator action — it is also called internally by
 * muteInRoom, unmute, banUser, and unban.
 */
export async function logAction(params: LogActionParams): Promise<void> {
  assertConfigured();

  const { businessId, roomId, actorId, targetId, action, detail } = params;

  const { error } = await supabase.from('moderation_logs').insert({
    business_id: businessId,
    room_id: roomId,
    actor_id: actorId,
    target_id: targetId,
    action,
    detail: detail ?? null,
  });

  if (error) throw error;
}

// ── muteInRoom ────────────────────────────────────────────────────────────────

/**
 * Mute a user within a specific room.
 *
 * @param roomId      — UUID of the room
 * @param userId      — UUID of the user being muted
 * @param mutedBy     — UUID of the moderator/owner performing the action
 * @param businessId  — UUID of the business (for the audit log)
 * @param durationHours — positive number = timed mute; null = permanent
 */
export async function muteInRoom(
  roomId: string,
  userId: string,
  mutedBy: string,
  businessId: string,
  durationHours: number | null,
): Promise<void> {
  assertConfigured();

  const expiresAt: string | null =
    durationHours !== null
      ? new Date(Date.now() + durationHours * 60 * 60 * 1000).toISOString()
      : null;

  // UPDATE-then-INSERT instead of upsert: keeps room_id/user_id out of the SET
  // clause (they're only in the WHERE), so a column-level UPDATE grant on just
  // (muted_by, expires_at) is enough — an upsert's ON CONFLICT DO UPDATE would
  // also need UPDATE on the conflict-key columns themselves (D-54 099).
  const { data: updated, error: updateErr } = await supabase
    .from('room_mutes')
    .update({ muted_by: mutedBy, expires_at: expiresAt })
    .eq('room_id', roomId)
    .eq('user_id', userId)
    .select('id');

  if (updateErr) throw updateErr;

  if (!updated || updated.length === 0) {
    const { error: insertErr } = await supabase
      .from('room_mutes')
      .insert({
        room_id: roomId,
        user_id: userId,
        muted_by: mutedBy,
        expires_at: expiresAt,
      });

    if (insertErr) throw insertErr;
  }

  // Audit log
  const detail =
    durationHours !== null
      ? `Muted for ${durationHours}h`
      : 'Muted permanently';

  await logAction({
    businessId,
    roomId,
    actorId: mutedBy,
    targetId: userId,
    action: 'mute',
    detail,
  });
}

// ── unmute ────────────────────────────────────────────────────────────────────

/**
 * Lift a room mute for a user.
 *
 * @param roomId     — UUID of the room
 * @param userId     — UUID of the user being unmuted
 * @param unmutedBy  — UUID of the moderator/owner performing the action
 * @param businessId — UUID of the business (for the audit log)
 */
export async function unmute(
  roomId: string,
  userId: string,
  unmutedBy: string,
  businessId: string,
): Promise<void> {
  assertConfigured();

  const { error } = await supabase
    .from('room_mutes')
    .delete()
    .eq('room_id', roomId)
    .eq('user_id', userId);

  if (error) throw error;

  await logAction({
    businessId,
    roomId,
    actorId: unmutedBy,
    targetId: userId,
    action: 'unmute',
    detail: null,
  });
}

// ── expelFromRoom ─────────────────────────────────────────────────────────────

/**
 * Remove a user from ONE room for good: a `bans` row with room_id (no expiry). The server
 * enforces it (is_banned_from_room / migration 179); the owner is the only one who can write it.
 * Idempotent: an existing room ban counts as done.
 */
export async function expelFromRoom(
  businessId: string,
  roomId: string,
  userId: string,
  expelledBy: string,
): Promise<void> {
  assertConfigured();

  const { error } = await supabase
    .from('bans')
    .insert({ room_id: roomId, user_id: userId, banned_by: expelledBy });
  if (error && error.code !== '23505') throw error; // 23505: already banned from this room

  await logAction({
    businessId,
    roomId,
    actorId: expelledBy,
    targetId: userId,
    action: 'remove',
    detail: null,
  });
}

// ── banUser ───────────────────────────────────────────────────────────────────

/**
 * Ban a user from the whole business: a `bans` row with business_id and room_id NULL, which
 * the server treats as a ban from every room of that business (is_banned_from_room).
 * Idempotent: an existing business ban counts as done.
 *
 * @param businessId — UUID of the business
 * @param roomId     — UUID of the room the action came from (audit log only)
 * @param userId     — UUID of the user being banned
 * @param bannedBy   — UUID of the owner performing the action
 * @param reason     — optional human-readable reason (stored in bans.reason)
 */
export async function banUser(
  businessId: string,
  roomId: string,
  userId: string,
  bannedBy: string,
  reason?: string,
): Promise<void> {
  assertConfigured();

  // (room_id, user_id) is unique, but NULL room_ids never collide: look for an existing
  // business-wide ban first so a repeated ban does not pile up duplicate rows.
  const { data: existing, error: lookupErr } = await supabase
    .from('bans')
    .select('id')
    .eq('business_id', businessId)
    .eq('user_id', userId)
    .is('room_id', null)
    .maybeSingle();
  if (lookupErr) throw lookupErr;

  if (!existing) {
    const { error: insertErr } = await supabase.from('bans').insert({
      business_id: businessId,
      room_id: null,
      user_id: userId,
      banned_by: bannedBy,
      reason: reason ?? null,
    });
    if (insertErr) throw insertErr;
  }

  await logAction({
    businessId,
    roomId,
    actorId: bannedBy,
    targetId: userId,
    action: 'ban',
    detail: reason ?? null,
  });
}

// ── unban ─────────────────────────────────────────────────────────────────────

/**
 * Lift a ban (room-level and business-wide) for a user.
 *
 * @param businessId — UUID of the business (for the audit log)
 * @param roomId     — UUID of the room
 * @param userId     — UUID of the user being unbanned
 * @param unbannedBy — UUID of the owner performing the action
 */
export async function unban(
  businessId: string,
  roomId: string,
  userId: string,
  unbannedBy: string,
): Promise<void> {
  assertConfigured();

  const { error: roomErr } = await supabase
    .from('bans')
    .delete()
    .eq('room_id', roomId)
    .eq('user_id', userId);
  if (roomErr) throw roomErr;

  const { error: bizErr } = await supabase
    .from('bans')
    .delete()
    .eq('business_id', businessId)
    .is('room_id', null)
    .eq('user_id', userId);
  if (bizErr) throw bizErr;

  await logAction({
    businessId,
    roomId,
    actorId: unbannedBy,
    targetId: userId,
    action: 'unban',
    detail: null,
  });
}

// ── isBanned ──────────────────────────────────────────────────────────────────

/**
 * Check whether a user is currently banned from a specific room.
 *
 * Returns false when Supabase is not configured (demo mode).
 */
export async function isBanned(
  roomId: string,
  userId: string,
): Promise<boolean> {
  if (!isSupabaseConfigured) return false;

  // Server-side rule (migration 179): a ban on this room, or a business-wide ban.
  const { data, error } = await supabase.rpc('is_banned_from_room', {
    p_room: roomId,
    p_user: userId,
  });

  if (error) throw error;
  return data === true;
}
