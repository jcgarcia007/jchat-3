/**
 * JChat 3.0 — the `order_placed` message the embedded menu (/m/<slug>?embed=1) sends to the app that frames it.
 *
 *   { type: 'jchat:menu', event: 'order_placed', orderId?: <uuid>, trackingCode?: <code> }
 *
 * The iframe has no session of the app, so a paid order is created as a guest (user_id NULL). The app proves it owns
 * the order by sending back the guest tracking code the menu just received (RPC claim_embedded_order), so the order
 * shows in "My orders" and the status notifications reach the person. Both fields are optional and only included
 * when they have the exact expected shape; the message goes ONLY to the already validated parent origin (never '*')
 * and neither value is ever logged. Outside embed mode nothing is sent at all (see MenuPageClient).
 */

import { MENU_MESSAGE_TYPE } from "./embedTableContext";

export interface OrderPlacedInfo {
  orderId?: string | null;
  trackingCode?: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// guest tracking codes are unguessable (>= 20 chars, migration 210 / guest-pay): url-safe characters only.
const CODE_RE = /^[A-Za-z0-9_-]{16,128}$/;

export interface OrderPlacedMessage {
  type: string;
  event: "order_placed";
  orderId?: string;
  trackingCode?: string;
}

export function buildOrderPlacedMessage(info?: OrderPlacedInfo | null): OrderPlacedMessage {
  const message: OrderPlacedMessage = { type: MENU_MESSAGE_TYPE, event: "order_placed" };
  if (info && typeof info.orderId === "string" && UUID_RE.test(info.orderId)) message.orderId = info.orderId;
  if (info && typeof info.trackingCode === "string" && CODE_RE.test(info.trackingCode)) message.trackingCode = info.trackingCode;
  return message;
}
