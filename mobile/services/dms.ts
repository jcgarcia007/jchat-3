/**
 * JChat 3.0 — Direct Messages data-access service (Task 1.12)
 *
 * Pure async functions wrapping the shared Supabase client.
 * DB tables (002_social_schema.sql):
 *   dm_conversations(id, user_a, user_b, last_message_at, created_at)
 *   dm_messages(id, conversation_id, sender_id, body, media_url, voice_url, read_at, created_at)
 *
 * All types are co-located here.
 * Every function guards against unconfigured Supabase with isSupabaseConfigured.
 */

import { supabase, isSupabaseConfigured } from './supabase';

// ─── Co-located types ─────────────────────────────────────────────────────────

export interface DmParticipant {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

export interface DmConversationRow {
  id: string;
  user_a: string;
  user_b: string;
  last_message_at: string | null;
  created_at: string;
}

export interface DmMessageRow {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string | null;
  media_url: string | null;
  voice_url: string | null;
  read_at: string | null;
  created_at: string;
}

/** Enriched conversation item for the inbox list. */
export interface ConversationPreview {
  id: string;
  otherUser: DmParticipant;
  lastMessageBody: string | null;
  lastMessageAt: string | null;
  /** Messages sent TO currentUser that have no read_at. */
  unreadCount: number;
}

export interface SendMessageInput {
  conversationId: string;
  senderId: string;
  body?: string;
  mediaUrl?: string;
  voiceUrl?: string;
}

// ─── listConversations ────────────────────────────────────────────────────────

/**
 * Return all conversations for userId, sorted by last_message_at descending.
 * Each item includes the other participant's profile + last-message preview +
 * unread count (messages received by userId with no read_at).
 */
export async function listConversations(
  userId: string,
): Promise<ConversationPreview[]> {
  if (!isSupabaseConfigured) return [];

  // 1 — fetch conversations where userId is user_a or user_b
  const { data: convos, error: convErr } = await supabase
    .from('dm_conversations')
    .select('*')
    .or(`user_a.eq.${userId},user_b.eq.${userId}`)
    .order('last_message_at', { ascending: false, nullsFirst: false });

  if (convErr) throw convErr;
  if (!convos || convos.length === 0) return [];

  const rows = convos as DmConversationRow[];

  // 2 — collect the other participant IDs
  const otherIds = rows.map((c) => (c.user_a === userId ? c.user_b : c.user_a));
  const uniqueOtherIds = [...new Set(otherIds)];

  // 3 — fetch those user profiles (other users → public_profiles view, mig 018)
  const { data: usersData, error: usersErr } = await supabase
    .from('public_profiles')
    .select('id, username, display_name, avatar_url')
    .in('id', uniqueOtherIds);

  if (usersErr) throw usersErr;

  const userMap = new Map<string, DmParticipant>(
    ((usersData ?? []) as DmParticipant[]).map((u) => [u.id, u]),
  );

  // 4 — for each conversation fetch last message + unread count
  const previews: ConversationPreview[] = await Promise.all(
    rows.map(async (c) => {
      const otherId = c.user_a === userId ? c.user_b : c.user_a;
      const otherUser: DmParticipant = userMap.get(otherId) ?? {
        id: otherId,
        username: 'Unknown',
        display_name: null,
        avatar_url: null,
      };

      // Last message
      const { data: lastMsgData } = await supabase
        .from('dm_messages')
        .select('body, created_at')
        .eq('conversation_id', c.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const lastMsg = lastMsgData as { body: string | null; created_at: string } | null;

      // Unread count — messages sent BY the other user that haven't been read
      const { count: unreadCount } = await supabase
        .from('dm_messages')
        .select('id', { count: 'exact', head: true })
        .eq('conversation_id', c.id)
        .eq('sender_id', otherId)
        .is('read_at', null);

      return {
        id: c.id,
        otherUser,
        lastMessageBody: lastMsg?.body ?? null,
        lastMessageAt: c.last_message_at,
        unreadCount: unreadCount ?? 0,
      };
    }),
  );

  return previews;
}

// ─── getOrCreateConversation ──────────────────────────────────────────────────

/**
 * Return an existing conversation between userId and otherUserId, or create one.
 * user_a is always the lexicographically smaller id to avoid duplicates.
 */
export async function getOrCreateConversation(
  userId: string,
  otherUserId: string,
): Promise<DmConversationRow> {
  if (!isSupabaseConfigured) {
    // Demo stub
    return {
      id: `demo-conv-${userId}-${otherUserId}`,
      user_a: userId < otherUserId ? userId : otherUserId,
      user_b: userId < otherUserId ? otherUserId : userId,
      last_message_at: null,
      created_at: new Date().toISOString(),
    };
  }

  const [userA, userB] =
    userId < otherUserId ? [userId, otherUserId] : [otherUserId, userId];

  // Try to find existing
  const { data: existing, error: findErr } = await supabase
    .from('dm_conversations')
    .select('*')
    .eq('user_a', userA)
    .eq('user_b', userB)
    .maybeSingle();

  if (findErr) throw findErr;
  if (existing) return existing as DmConversationRow;

  // Create new
  const { data: created, error: createErr } = await supabase
    .from('dm_conversations')
    .insert({ user_a: userA, user_b: userB })
    .select('*')
    .single();

  if (createErr) throw createErr;
  return created as DmConversationRow;
}

// ─── listMessages ─────────────────────────────────────────────────────────────

/**
 * Return all messages for a conversation, sorted oldest-first (for FlatList
 * rendered in reverse). Caller should pass `inverted` to the FlatList.
 */
export async function listMessages(conversationId: string): Promise<DmMessageRow[]> {
  if (!isSupabaseConfigured) return [];

  const { data, error } = await supabase
    .from('dm_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as DmMessageRow[];
}

// ─── sendMessage ──────────────────────────────────────────────────────────────

/** Insert a new message and bump last_message_at on the conversation. */
export async function sendMessage(input: SendMessageInput): Promise<DmMessageRow> {
  if (!isSupabaseConfigured) {
    // Demo stub
    return {
      id: `demo-msg-${Date.now()}`,
      conversation_id: input.conversationId,
      sender_id: input.senderId,
      body: input.body ?? null,
      media_url: input.mediaUrl ?? null,
      voice_url: input.voiceUrl ?? null,
      read_at: null,
      created_at: new Date().toISOString(),
    };
  }

  const { data, error } = await supabase
    .from('dm_messages')
    .insert({
      conversation_id: input.conversationId,
      sender_id: input.senderId,
      body: input.body ?? null,
      media_url: input.mediaUrl ?? null,
      voice_url: input.voiceUrl ?? null,
    })
    .select('*')
    .single();

  if (error) throw error;

  // Bump last_message_at — fire-and-forget; don't block the return
  supabase
    .from('dm_conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', input.conversationId)
    .then(() => {});

  return data as DmMessageRow;
}

// ─── markRead ────────────────────────────────────────────────────────────────

/**
 * Mark all messages in a conversation that were sent TO userId (i.e. NOT by
 * userId) as read by setting read_at = now().
 *
 * TODO(Task 1.13): respect read-receipts privacy setting before stamping read_at.
 */
export async function markRead(
  conversationId: string,
  userId: string,
): Promise<void> {
  if (!isSupabaseConfigured) return;

  const { error } = await supabase
    .from('dm_messages')
    .update({ read_at: new Date().toISOString() })
    .eq('conversation_id', conversationId)
    .neq('sender_id', userId)
    .is('read_at', null);

  if (error) throw error;
}

// ─── getTotalUnread ───────────────────────────────────────────────────────────

/**
 * Return the total number of unread messages across ALL conversations for
 * userId. Used for the DMs tab badge.
 *
 * TODO(tab-badge): wire the returned count into the BottomTabs tabBarBadge
 * option once React Navigation supports dynamic badges without full re-mount.
 * For now call this from DMStack or BottomTabs context.
 */
export async function getTotalUnread(userId: string): Promise<number> {
  if (!isSupabaseConfigured) return 0;

  // Get conversations the user is part of
  const { data: convos, error: convErr } = await supabase
    .from('dm_conversations')
    .select('id')
    .or(`user_a.eq.${userId},user_b.eq.${userId}`);

  if (convErr) throw convErr;
  if (!convos || convos.length === 0) return 0;

  const convoIds = (convos as { id: string }[]).map((c) => c.id);

  // Count unread messages NOT sent by the user
  const { count, error } = await supabase
    .from('dm_messages')
    .select('id', { count: 'exact', head: true })
    .in('conversation_id', convoIds)
    .neq('sender_id', userId)
    .is('read_at', null);

  if (error) throw error;
  return count ?? 0;
}
