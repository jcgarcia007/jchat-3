/**
 * JChat 3.0 — Gift offers (migration 202)
 *
 * A person present at a venue sends another present person a gift (items from the venue's menu). The
 * sender's card is only HELD when the offer is sent; it is charged only if the recipient accepts
 * (payments/gift_hold → manual capture → gift-worker). This module wraps the RPCs; the SERVER decides
 * availability, prices and every state change. The recipient never receives a price; the sender never
 * receives the table.
 */

import { supabase, isSupabaseConfigured } from './supabase';

export type GiftStatus = 'draft' | 'awaiting_payment' | 'held' | 'accepted' | 'paid' | 'declined' | 'expired' | 'cancelled' | 'failed';

export interface GiftItemInput {
  menu_item_id: string;
  qty: number;
}

export interface GiftViewItem {
  menu_item_id: string;
  name: string;
  description: string | null;
  qty: number;
  id_required: boolean;
}

export interface GiftPerson {
  id: string;
  name: string;
  avatar_url: string | null;
}

/** What gift_offer_view returns: no price for the recipient, no table for the sender. */
export interface GiftView {
  id: string;
  business_id: string;
  status: GiftStatus;
  is_sender: boolean;
  from: GiftPerson;
  to: GiftPerson;
  items: GiftViewItem[];
  item_count: number;
  note: string | null;
  expires_at: string | null;
  table_label: string | null;
  total_cents: number | null;
  order_id: string | null;
}

export type GiftErrorCode =
  | 'gift_unavailable'
  | 'invalid_items'
  | 'gift_rate_limit'
  | 'gift_pending'
  | 'not_your_gift'
  | 'gift_not_open'
  | 'gift_expired'
  | 'not_in_venue'
  | 'table_required'
  | 'gift_retry_later';

const KNOWN: readonly GiftErrorCode[] = [
  'gift_unavailable',
  'invalid_items',
  'gift_rate_limit',
  'gift_pending',
  'not_your_gift',
  'gift_not_open',
  'gift_expired',
  'not_in_venue',
  'table_required',
  'gift_retry_later',
];

/** The known gift error code carried by a thrown Supabase error (or a plain code string), or null. */
export function giftErrorCode(err: unknown): GiftErrorCode | null {
  const text = typeof err === 'string' ? err : String((err as { message?: unknown } | null)?.message ?? '');
  return KNOWN.find((c) => text.includes(c)) ?? null;
}

/** Both people are present at the venue and neither blocked the other (server verdict). Fails closed. */
export async function giftAvailable(businessId: string, otherUserId: string): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  const { data, error } = await supabase.rpc('gift_available' as never, {
    p_business_id: businessId,
    p_other_user_id: otherUserId,
  } as never);
  return !error && data === true;
}

export async function createGiftOffer(args: {
  businessId: string;
  toUserId: string;
  items: GiftItemInput[];
  note?: string;
  conversationId?: string | null;
}): Promise<{ id: string; subtotal_cents: number }> {
  const { data, error } = await supabase.rpc('gift_offer_create' as never, {
    p_business_id: args.businessId,
    p_to_user_id: args.toUserId,
    p_items: args.items,
    p_note: args.note?.trim() || null,
    p_conversation_id: args.conversationId ?? null,
  } as never);
  if (error) throw error;
  const r = data as { id?: string; subtotal_cents?: number } | null;
  if (!r?.id) throw new Error('gift_unavailable');
  return { id: r.id, subtotal_cents: r.subtotal_cents ?? 0 };
}

export async function viewGiftOffer(offerId: string): Promise<GiftView | null> {
  const { data, error } = await supabase.rpc('gift_offer_view' as never, { p_offer_id: offerId } as never);
  if (error || !data) return null;
  return data as unknown as GiftView;
}

/**
 * Cancels MY offer while it has not reached the other person yet (draft / awaiting_payment): used when the payment sheet
 * is closed or cancelled without paying, so "you already have a gift waiting" does not block the next try for 30 minutes
 * (migration 208). Never throws: if it fails the server's own 30-minute cleanup still applies.
 */
export async function cancelGiftOffer(offerId: string): Promise<void> {
  try {
    await supabase.rpc('gift_offer_cancel' as never, { p_offer_id: offerId } as never);
  } catch {
    // silent by design
  }
}

/** Accept (with the table) or decline. Errors: not_your_gift, gift_not_open, gift_expired, not_in_venue, table_required. */
export async function respondGiftOffer(
  offerId: string,
  accept: boolean,
  tableLabel?: string,
  tableDetails?: string,
): Promise<'accepted' | 'declined'> {
  const { data, error } = await supabase.rpc('gift_offer_respond' as never, {
    p_offer_id: offerId,
    p_accept: accept,
    p_table_label: tableLabel?.trim() || null,
    p_table_details: tableDetails?.trim() || null,
  } as never);
  if (error) throw error;
  return (data as { status?: string } | null)?.status === 'accepted' ? 'accepted' : 'declined';
}

/** Photos of the gifted items (the offer snapshot does not carry them). */
export async function giftItemPhotos(menuItemIds: string[]): Promise<Record<string, string>> {
  if (!isSupabaseConfigured || menuItemIds.length === 0) return {};
  const { data } = await supabase.from('menu_items').select('id, image_url, photo_url').in('id', menuItemIds);
  const out: Record<string, string> = {};
  for (const row of (data ?? []) as { id: string; image_url: string | null; photo_url: string | null }[]) {
    const url = row.image_url ?? row.photo_url;
    if (url) out[row.id] = url;
  }
  return out;
}
