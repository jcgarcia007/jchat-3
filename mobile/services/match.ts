/**
 * JChat 3.0 — Match service (Fase D1)
 *
 * Thin wrappers over the Match RPCs (migrations 189–194). Server is the source of truth:
 * presence, deck, swipes and deletion all live in the database; nothing here decides access.
 * Errors are thrown as-is (PostgREST/Postgres codes) — callers translate with toUserMessage().
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, isSupabaseConfigured } from './supabase';

// ── Types ───────────────────────────────────────────────────────────────────

export type MatchCheckInStatus = 'active' | 'pending' | 'denied';

export type MatchDenyReason =
  | 'age_not_confirmed'
  | 'games_disabled'
  | 'match_disabled'
  | 'unavailable'
  | 'invalid_qr'
  | 'location_required'
  | 'no_geofence'
  | 'outside_radius'
  | 'not_in_venue'
  /** The heartbeat of a person who has not entered Match (or left it): nothing is written (migration 256). */
  | 'not_joined'
  | 'impossible_travel';

export interface MatchCheckInResult {
  status: MatchCheckInStatus;
  reason?: MatchDenyReason | string;
  active_since?: string | null;
  expires_at?: string | null;
  readings?: number;
  method?: 'qr' | 'geo';
}

export interface GameRow {
  key: string;
  name_es: string;
  name_en: string;
  is_active: boolean;
  sort: number;
}

export interface CheckInParams {
  businessId: string;
  lat?: number | null;
  lng?: number | null;
  qrToken?: string | null;
  mocked?: boolean;
}

// ── RPCs ────────────────────────────────────────────────────────────────────

/** Whether the owner enabled Match at this venue (business_games). False in demo mode. */
export async function isMatchEnabledForBusiness(businessId: string): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  const { data, error } = await supabase.rpc('match_enabled_for_business', { p_business_id: businessId });
  if (error) throw error;
  return data === true;
}

/** Active games of the catalog (today only Match), ordered by `sort`. */
export async function fetchGames(): Promise<GameRow[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from('games')
    .select('key, name_es, name_en, is_active, sort')
    .eq('is_active', true)
    .order('sort', { ascending: true });
  if (error) throw error;
  return (data ?? []) as GameRow[];
}

async function callPresenceRpc(fn: 'match_check_in' | 'match_join_venue', params: CheckInParams): Promise<MatchCheckInResult> {
  const { data, error } = await supabase.rpc(fn, {
    p_business_id: params.businessId,
    p_lat: params.lat ?? null,
    p_lng: params.lng ?? null,
    p_qr_token: params.qrToken ?? null,
    p_mocked: params.mocked === true,
  });
  if (error) throw error;
  const result = (data ?? {}) as Partial<MatchCheckInResult>;
  return {
    ...result,
    status: result.status === 'active' || result.status === 'pending' ? result.status : 'denied',
  };
}

/**
 * Heartbeat: renews the presence of a person who already joined Match. It NEVER enrols anyone: without an opt-in the server answers
 * { status: 'denied', reason: 'not_joined' } and writes nothing (migration 256). Geo activates with the chat's GPS reading; a valid QR token instantly.
 */
export async function matchCheckIn(params: CheckInParams): Promise<MatchCheckInResult> {
  return callPresenceRpc('match_check_in', params);
}

/**
 * The explicit entry to Match (Games → Match, or the venue QR): validates, renews the presence and creates the opt-in. The ONLY call that
 * enrols a person (migration 256); the heartbeat and the venue session never call it.
 */
export async function matchJoinVenue(params: CheckInParams): Promise<MatchCheckInResult> {
  return callPresenceRpc('match_join_venue', params);
}

/** Deletes everything of mine at this venue (presence, swipes, likes, matches, ephemeral chats). */
export async function matchLeaveVenue(businessId: string): Promise<void> {
  const { error } = await supabase.rpc('match_leave_venue', { p_business_id: businessId });
  if (error) throw error;
}

// ── Local flags (AsyncStorage; per business) ────────────────────────────────

const NOTICE_SEEN_KEY = (businessId: string) => `match.noticeSeen.${businessId}`;

/** True once the user saw the FULL entry notice at this venue (later visits get the short one). */
export async function hasSeenMatchNotice(businessId: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(NOTICE_SEEN_KEY(businessId))) === '1';
  } catch {
    return false;
  }
}

export async function markMatchNoticeSeen(businessId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(NOTICE_SEEN_KEY(businessId), '1');
  } catch {
    // best effort: the full notice just shows again
  }
}

const INTERESTS_SKIPPED_KEY = 'match.interestsQuizSkipped';

/** True when the user skipped the first-time interests quiz (don't nag again). */
export async function hasSkippedInterestsQuiz(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(INTERESTS_SKIPPED_KEY)) === '1';
  } catch {
    return false;
  }
}

export async function markInterestsQuizSkipped(): Promise<void> {
  try {
    await AsyncStorage.setItem(INTERESTS_SKIPPED_KEY, '1');
  } catch {
    // best effort
  }
}
