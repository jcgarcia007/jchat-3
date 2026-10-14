/**
 * JChat 3.0 — Check-In service (Task 1.18)
 *
 * Pure async functions that wrap the shared Supabase client.
 *
 * THE SERVER DECIDES (migration 235). `checkIn()` only calls the RPC `check_in(p_business_id)`, which requires the
 * person to be physically at the venue (venue_presence_ok — no client coordinates are trusted or even sent), excludes the
 * owner, and allows one check-in per venue per 24 h. The INSERT policy on `check_ins` is `with check (false)`: nobody
 * inserts directly any more, so a client-side radius / 24 h check would add nothing and is gone. The caller refreshes
 * the presence first (CheckInButton → runGeoCheck, the same fresh-position → check_geofence_and_join_room the chat gate
 * uses) and the RPC then reads it.
 *
 * PRIVACY RULES (enforced here and in callers):
 *   - `getCheckInHistory` returns business info WITHOUT created_at; the UI
 *     MUST NOT display timestamps on the profile Places tab.
 *   - This module never requests or logs device location.
 *
 * STAGE 2 STUB:
 *   - `postSystemMessageToRoom` is a named placeholder; insert into the
 *     `messages` table is stubbed with a TODO because the chat-room flow
 *     (Task 2.4) is not built yet. // TODO(Stage 2): post system message to room via messages table
 */

import { supabase, isSupabaseConfigured } from './supabase';
import { mapCheckInResponse, type CheckInResult } from '../utils/checkInResult';

export type { CheckInDeniedReason, CheckInResult } from '../utils/checkInResult';

// ── Co-located types ────────────────────────────────────────────────────────

/** Mirrors the `check_ins` table columns from 001_initial_schema.sql */
export interface CheckInRow {
  id: string;
  user_id: string;
  business_id: string;
  created_at: string;
}

/**
 * Minimal business fields joined for display on the profile Places tab.
 * NOTE: created_at is intentionally excluded from this type so the UI cannot
 * accidentally render it (privacy: Places tab shows no timestamps).
 */
export interface CheckInPlace {
  /** check_ins.id */
  checkInId: string;
  /** businesses.id */
  businessId: string;
  businessName: string;
  businessSlug: string;
  businessCategory: string | null;
  businessCity: string | null;
  businessLogoUrl: string | null;
  /** Aggregate visit count only; individual check-in dates remain private. */
  visitCount: number;
}

/** Parameters accepted by checkIn() */
export interface CheckInParams {
  /** The venue (businesses.id). The person is the authenticated user: the server reads auth.uid(). */
  businessId: string;
  /** Room the user is currently in — used for system message stub (Stage 2) */
  roomId: string;
  /** Display name of the current user (for system message body). */
  username: string;
  /** Venue name (system message body); falls back to the id. */
  businessName?: string;
}

// ── Stage 2 stub ─────────────────────────────────────────────────────────────

/**
 * Post a system message in the room announcing the check-in.
 *
 * // TODO(Stage 2): post system message to room via messages table
 *
 * The `messages` table requires a `user_id` (NOT NULL) so a true system message
 * would need either a dedicated system/bot user or a nullable user_id column.
 * For now this is a named no-op; when Stage 2 lands, replace the body with:
 *
 *   await supabase.from('messages').insert({
 *     room_id:  roomId,
 *     user_id:  systemUserId,   // dedicated service-account uuid
 *     body:     `@${username} checked in at ${businessName}`,
 *   });
 *
 * If the schema adds `is_system boolean` to messages, the insert RLS policy
 * will need to allow system inserts (either via service_role or a designated uid).
 */
async function postSystemMessageToRoom(
  _roomId: string,
  _username: string,
  _businessName: string,
): Promise<void> {
  // TODO(Stage 2): post system message to room via messages table
  // No-op until Stage 2 (Task 2.4) is implemented.
}

// ── Check-In ─────────────────────────────────────────────────────────────────

/**
 * Check in at a business. The server decides (see the header): the result says why it was refused
 * (`not_present`, `already_checked_in_24h`, `owner`, `invalid_business`, `business_inactive`, `auth_required`).
 * A network / server failure is `db_error`; nothing is thrown.
 */
export async function checkIn(params: CheckInParams): Promise<CheckInResult> {
  const { businessId, roomId, username, businessName } = params;

  if (!isSupabaseConfigured) {
    return { ok: false, reason: 'not_configured' };
  }

  let result: CheckInResult;
  try {
    const response = await supabase.rpc('check_in', { p_business_id: businessId });
    result = mapCheckInResponse({ data: response.data, error: response.error });
  } catch (err) {
    return { ok: false, reason: 'db_error', message: err instanceof Error ? err.message : 'rpc_failed' };
  }

  if (result.ok) {
    // Stage 2 stub — system message
    await postSystemMessageToRoom(roomId, username, businessName ?? businessId);
  }
  return result;
}

// ── Check-In history (profile Places tab) ───────────────────────────────────

/**
 * Fetch the check-in history for a user, joined with business info.
 *
 * PRIVACY: `created_at` is NOT included in the returned `CheckInPlace` type.
 * The profile Places tab must display business name/logo only — never timestamps.
 * (Master Spec privacy rules: no real-time or historical location disclosure.)
 *
 * Returns the most recent unique-business visits (latest per business) ordered
 * by most recently visited, limited to 50.
 */
export async function getCheckInHistory(
  userId: string,
): Promise<CheckInPlace[]> {
  if (!isSupabaseConfigured) return [];

  // Fetch check_ins for this user joined with business fields.
  // We select check_ins.id + created_at (for internal ordering only),
  // then strip created_at from the returned objects before passing to callers.
  const { data, error } = await supabase
    .from('check_ins')
    .select(
      `id,
       business_id,
       created_at,
       businesses (
         name,
         slug,
         category,
         city,
         logo_url
       )`,
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) throw error;
  if (!data) return [];

  // De-duplicate: keep only the most recent check-in per business,
  // then return without created_at (privacy).
  const seen = new Set<string>();
  const visitCounts = new Map<string, number>();
  const places: CheckInPlace[] = [];

  for (const row of data as unknown as JoinedRow[]) {
    visitCounts.set(row.business_id, (visitCounts.get(row.business_id) ?? 0) + 1);
  }

  type JoinedRow = {
    id: string;
    business_id: string;
    created_at: string; // used for ordering only — NOT returned
    businesses: {
      name: string;
      slug: string;
      category: string | null;
      city: string | null;
      logo_url: string | null;
    } | null;
  };

  for (const row of data as unknown as JoinedRow[]) {
    if (seen.has(row.business_id)) continue;
    seen.add(row.business_id);

    const biz = row.businesses;
    places.push({
      checkInId: row.id,
      businessId: row.business_id,
      businessName: biz?.name ?? '',
      businessSlug: biz?.slug ?? '',
      businessCategory: biz?.category ?? null,
      businessCity: biz?.city ?? null,
      businessLogoUrl: biz?.logo_url ?? null,
      visitCount: visitCounts.get(row.business_id) ?? 1,
    });

    if (places.length >= 50) break;
  }

  return places;
}
