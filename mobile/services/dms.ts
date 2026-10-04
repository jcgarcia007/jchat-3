/**
 * JChat 3.0 — Direct Messages data-access service (Task 1.12)
 *
 * Pure async functions wrapping the shared Supabase client.
 * DB tables (002_social_schema.sql):
 *   dm_conversations(id, user_a, user_b, last_message_at, created_at,
 *                    hidden_at_a, hidden_at_b)
 *   dm_messages(id, conversation_id, sender_id, body, media_url, voice_url, voice_duration_s, read_at, created_at)
 *
 * All types are co-located here.
 * Every function guards against unconfigured Supabase with isSupabaseConfigured.
 */

import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { supabase, isSupabaseConfigured } from './supabase';
import i18n from '../i18n';

// ─── DM gate error ─────────────────────────────────────────────────────────────

/** Error thrown when the DM gate (start_dm RPC) blocks the conversation. */
export class DmGateError extends Error {
  constructor(
    public readonly reason: 'blocked' | 'nobody' | 'not_follower',
    message: string,
  ) {
    super(message);
    this.name = 'DmGateError';
  }
}

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
  hidden_at_a: string | null;
  hidden_at_b: string | null;
  /** Non-null while this is an ephemeral Match chat (the venue it lives in). */
  ephemeral_business_id?: string | null;
}

export interface DmMessageRow {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string | null;
  media_url: string | null;
  /** dm-media storage PATH of a voice note (never a URL / file://). */
  voice_url: string | null;
  /** Length of the voice note in seconds (1–60). */
  voice_duration_s: number | null;
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
  /** Venue name when this is an ephemeral Match chat (list shows "Match · {name}"), else null. */
  matchBusinessName?: string | null;
}

export interface SendMessageInput {
  conversationId: string;
  senderId: string;
  body?: string;
  mediaUrl?: string;
  /** dm-media storage PATH of the voice note. */
  voiceUrl?: string;
  /** Voice note length in seconds (1–60). */
  voiceDurationSeconds?: number;
}

type DmUnreadInvalidationListener = () => void;

const dmUnreadInvalidationListeners = new Set<DmUnreadInvalidationListener>();

/** Subscribe to local changes that can affect the current user's DM badge. */
export function subscribeToDmUnreadInvalidation(
  listener: DmUnreadInvalidationListener,
): () => void {
  dmUnreadInvalidationListeners.add(listener);
  return () => { dmUnreadInvalidationListeners.delete(listener); };
}

function emitDmUnreadInvalidation(): void {
  dmUnreadInvalidationListeners.forEach((listener) => listener());
}

function hiddenAtForUser(conversation: DmConversationRow, userId: string): string | null {
  return conversation.user_a === userId
    ? conversation.hidden_at_a
    : conversation.hidden_at_b;
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
    .select('id, user_a, user_b, last_message_at, created_at, hidden_at_a, hidden_at_b, ephemeral_business_id')
    .or(`user_a.eq.${userId},user_b.eq.${userId}`)
    .order('last_message_at', { ascending: false, nullsFirst: false });

  if (convErr) throw convErr;
  if (!convos || convos.length === 0) return [];

  const rows = (convos as DmConversationRow[]).filter((conversation) => {
    const hiddenAt = hiddenAtForUser(conversation, userId);
    return hiddenAt === null
      || (conversation.last_message_at !== null && conversation.last_message_at > hiddenAt);
  });
  if (rows.length === 0) return [];

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

  // Venue names for ephemeral Match chats (best effort: the tag falls back to plain "Match").
  const venueIds = [...new Set(rows.map((r) => r.ephemeral_business_id).filter((id): id is string => !!id))];
  const venueNames = new Map<string, string>();
  if (venueIds.length > 0) {
    const { data: venues } = await supabase.from('businesses').select('id, name').in('id', venueIds);
    for (const v of (venues ?? []) as { id: string; name: string }[]) venueNames.set(v.id, v.name);
  }

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
      const hiddenAt = hiddenAtForUser(c, userId);
      let lastMessageQuery = supabase
        .from('dm_messages')
        .select('body, created_at')
        .eq('conversation_id', c.id)
        .order('created_at', { ascending: false })
        .limit(1);
      if (hiddenAt) lastMessageQuery = lastMessageQuery.gt('created_at', hiddenAt);
      const { data: lastMsgRows } = await lastMessageQuery;

      const lastMsg = (lastMsgRows?.[0] ?? null) as {
        body: string | null;
        created_at: string;
      } | null;

      // Unread count — messages sent BY the other user that haven't been read
      let unreadQuery = supabase
        .from('dm_messages')
        .select('id', { count: 'exact', head: true })
        .eq('conversation_id', c.id)
        .eq('sender_id', otherId)
        .is('read_at', null);
      if (hiddenAt) unreadQuery = unreadQuery.gt('created_at', hiddenAt);
      const { count: unreadCount } = await unreadQuery;

      return {
        id: c.id,
        otherUser,
        lastMessageBody: lastMsg?.body ?? null,
        lastMessageAt: lastMsg?.created_at ?? c.last_message_at,
        unreadCount: unreadCount ?? 0,
        matchBusinessName: c.ephemeral_business_id ? (venueNames.get(c.ephemeral_business_id) ?? '') : null,
      };
    }),
  );

  return previews;
}

// ─── getOrCreateConversation ──────────────────────────────────────────────────

/**
 * Return an existing conversation with otherUserId, or create one — via the
 * start_dm RPC (Fase D). The RPC enforces the gate server-side: block check +
 * the target's whoCanDMMe setting (everyone / followers / nobody). Direct
 * INSERTs into dm_conversations are denied by RLS (deny-by-default), so this
 * RPC is the only path. On a gated failure it throws DmGateError with a reason.
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
      hidden_at_a: null,
      hidden_at_b: null,
    };
  }

  const { data, error } = await supabase.rpc('start_dm', {
    p_target_id: otherUserId,
  });

  if (error) {
    // Map the RPC's Postgres error codes to friendly, actionable messages.
    if (error.code === 'P0002') {
      throw new DmGateError('blocked', i18n.t('chat:dmGate.blocked'));
    }
    if (error.code === 'P0003') {
      throw new DmGateError('nobody', i18n.t('chat:dmGate.nobody'));
    }
    if (error.code === 'P0004') {
      throw new DmGateError('not_follower', i18n.t('chat:dmGate.notFollower'));
    }
    throw error;
  }

  return data as DmConversationRow;
}

// ─── listMessages ─────────────────────────────────────────────────────────────

/**
 * Return all messages for a conversation, sorted oldest-first (for FlatList
 * rendered in reverse). Caller should pass `inverted` to the FlatList.
 */
export async function listMessages(
  conversationId: string,
  userId: string,
): Promise<DmMessageRow[]> {
  if (!isSupabaseConfigured) return [];

  const { data: conversationData, error: conversationError } = await supabase
    .from('dm_conversations')
    .select('id, user_a, user_b, last_message_at, created_at, hidden_at_a, hidden_at_b')
    .eq('id', conversationId)
    .single();

  if (conversationError) throw conversationError;
  const conversation = conversationData as DmConversationRow;
  const hiddenAt = hiddenAtForUser(conversation, userId);

  let messagesQuery = supabase
    .from('dm_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false });
  if (hiddenAt) messagesQuery = messagesQuery.gt('created_at', hiddenAt);
  const { data, error } = await messagesQuery;

  if (error) throw error;
  return (data ?? []) as DmMessageRow[];
}

// ─── hideConversation ─────────────────────────────────────────────────────────

/** Hide a conversation only for the authenticated participant. */
export async function hideConversation(conversationId: string): Promise<void> {
  if (!isSupabaseConfigured) {
    emitDmUnreadInvalidation();
    return;
  }

  const { error } = await supabase.rpc('hide_dm_conversation', {
    p_conversation_id: conversationId,
  });
  if (error) throw error;
  emitDmUnreadInvalidation();
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
      voice_duration_s: input.voiceDurationSeconds ?? null,
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
      voice_duration_s: input.voiceDurationSeconds ?? null,
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

// ─── DM media (private dm-media bucket, Fase D) ────────────────────────────────

/**
 * Upload a DM photo to the PRIVATE `dm-media` bucket. Returns the storage PATH
 * (not a URL) — the path is stored in dm_messages.media_url and resolved to a
 * short-lived signed URL on read (resolveDmMediaUrl). Path pattern enforced by
 * Storage RLS: {conversation_id}/{sender_uid}/{file}. In demo mode returns the
 * local uri unchanged so the UI still works.
 *
 * Reads the file as base64 → ArrayBuffer (React Native / Hermes can't build a
 * Blob from fetch()), matching services/storage.ts.
 */
export async function uploadDmPhoto(
  conversationId: string,
  userId: string,
  localUri: string,
): Promise<string> {
  if (!isSupabaseConfigured) return localUri;
  const base64 = await FileSystem.readAsStringAsync(localUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const arrayBuffer = decode(base64);
  const rand = Math.random().toString(36).slice(2, 8);
  const path = `${conversationId}/${userId}/${Date.now()}_${rand}.jpg`;
  const { error } = await supabase.storage
    .from('dm-media')
    .upload(path, arrayBuffer, { contentType: 'image/jpeg', upsert: false });
  if (error) throw error;
  return path;
}

/**
 * Resolve a display URL for a dm_messages.media_url. dm-media is private, so a
 * stored PATH (no URI scheme) gets a signed URL (1h). Anything already carrying
 * a scheme (http/https/file/content — legacy or demo local uris) is returned
 * as-is for backward compatibility.
 */
export async function resolveDmMediaUrl(mediaUrl: string): Promise<string> {
  if (/^(https?|file|content|data):/i.test(mediaUrl)) return mediaUrl;
  if (!isSupabaseConfigured) return mediaUrl;
  const { data, error } = await supabase.storage
    .from('dm-media')
    .createSignedUrl(mediaUrl, 3600);
  if (error) throw error;
  return data.signedUrl;
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
    .select('id, user_a, user_b, last_message_at, created_at, hidden_at_a, hidden_at_b')
    .or(`user_a.eq.${userId},user_b.eq.${userId}`);

  if (convErr) throw convErr;
  if (!convos || convos.length === 0) return 0;

  const counts = await Promise.all((convos as DmConversationRow[]).map(async (conversation) => {
    const hiddenAt = hiddenAtForUser(conversation, userId);
    if (hiddenAt && (
      conversation.last_message_at === null
      || conversation.last_message_at <= hiddenAt
    )) return 0;

    let unreadQuery = supabase
      .from('dm_messages')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', conversation.id)
      .neq('sender_id', userId)
      .is('read_at', null);
    if (hiddenAt) unreadQuery = unreadQuery.gt('created_at', hiddenAt);
    const { count, error } = await unreadQuery;
    if (error) throw error;
    return count ?? 0;
  }));

  return counts.reduce((total, count) => total + count, 0);
}
