/**
 * JChat 3.0 — Gifts Service (Task 1.17)
 *
 * Pure async functions wrapping the Supabase `gifts` table.
 * Column reference (001_initial_schema.sql):
 *   id, from_user, to_user, room_id, type, amount_cents, message, created_at
 *
 * NOTE: The schema does NOT include a `business_id` or `menu_item_id` column on
 * `gifts`. Those relationships are captured indirectly through `room_id` (rooms
 * belong to a business) and through `type` / `amount_cents` (which encode the
 * gifted item at checkout time). If the schema is later extended with explicit
 * FK columns, update SendGiftInput and the insert payload accordingly.
 *
 * TODO(Task 3.5): wire sendGift() into the checkout flow (GiftOrderType).
 */

import { supabase, isSupabaseConfigured } from './supabase';

// ---------------------------------------------------------------------------
// Co-located types
// ---------------------------------------------------------------------------

/** Shape of a row returned from the `gifts` table. */
export interface GiftRow {
  id: string;
  from_user: string;
  to_user: string;
  room_id: string | null;
  type: string;
  amount_cents: number;
  message: string | null;
  created_at: string;
}

/**
 * Input for sending a gift.
 *
 * `type` is a freeform label (e.g. 'drink', 'beer', 'star', menu item name).
 * `amount_cents` is the monetary value of the gift (0 for non-monetary items).
 * `roomId` links the gift to the business context (room → business).
 *
 * NOTE: `businessId` and `menuItemId` are NOT stored directly on the `gifts`
 * table in the current schema. Pass them here if you need them for display
 * purposes — they can be derived from `roomId` via a join at read time.
 * The insert only persists the columns that exist in the DB.
 */
export interface SendGiftInput {
  /** UUID of the recipient user. */
  recipientId: string;
  /** Type / label of the gift (e.g. 'drink', 'beer', menu item name). */
  type: string;
  /** Value in cents. Use 0 for non-monetary virtual gifts. */
  amountCents: number;
  /** Optional personal message from sender to recipient. */
  message?: string;
  /**
   * Room where the gift was sent from (ties gift to a business context).
   * Optional — may be null for gifts sent outside a room.
   */
  roomId?: string | null;
}

// ---------------------------------------------------------------------------
// sendGift
// ---------------------------------------------------------------------------

/**
 * Insert a new gift record.
 *
 * The currently-authenticated user becomes `from_user` (enforced by RLS).
 * Returns the created GiftRow on success.
 *
 * TODO(server/Edge Function): trigger recipient push notification on gift
 *   insert: "You received a gift at [Business]!" — do NOT call FCM here.
 *
 * NOTE: Gift visibility is controlled by the recipient's privacy setting
 *   (Task 1.13). Actual filtering happens where gifts are displayed —
 *   respect `show_gifts_received` (or equivalent privacy column) before
 *   surfacing gifts on the recipient's public profile.
 */
export async function sendGift(
  input: SendGiftInput,
): Promise<GiftRow> {
  if (!isSupabaseConfigured) {
    return Promise.reject(new Error('Supabase is not configured'));
  }

  const { data, error } = await supabase
    .from('gifts')
    .insert({
      to_user: input.recipientId,
      type: input.type,
      amount_cents: input.amountCents,
      message: input.message ?? null,
      room_id: input.roomId ?? null,
      // `from_user` is derived from auth.uid() server-side via RLS policy
      // (policy: "gifts: authenticated insert" checks auth.uid() = from_user).
      // We pass it explicitly so the insert is valid if RLS is bypassed in tests.
      from_user: (await supabase.auth.getUser()).data.user?.id ?? '',
    })
    .select()
    .single();

  if (error) throw error;
  return data as GiftRow;
}

// ---------------------------------------------------------------------------
// getReceivedGifts
// ---------------------------------------------------------------------------

/**
 * Fetch all gifts received by `userId`, ordered newest-first.
 *
 * Includes a join on `from_user` profile data (username, display_name,
 * avatar_url) so the UI can render sender info without a second query.
 *
 * NOTE: Gift visibility should be gated on the recipient's privacy setting
 *   (Task 1.13) before displaying these on a public-facing profile tab.
 */
export async function getReceivedGifts(userId: string): Promise<GiftWithSender[]> {
  if (!isSupabaseConfigured) return [];

  const { data, error } = await supabase
    .from('gifts')
    .select(`
      id,
      from_user,
      to_user,
      room_id,
      type,
      amount_cents,
      message,
      created_at,
      sender:users!gifts_from_user_fkey (
        id,
        username,
        display_name,
        avatar_url
      ),
      room:rooms!gifts_room_id_fkey (
        id,
        name,
        business:businesses!rooms_business_id_fkey (
          id,
          name,
          slug
        )
      )
    `)
    .eq('to_user', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as unknown as GiftWithSender[];
}

// ---------------------------------------------------------------------------
// getSentGifts
// ---------------------------------------------------------------------------

/**
 * Fetch all gifts sent by `userId`, ordered newest-first.
 */
export async function getSentGifts(userId: string): Promise<GiftWithRecipient[]> {
  if (!isSupabaseConfigured) return [];

  const { data, error } = await supabase
    .from('gifts')
    .select(`
      id,
      from_user,
      to_user,
      room_id,
      type,
      amount_cents,
      message,
      created_at,
      recipient:users!gifts_to_user_fkey (
        id,
        username,
        display_name,
        avatar_url
      ),
      room:rooms!gifts_room_id_fkey (
        id,
        name,
        business:businesses!rooms_business_id_fkey (
          id,
          name,
          slug
        )
      )
    `)
    .eq('from_user', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as unknown as GiftWithRecipient[];
}

// ---------------------------------------------------------------------------
// Extended row types (with joined relations)
// ---------------------------------------------------------------------------

export interface UserStub {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

export interface BusinessStub {
  id: string;
  name: string;
  slug: string;
}

export interface RoomStub {
  id: string;
  name: string;
  business: BusinessStub | null;
}

/** GiftRow enriched with sender profile and room/business context. */
export interface GiftWithSender extends GiftRow {
  sender: UserStub | null;
  room: RoomStub | null;
}

/** GiftRow enriched with recipient profile and room/business context. */
export interface GiftWithRecipient extends GiftRow {
  recipient: UserStub | null;
  room: RoomStub | null;
}
