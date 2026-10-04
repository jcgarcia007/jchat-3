/**
 * JChat 3.0 — Ephemeral Match chat metadata (Fase D5)
 *
 * A Match chat is a normal DM (dm_conversations / dm_messages) flagged with
 * `ephemeral_business_id` while it only exists inside the venue. The first message sets
 * `first_sender_id` + `awaiting_reply`: the server then rejects a second message from the first
 * sender ('awaiting_reply') until the other person answers. A mutual follow clears the
 * ephemeral flag automatically (the chat becomes a permanent DM).
 */

import { supabase, isSupabaseConfigured } from './supabase';

export interface ChatMeta {
  otherUserId: string;
  otherName: string | null;
  /** Non-null while the chat is ephemeral (Match). */
  ephemeralBusinessId: string | null;
  businessName: string | null;
  firstSenderId: string | null;
  awaitingReply: boolean;
}

export async function getChatMeta(conversationId: string, myId: string): Promise<ChatMeta | null> {
  if (!isSupabaseConfigured) return null;
  const { data, error } = await supabase
    .from('dm_conversations')
    .select('user_a, user_b, ephemeral_business_id, first_sender_id, awaiting_reply')
    .eq('id', conversationId)
    .maybeSingle();
  if (error || !data) return null;

  const otherUserId = data.user_a === myId ? (data.user_b as string) : (data.user_a as string);
  const ephemeralBusinessId = (data.ephemeral_business_id as string | null) ?? null;

  const [business, profile] = await Promise.all([
    ephemeralBusinessId
      ? supabase.from('businesses').select('name').eq('id', ephemeralBusinessId).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('public_profiles').select('display_name, username').eq('id', otherUserId).maybeSingle(),
  ]);

  const display = (profile.data?.display_name as string | null | undefined)?.trim();
  const username = profile.data?.username as string | null | undefined;
  return {
    otherUserId,
    otherName: display || (username ? `@${username}` : null),
    ephemeralBusinessId,
    businessName: (business.data?.name as string | null | undefined) ?? null,
    firstSenderId: (data.first_sender_id as string | null) ?? null,
    awaitingReply: data.awaiting_reply === true,
  };
}

/** The server refused a second message before the other person replied. */
export function isAwaitingReplyError(err: unknown): boolean {
  const e = err as { message?: unknown } | null;
  return typeof e?.message === 'string' && e.message.includes('awaiting_reply');
}
