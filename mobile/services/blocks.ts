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

// ── Block change notifications ───────────────────────────────────────────────
// The server already hides a blocked person's DM conversation (RLS), but lists that stay mounted (the Messages tab) keep
// what they loaded. Every block/unblock goes through this module, so it tells the open lists right after the RPC succeeds.

export interface BlockChange {
  userId: string;
  blocked: boolean;
}

const blockListeners = new Set<(change: BlockChange) => void>();

/** Subscribe to successful block/unblock actions made from this device. Returns the unsubscribe function. */
export function subscribeBlockChanges(listener: (change: BlockChange) => void): () => void {
  blockListeners.add(listener);
  return () => { blockListeners.delete(listener); };
}

function emitBlockChange(change: BlockChange): void {
  for (const listener of [...blockListeners]) {
    try {
      listener(change);
    } catch (error) {
      console.warn('[blocks] listener failed:', error);
    }
  }
}

/** Block a user: cuts follows (both ways) + pending requests, then hides content. */
export async function blockUser(targetId: string): Promise<void> {
  const { error } = await supabase.rpc('block_user', { p_target: targetId });
  if (error) throw error;
  emitBlockChange({ userId: targetId, blocked: true });
}

/** Unblock a user (does not restore prior follow edges — re-follow if desired). */
export async function unblockUser(targetId: string): Promise<void> {
  const { error } = await supabase.rpc('unblock_user', { p_target: targetId });
  if (error) throw error;
  emitBlockChange({ userId: targetId, blocked: false });
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

/**
 * Ids of every user related to me by a block, in EITHER direction (I blocked them, or they
 * blocked me). Single RPC (migration 179: my_block_relations); the blocks table itself only
 * exposes the rows I created. Used to hide their content in shared spaces such as chat rooms.
 */
export async function getBlockRelations(): Promise<Set<string>> {
  const { data, error } = await supabase.rpc('my_block_relations');
  if (error) throw error;
  return new Set(((data ?? []) as unknown[]).filter((id): id is string => typeof id === 'string'));
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
