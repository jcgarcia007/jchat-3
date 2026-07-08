/**
 * JChat 3.0 — Block data-access (Social Fase A+B, sub-parte 2).
 *
 * block_user / unblock_user are RPCs (migration 040) that run SECURITY DEFINER:
 * block_user is atomic — it inserts the block AND removes follow edges in BOTH
 * directions AND clears any pending follow_requests between the pair. Blocking is
 * SOFT: it cuts the relationship and hides content, but DMs keep their history and
 * reappear on unblock (decision D-13). listBlocked/isBlocked read the caller's own
 * block rows (RLS blocks_own).
 */

import { supabase } from './supabase';
import type { SocialUser } from './follows';

/** Block a user: cuts follows (both ways) + pending requests, then hides content. */
export async function blockUser(targetId: string): Promise<void> {
  const { error } = await supabase.rpc('block_user', { p_target: targetId });
  if (error) throw error;
}

/** Unblock a user (does not restore prior follow edges — re-follow if desired). */
export async function unblockUser(targetId: string): Promise<void> {
  const { error } = await supabase.rpc('unblock_user', { p_target: targetId });
  if (error) throw error;
}

/** Users the current user has blocked (newest first). */
export async function listBlocked(): Promise<SocialUser[]> {
  const { data, error } = await supabase
    .from('blocks')
    .select('blocked_id, created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  const ids = ((data ?? []) as { blocked_id: string }[]).map((r) => r.blocked_id);
  if (ids.length === 0) return [];
  const { data: profs, error: pErr } = await supabase
    .from('public_profiles')
    .select('id, username, display_name, avatar_url, is_verified')
    .in('id', ids);
  if (pErr) throw pErr;
  const map = new Map(((profs ?? []) as SocialUser[]).map((u) => [u.id, u]));
  return ids.map((id) => map.get(id)).filter((u): u is SocialUser => !!u);
}

/** Whether the current user has blocked targetId (own block rows only, per RLS). */
export async function isBlocked(targetId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('blocks')
    .select('id')
    .eq('blocked_id', targetId)
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}
