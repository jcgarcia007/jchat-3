/**
 * JChat 3.0 — Map Reactions service (Task 2.18)
 *
 * Pure async functions + Realtime helpers for the `map_reactions` table.
 * Schema (004_stage2_schema.sql):
 *   map_reactions(id, business_id, room_id, user_id, emoji, created_at)
 *   — Realtime enabled on this table.
 *
 * STAGE 4 NOTE:
 *   subscribeMapReactions is already wired for Realtime; Stage 4 will call it
 *   from the Map tab to float emoji animations over business pins.
 *   // TODO(Stage 4): consume subscribeMapReactions in MapScreen to drive float animations
 *
 * // TODO(i18n)
 */

import { supabase, isSupabaseConfigured } from './supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

// ── Co-located types ────────────────────────────────────────────────────────

/** Mirrors the `map_reactions` table columns from 004_stage2_schema.sql */
export interface MapReactionRow {
  id: string;
  business_id: string;
  room_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
}

/** Parameters accepted by sendMapReaction(). */
export interface SendMapReactionParams {
  businessId: string;
  roomId: string;
  emoji: string;
}

/** Payload broadcast on the Realtime channel for each reaction. */
export interface MapReactionBroadcastPayload {
  emoji: string;
  userId: string;
  businessId: string;
  roomId: string;
  sentAt: string; // ISO timestamp
}

// ── sendMapReaction ──────────────────────────────────────────────────────────

/**
 * Insert a reaction row into `map_reactions` AND broadcast the emoji on the
 * Supabase Realtime channel for the given room.
 *
 * Guards:
 *   - Returns early (no-op) when `isSupabaseConfigured` is false.
 *   - Requires an authenticated session; returns an error when none is found.
 *
 * Realtime broadcast uses the `emoji` event on channel `room:{roomId}`.
 * Subscribers (see `subscribeMapReactions`) listen for this event.
 *
 * // TODO(Stage 4): the Map tab will call subscribeMapReactions to receive
 *   broadcasts and play the float animation over the business pin.
 *
 * @returns `{ ok: true }` on success, or `{ ok: false; error: string }` on failure.
 */
export async function sendMapReaction(
  params: SendMapReactionParams,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isSupabaseConfigured) {
    return { ok: false, error: 'Supabase not configured' };
  }

  const { businessId, roomId, emoji } = params;

  // Resolve authenticated user id from the current session.
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, error: authError?.message ?? 'Not authenticated' };
  }

  const userId = user.id;
  const sentAt = new Date().toISOString();

  // ── 1. Persist to DB ────────────────────────────────────────────────────
  const { error: insertError } = await supabase.from('map_reactions').insert({
    business_id: businessId,
    room_id: roomId,
    user_id: userId,
    emoji,
  });

  if (insertError) {
    return { ok: false, error: insertError.message };
  }

  // ── 2. Broadcast on Realtime channel ────────────────────────────────────
  // Channel name is `room:{roomId}` — consistent with subscribeMapReactions.
  // We create a short-lived channel here just for the send; subscriptions use
  // their own persistent channel instances (see subscribeMapReactions).
  const channelName = `room:${roomId}`;
  const broadcastChannel = supabase.channel(channelName);

  const broadcastPayload: MapReactionBroadcastPayload = {
    emoji,
    userId,
    businessId,
    roomId,
    sentAt,
  };

  await broadcastChannel.send({
    type: 'broadcast',
    event: 'emoji',
    payload: broadcastPayload,
  });

  // Clean up the ephemeral send channel.
  await supabase.removeChannel(broadcastChannel);

  return { ok: true };
}

// ── subscribeMapReactions ────────────────────────────────────────────────────

/**
 * Subscribe to live emoji reactions for a specific room via Supabase Realtime.
 *
 * The callback receives each `MapReactionBroadcastPayload` as it arrives.
 * Returns an `unsubscribe` function — callers MUST invoke it on unmount to
 * prevent channel leaks (see JChat CLAUDE.md: "unsubscribe al desmontar").
 *
 * Usage (inside a React component):
 *
 *   useEffect(() => {
 *     const unsub = subscribeMapReactions(roomId, (payload) => {
 *       // e.g. trigger float animation for payload.emoji
 *     });
 *     return () => unsub();
 *   }, [roomId]);
 *
 * // TODO(Stage 4): call this from MapScreen/HeatmapLayer to float emoji
 *   animations over business pins:
 *   animation spec → translateY(-30px), opacity 0, scale 1.3, duration 3s ease-out
 *
 * @param roomId  The UUID of the room to listen on.
 * @param cb      Called with each incoming reaction payload.
 * @returns       Unsubscribe function — call on component unmount.
 */
export function subscribeMapReactions(
  roomId: string,
  cb: (payload: MapReactionBroadcastPayload) => void,
): () => void {
  if (!isSupabaseConfigured) {
    // Nothing to subscribe; return a no-op unsubscribe.
    return () => {};
  }

  const channelName = `room:${roomId}`;

  const channel: RealtimeChannel = supabase
    .channel(channelName)
    .on(
      'broadcast',
      { event: 'emoji' },
      ({ payload }: { payload: MapReactionBroadcastPayload }) => {
        cb(payload);
      },
    )
    .subscribe();

  return () => {
    // Clean up: unsubscribe and remove the channel from the client registry.
    supabase.removeChannel(channel);
  };
}
