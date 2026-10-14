/**
 * JChat 3.0 — pure helpers of "claim the order the web menu sheet just placed" (RPC claim_embedded_order,
 * migration 232). The framed menu orders as a guest; the signed-in app proves it owns the order with the guest
 * tracking code it received from the menu, and the order becomes the user's (My orders, tracking, notifications).
 *
 * Nothing here logs: the order id and the tracking code are credentials of the order.
 */

import type { OrderPlacedInfo } from './menuSheetMessage';

export interface ClaimArgs {
  /** null when the menu could not know the id (a card payment: the order is created by the webhook AFTER the pay response). */
  p_order_id: string | null;
  p_tracking_code: string;
  p_room_id: string | null;
}

/**
 * The RPC arguments, or null when there is no guest tracking code (e.g. a tab order has none): the code is the proof of
 * possession, the id is optional. NOTE: migration 232 as applied REQUIRES p_order_id (invalid_claim without it) and the
 * menu cannot know the id of a card-paid order (guest-pay returns only the code; the order is created later by the
 * webhook, and guest_order_view never returns the id) — so until the RPC also accepts a null id (resolve by the unique
 * tracking code), the claim of a real card payment is refused and the sheet shows the "could not link" notice.
 */
export function buildClaimArgs(info: OrderPlacedInfo, roomId: string | null | undefined): ClaimArgs | null {
  if (!info.trackingCode) return null;
  return { p_order_id: info.orderId ?? null, p_tracking_code: info.trackingCode, p_room_id: roomId ?? null };
}

export type ClaimErrorKind = 'not_authenticated' | 'claim_not_allowed' | 'invalid_claim' | 'error';

/** Maps a PostgREST error from claim_embedded_order to a stable kind (by SQLSTATE, then by message). */
export function claimErrorKind(error: { code?: string | null; message?: string | null } | null | undefined): ClaimErrorKind {
  const code = error?.code ?? '';
  const message = error?.message ?? '';
  if (code === '28000' || /not_authenticated/.test(message)) return 'not_authenticated';
  if (code === '42501' || /claim_not_allowed/.test(message)) return 'claim_not_allowed';
  if (code === '22023' || /invalid_claim/.test(message)) return 'invalid_claim';
  return 'error';
}
