/**
 * JChat 3.0 — User & Follow data-access service (Task 1.15)
 *
 * Pure async functions that wrap the shared Supabase client.
 * All types are co-located here.
 *
 * USER DISCOVERY NOTE (spec requirement):
 *   Users are ONLY discoverable inside business/event chat rooms.
 *   There is NO global user search in JChat 3.0. Do NOT add a
 *   global search function here — surface users exclusively from
 *   room member lists (Task 2.10 / UserActionSheet).
 */

import { supabase } from './supabase';
import { reportContent } from './reports';
import type { ReportReason } from '../utils/reportReasons';

// ── Co-located types ────────────────────────────────────────────────────────

/** Mirrors the `users` table row from 001_initial_schema.sql */
export interface UserRow {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  bio: string | null;
  city: string | null;
  profile_theme_id: number;
  is_incognito: boolean;
  is_verified: boolean;
  push_token: string | null;
  language: string;
  created_at: string;
  updated_at: string;
}

/**
 * Mirrors the `public_profiles` view (migration 018) — the non-sensitive subset
 * of `users` that ANY authenticated user may read. Has NO push_token / language /
 * email / role. Use this for OTHER users' profiles; `users` is now own-read only.
 */
export interface PublicProfileRow {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  bio: string | null;
  city: string | null;
  profile_theme_id: number;
  is_verified: boolean;
  created_at: string;
}

/** Mirrors the `follows` table row from 001_initial_schema.sql */
export interface FollowRow {
  id: string;
  follower_id: string;
  following_id: string;
  created_at: string;
}

/** Mirrors the `blocks` table */
export interface BlockRow {
  id: string;
  blocker_id: string;
  blocked_id: string;
  created_at: string;
}

/** Mirrors the `reports` table */
export interface ReportRow {
  id: string;
  reporter_id: string;
  reported_user_id: string | null;
  content_type: string;
  content_id: string | null;
  reason: string;
  status: string;
  created_at: string;
}

// ── User fetch ──────────────────────────────────────────────────────────────

/**
 * Fetch the CURRENT user's own full row (includes language, etc.). RLS allows a
 * user to read only their own row, so do NOT call this for other users — use
 * getPublicProfile() instead. Returns null if not found.
 */
export async function getUserById(userId: string): Promise<UserRow | null> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // row not found
    throw error;
  }
  return data as UserRow;
}

/**
 * Fetch any user's PUBLIC profile (non-sensitive columns) via the
 * `public_profiles` view. Safe for OTHER users — never exposes push_token.
 * Returns null if not found.
 */
export async function getPublicProfile(
  userId: string,
): Promise<PublicProfileRow | null> {
  const { data, error } = await supabase
    .from('public_profiles')
    .select('id, username, display_name, avatar_url, cover_url, bio, city, profile_theme_id, is_verified, created_at')
    .eq('id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // row not found
    throw error;
  }
  return data as PublicProfileRow;
}

// ── Follow / Unfollow ───────────────────────────────────────────────────────

/**
 * Unfollow a user.
 * Deletes the matching row from `follows`.
 */
export async function unfollowUser(
  currentUserId: string,
  targetId: string,
): Promise<void> {
  const { error } = await supabase
    .from('follows')
    .delete()
    .eq('follower_id', currentUserId)
    .eq('following_id', targetId);
  if (error) throw error;
}

/**
 * Check whether currentUserId is already following targetId.
 */
export async function isFollowing(
  currentUserId: string,
  targetId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('follows')
    .select('id')
    .eq('follower_id', currentUserId)
    .eq('following_id', targetId)
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}

/** Public counters of a profile (visible even for private accounts; zeros when blocked). */
export interface ProfileCounts {
  followers: number;
  following: number;
  /** Personal posts only: business posts are not counted. */
  posts: number;
}

/**
 * Counters via the profile_counts RPC (migration 180). Unlike counting `follows` rows from the
 * client, it is not limited by RLS or by the first page of posts.
 */
export async function getProfileCounts(userId: string): Promise<ProfileCounts> {
  const { data, error } = await supabase.rpc('profile_counts', { p_user: userId });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as
    | { followers?: number | string; following?: number | string; posts?: number | string }
    | null
    | undefined;
  return {
    followers: Number(row?.followers ?? 0),
    following: Number(row?.following ?? 0),
    posts: Number(row?.posts ?? 0),
  };
}

/**
 * Can `viewerId` see the posts of `targetId`? False for a private account the viewer does not
 * follow, and whenever there is a block between them (server rule can_view_profile).
 */
export async function canViewProfile(viewerId: string, targetId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('can_view_profile', { viewer: viewerId, target: targetId });
  if (error) throw error;
  return data === true;
}

// Following is NEVER an insert from the app: use requestOrFollow / acceptRequest /
// rejectRequest / cancelRequest (services/follows.ts) and blockUser / unblockUser
// (services/blocks.ts), which are RPC-backed (migrations 040, 178, 180, 181).

// ── Reports ─────────────────────────────────────────────────────────────────

/** Report a user for Super Admin review (report_content RPC, content_type 'user'). Throws ReportError. */
export async function reportUser(
  targetId: string,
  reason: ReportReason,
  details?: string,
): Promise<void> {
  await reportContent('user', targetId, reason, details);
}
