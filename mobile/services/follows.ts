/**
 * JChat 3.0 — Follow / follow-request data-access (Social Fase A+B, sub-parte 2).
 *
 * RPC-backed (migration 040_social_privacy_base): request_or_follow,
 * accept_follow_request and remove_follower run SECURITY DEFINER server-side
 * (they enforce block checks, public/private branching, and cross-user inserts
 * the plain RLS can't allow). reject/cancel/list go through RLS-guarded table
 * access. Basic followUser/unfollowUser/isFollowing/counts stay in users.ts.
 *
 * USER DISCOVERY NOTE: there is NO global user search (spec). Users surface only
 * from room member lists and existing relationships — these list helpers operate
 * on ids the caller already holds.
 */

import { supabase } from './supabase';

export interface SocialUser {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  is_verified?: boolean;
}

export interface PendingRequest {
  requester_id: string;
  created_at: string;
  requester: SocialUser | null;
}

/** Result of request_or_follow: a direct follow (public) or a pending request (private). */
export type FollowResult = 'following' | 'requested';

/** Current user's id from the cached session (no network round-trip). */
async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

/** Fetch non-sensitive profiles for a set of ids via the public_profiles view (mig 018). */
async function fetchProfiles(ids: string[]): Promise<Map<string, SocialUser>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const { data, error } = await supabase
    .from('public_profiles')
    .select('id, username, display_name, avatar_url, is_verified')
    .in('id', unique);
  if (error) throw error;
  return new Map(((data ?? []) as SocialUser[]).map((u) => [u.id, u]));
}

// ── Follow / request ─────────────────────────────────────────────────────────

/**
 * Follow a user. The server decides: public target → direct follow ('following');
 * private target → pending follow request ('requested'). Raises if blocked.
 */
export async function requestOrFollow(targetId: string): Promise<FollowResult> {
  const { data, error } = await supabase.rpc('request_or_follow', { p_target: targetId });
  if (error) throw error;
  return (data as FollowResult) ?? 'requested';
}

/** Accept a pending request FROM requesterId (I am the target). Creates the follows edge. */
export async function acceptRequest(requesterId: string): Promise<void> {
  const { error } = await supabase.rpc('accept_follow_request', { p_requester: requesterId });
  if (error) throw error;
}

/** Reject a pending request FROM requesterId (RLS scopes to target_id = auth.uid()). */
export async function rejectRequest(requesterId: string): Promise<void> {
  const { error } = await supabase
    .from('follow_requests')
    .update({ status: 'rejected' })
    .eq('requester_id', requesterId)
    .eq('status', 'pending');
  if (error) throw error;
}

/** Cancel a request I sent to targetId (RLS scopes to requester_id = auth.uid()). */
export async function cancelRequest(targetId: string): Promise<void> {
  const { error } = await supabase
    .from('follow_requests')
    .delete()
    .eq('target_id', targetId);
  if (error) throw error;
}

/** Remove a follower (someone who follows me). RPC deletes the edge where following = me. */
export async function removeFollower(followerId: string): Promise<void> {
  const { error } = await supabase.rpc('remove_follower', { p_follower: followerId });
  if (error) throw error;
}

// ── Lists ────────────────────────────────────────────────────────────────────

/** Pending follow requests addressed to the current user (newest first). */
export async function listPendingRequests(): Promise<PendingRequest[]> {
  const me = await currentUserId();
  if (!me) return [];
  const { data, error } = await supabase
    .from('follow_requests')
    .select('requester_id, created_at')
    .eq('target_id', me)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as { requester_id: string; created_at: string }[];
  const profiles = await fetchProfiles(rows.map((r) => r.requester_id));
  return rows.map((r) => ({
    requester_id: r.requester_id,
    created_at: r.created_at,
    requester: profiles.get(r.requester_id) ?? null,
  }));
}

/** Followers of userId. RLS (follows_read + can_view_profile) already gates visibility. */
export async function listFollowers(userId: string): Promise<SocialUser[]> {
  const { data, error } = await supabase
    .from('follows')
    .select('follower_id, created_at')
    .eq('following_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  const ids = ((data ?? []) as { follower_id: string }[]).map((r) => r.follower_id);
  const profiles = await fetchProfiles(ids);
  return ids.map((id) => profiles.get(id)).filter((u): u is SocialUser => !!u);
}

/** Accounts userId is following. */
export async function listFollowing(userId: string): Promise<SocialUser[]> {
  const { data, error } = await supabase
    .from('follows')
    .select('following_id, created_at')
    .eq('follower_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  const ids = ((data ?? []) as { following_id: string }[]).map((r) => r.following_id);
  const profiles = await fetchProfiles(ids);
  return ids.map((id) => profiles.get(id)).filter((u): u is SocialUser => !!u);
}
