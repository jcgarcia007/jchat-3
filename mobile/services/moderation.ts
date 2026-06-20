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

  // Upsert so a second mute call simply refreshes the expiry.
  const { error } = await supabase
    .from('room_mutes')
    .upsert(
      {
        room_id: roomId,
        user_id: userId,
        muted_by: mutedBy,
        expires_at: expiresAt,
      },
      { onConflict: 'room_id,user_id' },
    );

  if (error) throw error;

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

// ── banUser ───────────────────────────────────────────────────────────────────

/**
 * Permanently ban a user from a business room.
 *
 * This inserts into `bans` (the unique constraint on room_id + user_id makes
 * it idempotent) and writes an audit log row. The caller is responsible for
 * physically removing the user from the live room (e.g. via Realtime presence
 * eviction or a server-side signal).
 *
 * @param businessId — UUID of the business
 * @param roomId     — UUID of the room
 * @param userId     — UUID of the user being banned
 * @param bannedBy   — UUID of the moderator/owner performing the action
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

  const { error } = await supabase
    .from('bans')
    .upsert(
      {
        business_id: businessId,
        room_id: roomId,
        user_id: userId,
        banned_by: bannedBy,
        reason: reason ?? null,
      },
      { onConflict: 'room_id,user_id' },
    );

  if (error) throw error;

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
 * Lift a permanent ban.
 *
 * @param businessId — UUID of the business (for the audit log)
 * @param roomId     — UUID of the room
 * @param userId     — UUID of the user being unbanned
 * @param unbannedBy — UUID of the moderator/owner performing the action
 */
export async function unban(
  businessId: string,
  roomId: string,
  userId: string,
  unbannedBy: string,
): Promise<void> {
  assertConfigured();

  const { error } = await supabase
    .from('bans')
    .delete()
    .eq('room_id', roomId)
    .eq('user_id', userId);

  if (error) throw error;

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

  const { data, error } = await supabase
    .from('bans')
    .select('user_id')
    .eq('room_id', roomId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return data !== null;
}
