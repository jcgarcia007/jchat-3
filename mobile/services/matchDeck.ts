/**
 * JChat 3.0 — Match deck / swipe / profile / activity RPCs (Fase D3+)
 *
 * Wrappers over match_get_deck, match_swipe, match_undo_last, match_get_profile and
 * match_get_activity (migrations 189–194). Server is the source of truth for presence, the
 * 5-per-day Super Like quota, the age filter and "already swiped"; the client only mirrors it.
 */

import { supabase } from './supabase';
import type { MatchCard } from './matchTypes';

export type SwipeAction = 'like' | 'pass' | 'super';

export interface SwipeResult {
  swiped: boolean;
  is_match: boolean;
  match_id: string | null;
  conversation_id: string | null;
  super_left: number | null;
}

export interface UndoResult {
  undone: boolean;
  target_id: string | null;
  action: SwipeAction | null;
}

/** Known server error codes (PostgREST message) the UI translates. */
export type MatchErrorCode =
  | 'not_present'
  | 'not_in_same_venue'
  | 'super_like_quota'
  | 'already_swiped'
  | 'not_passed'
  | 'relike_limit'
  | 'relike_cooldown';

const KNOWN_ERRORS: readonly string[] = [
  'not_present',
  'not_in_same_venue',
  'super_like_quota',
  'already_swiped',
  'not_passed',
  'relike_limit',
  'relike_cooldown',
];

/** The Match error code carried by a thrown Supabase error, or null. */
export function matchErrorCode(err: unknown): MatchErrorCode | null {
  const message = (err as { message?: unknown } | null)?.message;
  if (typeof message !== 'string') return null;
  const found = KNOWN_ERRORS.find((code) => message.includes(code));
  return (found as MatchErrorCode | undefined) ?? null;
}

function asCard(raw: unknown): MatchCard | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<MatchCard>;
  if (typeof r.id !== 'string') return null;
  return {
    id: r.id,
    username: r.username ?? null,
    display_name: r.display_name ?? null,
    avatar_url: r.avatar_url ?? null,
    bio: r.bio ?? null,
    is_verified: r.is_verified === true,
    photos: Array.isArray(r.photos) ? r.photos.filter((p): p is string => typeof p === 'string') : [],
    interests: Array.isArray(r.interests) ? r.interests.filter((k): k is string => typeof k === 'string') : [],
    common_interests: Array.isArray(r.common_interests) ? r.common_interests : [],
    super_liked_me: r.super_liked_me === true,
  };
}

/** Next cards for the venue (people present, not yet seen, within the age filter). */
export async function getMatchDeck(businessId: string, limit = 20): Promise<MatchCard[]> {
  const { data, error } = await supabase.rpc('match_get_deck', { p_business_id: businessId, p_limit: limit });
  if (error) throw error;
  return (Array.isArray(data) ? data : []).map(asCard).filter((c): c is MatchCard => c !== null);
}

export async function matchSwipe(
  businessId: string,
  targetId: string,
  action: SwipeAction,
): Promise<SwipeResult> {
  const { data, error } = await supabase.rpc('match_swipe', {
    p_business_id: businessId,
    p_target_id: targetId,
    p_action: action,
  });
  if (error) throw error;
  const r = (data ?? {}) as Partial<SwipeResult>;
  return {
    swiped: r.swiped === true,
    is_match: r.is_match === true,
    match_id: r.match_id ?? null,
    conversation_id: r.conversation_id ?? null,
    super_left: typeof r.super_left === 'number' ? r.super_left : null,
  };
}

/**
 * People I passed on who are STILL at the venue (blocked and absent people are excluded server-side).
 * Same card format as the deck. Nobody is told they were passed or reviewed.
 */
export async function getMatchPassed(businessId: string): Promise<MatchCard[]> {
  const { data, error } = await supabase.rpc('match_get_passed' as never, { p_business_id: businessId } as never);
  if (error) throw error;
  return (Array.isArray(data) ? (data as unknown[]) : []).map(asCard).filter((c): c is MatchCard => c !== null);
}

/**
 * Turns a pass into a normal like (never a super): the person is notified like any like and a match
 * is detected. Errors: not_passed, relike_limit (20 per visit), relike_cooldown (30 s).
 */
export async function matchRelike(businessId: string, userId: string): Promise<SwipeResult> {
  const { data, error } = await supabase.rpc('match_relike' as never, { p_business_id: businessId, p_user_id: userId } as never);
  if (error) throw error;
  const r = (data ?? {}) as Partial<SwipeResult>;
  return {
    swiped: r.swiped === true,
    is_match: r.is_match === true,
    match_id: r.match_id ?? null,
    conversation_id: r.conversation_id ?? null,
    super_left: typeof r.super_left === 'number' ? r.super_left : null,
  };
}

export async function matchUndoLast(businessId: string): Promise<UndoResult> {
  const { data, error } = await supabase.rpc('match_undo_last', { p_business_id: businessId });
  if (error) throw error;
  const r = (data ?? {}) as Partial<UndoResult>;
  return { undone: r.undone === true, target_id: r.target_id ?? null, action: r.action ?? null };
}

/** Another person's profile in this venue (null when not available). */
export async function getMatchProfile(businessId: string, userId: string): Promise<MatchCard | null> {
  const { data, error } = await supabase.rpc('match_get_profile', { p_business_id: businessId, p_user_id: userId });
  if (error) throw error;
  return asCard(data);
}

// ── Activity ────────────────────────────────────────────────────────────────

export interface ActivityLike {
  swipe_id: string;
  action: 'like' | 'super';
  created_at: string;
  user: MatchCard;
}

export interface ActivityLikedMe {
  action: 'like' | 'super';
  created_at: string;
  user: MatchCard;
}

export interface ActivityMatch {
  match_id: string;
  is_super: boolean;
  conversation_id: string | null;
  created_at: string;
  user: MatchCard;
}

export interface MatchActivity {
  likes_given: ActivityLike[];
  liked_me: ActivityLikedMe[];
  matches: ActivityMatch[];
  super_left: number;
}

export async function getMatchActivity(businessId: string): Promise<MatchActivity> {
  const { data, error } = await supabase.rpc('match_get_activity', { p_business_id: businessId });
  if (error) throw error;
  const r = (data ?? {}) as Record<string, unknown>;
  const withUser = <T extends { user?: unknown }>(rows: unknown): (Omit<T, 'user'> & { user: MatchCard })[] =>
    (Array.isArray(rows) ? rows : [])
      .map((row) => {
        const user = asCard((row as T).user);
        return user ? ({ ...(row as T), user } as Omit<T, 'user'> & { user: MatchCard }) : null;
      })
      .filter((row): row is Omit<T, 'user'> & { user: MatchCard } => row !== null);
  return {
    likes_given: withUser<ActivityLike>(r.likes_given) as ActivityLike[],
    liked_me: withUser<ActivityLikedMe>(r.liked_me) as ActivityLikedMe[],
    matches: withUser<ActivityMatch>(r.matches) as ActivityMatch[],
    super_left: typeof r.super_left === 'number' ? r.super_left : 0,
  };
}

export async function deleteLike(swipeId: string): Promise<void> {
  const { error } = await supabase.rpc('match_delete_like', { p_swipe_id: swipeId });
  if (error) throw error;
}

export async function clearLikes(businessId: string): Promise<void> {
  const { error } = await supabase.rpc('match_clear_likes', { p_business_id: businessId });
  if (error) throw error;
}

export async function deleteMatch(matchId: string): Promise<void> {
  const { error } = await supabase.rpc('match_delete_match', { p_match_id: matchId });
  if (error) throw error;
}
