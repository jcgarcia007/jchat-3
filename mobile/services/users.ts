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

// ── Co-located types ────────────────────────────────────────────────────────

/** Mirrors the `users` table row from 001_initial_schema.sql */
export interface UserRow {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
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
  bio: string | null;
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

/**
 * Describes the relationship state between the current user and a target user.
 *
 * NOTE: The `follows` table has no `status` / pending column (001_initial_schema.sql).
 * Pending follow requests are modelled by inserting into `follow_requests`
 * — see TODO below. Until that table exists, `isPending` is always false at runtime.
 *
 * TODO(schema): add follow_requests table with columns:
 *   id uuid, requester_id uuid references users(id), target_id uuid references users(id),
 *   created_at timestamptz, unique(requester_id, target_id)
 */
export type FollowState = 'following' | 'pending' | 'none';

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
    .select('id, username, display_name, avatar_url, bio, profile_theme_id, is_verified, created_at')
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
 * Follow a user (direct follow — assumes the target account is public).
 * Inserts a row into `follows` (follower_id = current user, following_id = targetId).
 * Uses upsert to be idempotent — silently succeeds if already following.
 */
export async function followUser(
  currentUserId: string,
  targetId: string,
): Promise<void> {
  const { error } = await supabase
    .from('follows')
    .upsert(
      { follower_id: currentUserId, following_id: targetId },
      { onConflict: 'follower_id,following_id' },
    );
  if (error) throw error;
}

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

/** Get the number of followers for a given user. */
export async function getFollowerCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('follows')
    .select('id', { count: 'exact', head: true })
    .eq('following_id', userId);
  if (error) throw error;
  return count ?? 0;
}

/** Get the number of accounts a given user is following. */
export async function getFollowingCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('follows')
    .select('id', { count: 'exact', head: true })
    .eq('follower_id', userId);
  if (error) throw error;
  return count ?? 0;
}

// Follow requests + block/unblock moved to services/follows.ts and
// services/blocks.ts (RPC-backed, migration 040). See requestOrFollow /
// acceptRequest / rejectRequest / cancelRequest and blockUser / unblockUser there.

// ── Reports ─────────────────────────────────────────────────────────────────

/** Report a user for Super Admin review. */
export async function reportUser(
  currentUserId: string,
  targetId: string,
  reason: string,
): Promise<void> {
  const { error } = await supabase
    .from('reports')
    .insert({
      reporter_id: currentUserId,
      reported_user_id: targetId,
      content_type: 'user',
      status: 'pending',
      reason,
    });
  if (error) throw error;
}
