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

/** Fetch a single user profile by id. Returns null if not found. */
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

// ── Follow Requests (private accounts) ─────────────────────────────────────

/**
 * Send a follow request to a private-account user.
 *
 * TODO(schema): This function targets a `follow_requests` table that does not
 * yet exist in 001_initial_schema.sql. Until the table is added, calling this
 * function will return a Supabase error at runtime. The types are correct so
 * the rest of the codebase can reference `requestFollow` without type errors.
 *
 * When the schema is ready, also trigger a notification (type: 'follow') for
 * the target user via the Edge Function or service_role insert into `notifications`.
 */
export async function requestFollow(
  currentUserId: string,
  targetId: string,
): Promise<void> {
  // TODO(schema): add follow_requests table — see FollowState type above
  const { error } = await supabase
    .from('follow_requests' as 'follows') // cast keeps tsc happy until table exists
    .upsert(
      { requester_id: currentUserId, target_id: targetId } as unknown as {
        follower_id: string;
        following_id: string;
      },
      { onConflict: 'requester_id,target_id' } as { onConflict: string },
    );
  if (error) throw error;
}

// ── Block / Unblock ─────────────────────────────────────────────────────────

/**
 * Block a user.
 * Per spec: removes follow relationships in BOTH directions, then inserts a
 * block record so their content is hidden.
 */
export async function blockUser(
  currentUserId: string,
  targetId: string,
): Promise<void> {
  // 1 — Remove follows in both directions (fire-and-forget; both may not exist)
  await supabase
    .from('follows')
    .delete()
    .eq('follower_id', currentUserId)
    .eq('following_id', targetId);

  await supabase
    .from('follows')
    .delete()
    .eq('follower_id', targetId)
    .eq('following_id', currentUserId);

  // 2 — Insert block record
  const { error } = await supabase
    .from('blocks')
    .upsert(
      { blocker_id: currentUserId, blocked_id: targetId },
      { onConflict: 'blocker_id,blocked_id' },
    );
  if (error) throw error;
}

/** Unblock a user. */
export async function unblockUser(
  currentUserId: string,
  targetId: string,
): Promise<void> {
  const { error } = await supabase
    .from('blocks')
    .delete()
    .eq('blocker_id', currentUserId)
    .eq('blocked_id', targetId);
  if (error) throw error;
}

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
