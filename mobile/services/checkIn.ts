/**
 * JChat 3.0 — Check-In service (Task 1.18)
 *
 * Pure async functions that wrap the shared Supabase client.
 * All types are co-located here.
 *
 * PRIVACY RULES (enforced here and in callers):
 *   - `getCheckInHistory` returns business info WITHOUT created_at; the UI
 *     MUST NOT display timestamps on the profile Places tab.
 *   - GPS is consumed ONLY as caller-supplied lat/lng; this module never
 *     requests device location. // TODO(Stage 4): obtain device location for geofence
 *
 * STAGE 2 STUBS:
 *   - `postSystemMessageToRoom` is a named placeholder; insert into the
 *     `messages` table is stubbed with a TODO because the chat-room flow
 *     (Task 2.4) is not built yet. // TODO(Stage 2): post system message to room via messages table
 *
 * SCHEMA NOTE:
 *   // TODO(schema): unique constraint per (user_id, business_id, 24h window).
 *   A partial/conditional unique index would look like:
 *     create unique index on check_ins (user_id, business_id)
 *     where created_at > now() - interval '24 hours';
 *   Until that lands, this service enforces the 24h rule client-side.
 */

import { supabase, isSupabaseConfigured } from './supabase';

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
}

/** Discriminated union returned by checkIn() */
export type CheckInResult =
  | { ok: true; checkInId: string }
  | { ok: false; reason: 'already_checked_in_24h' }
  | { ok: false; reason: 'outside_radius' }
  | { ok: false; reason: 'not_configured' }
  | { ok: false; reason: 'db_error'; message: string };

/** Parameters accepted by checkIn() */
export interface CheckInParams {
  userId: string;
  businessId: string;
  /** Room the user is currently in — used for system message stub (Stage 2) */
  roomId: string;
  /** Device latitude. Required when venueData is provided for geofence check. */
  userLat?: number;
  /** Device longitude. Required when venueData is provided for geofence check. */
  userLng?: number;
  /**
   * Pass venue lat/lng + radius when a geofence check is desired.
   * If omitted the geofence check is skipped (e.g. in contexts where
   * device location is unavailable — the button should not pass these
   * until Stage 4 wires up device GPS).
   * // TODO(Stage 4): obtain device location for geofence
   */
  venueData?: {
    lat: number;
    lng: number;
    /** Geofence radius in metres (from businesses table / owner config). */
    radiusM: number;
    name: string;
    ownerUsername?: string;
  };
  /** Display name of the current user (for system message body). */
  username: string;
}

// ── Geofence helper ─────────────────────────────────────────────────────────

/**
 * Returns true when (userLat, userLng) is within radiusM metres of (venueLat, venueLng).
 * Uses the haversine formula.
 */
export function isWithinRadius(
  userLat: number,
  userLng: number,
  venueLat: number,
  venueLng: number,
  radiusM: number,
): boolean {
  const R = 6_371_000; // Earth radius in metres
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(venueLat - userLat);
  const dLng = toRad(venueLng - userLng);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(userLat)) *
      Math.cos(toRad(venueLat)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distanceM = R * c;

  return distanceM <= radiusM;
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
 * Perform a check-in for the current user at a business.
 *
 * Steps:
 *   1. Guard: isSupabaseConfigured
 *   2. Geofence check (if venueData + userLat/userLng provided)
 *   3. 24h de-dup check (client-side; complement with DB constraint when ready)
 *   4. Insert into check_ins
 *   5. Stub: post system message (Stage 2)
 */
export async function checkIn(params: CheckInParams): Promise<CheckInResult> {
  const { userId, businessId, roomId, userLat, userLng, venueData, username } =
    params;

  // ── 1. Guard ──────────────────────────────────────────────────────────────
  if (!isSupabaseConfigured) {
    return { ok: false, reason: 'not_configured' };
  }

  // ── 2. Geofence check ────────────────────────────────────────────────────
  // TODO(Stage 4): obtain device location for geofence — the caller is
  // responsible for passing userLat/userLng from expo-location (Stage 4).
  if (
    venueData !== undefined &&
    userLat !== undefined &&
    userLng !== undefined
  ) {
    const within = isWithinRadius(
      userLat,
      userLng,
      venueData.lat,
      venueData.lng,
      venueData.radiusM,
    );
    if (!within) {
      return { ok: false, reason: 'outside_radius' };
    }
  }

  // ── 3. 24h de-dup check ──────────────────────────────────────────────────
  // TODO(schema): unique constraint per (user_id, business_id, 24h window).
  // When the DB partial-unique index exists this query becomes a belt-and-suspenders
  // check; the insert will also be rejected by the constraint.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: existing, error: existingError } = await supabase
    .from('check_ins')
    .select('id')
    .eq('user_id', userId)
    .eq('business_id', businessId)
    .gte('created_at', since)
    .limit(1)
    .maybeSingle();

  if (existingError) {
    return { ok: false, reason: 'db_error', message: existingError.message };
  }
  if (existing !== null) {
    return { ok: false, reason: 'already_checked_in_24h' };
  }

  // ── 4. Insert check-in row ───────────────────────────────────────────────
  const { data: inserted, error: insertError } = await supabase
    .from('check_ins')
    .insert({ user_id: userId, business_id: businessId })
    .select('id')
    .single();

  if (insertError) {
    return { ok: false, reason: 'db_error', message: insertError.message };
  }

  // ── 5. Stage 2 stub — system message ─────────────────────────────────────
  await postSystemMessageToRoom(
    roomId,
    username,
    venueData?.name ?? businessId,
  );

  return { ok: true, checkInId: (inserted as { id: string }).id };
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
  const places: CheckInPlace[] = [];

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
    });

    if (places.length >= 50) break;
  }

  return places;
}
