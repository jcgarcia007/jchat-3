/**
 * JChat 3.0 — messages from the embedded menu (the iframe in the menu sheet) (pure).
 * The menu posts `{ type: 'jchat:menu', event: 'order_placed' }` (an order was placed) or `{ ..., event: 'ready' }` (it
 * is listening: the app answers with the table context, utils/menuTableMessage) to its parent (web/app/m/[slug]/MenuPageClient.tsx).
 * Everything else is ignored: only a message whose `origin` is EXACTLY the menu's own origin counts, and only that shape.
 */

export type MenuSheetEvent = 'order_placed' | 'ready';

export function parseMenuSheetMessage(message: { origin: string; data: unknown }, allowedOrigin: string): MenuSheetEvent | null {
  if (message.origin !== allowedOrigin) return null;
  const data = message.data;
  if (!data || typeof data !== 'object') return null;
  const { type, event } = data as { type?: unknown; event?: unknown };
  if (type !== 'jchat:menu') return null;
  return event === 'order_placed' || event === 'ready' ? event : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODE_RE = /^[A-Za-z0-9_-]{16,128}$/;

export interface OrderPlacedInfo {
  /** Present only when the menu knew the order id AND it is a uuid. */
  orderId?: string;
  /** The guest tracking code of the order (url-safe, 16–128 chars). */
  trackingCode?: string;
}

/**
 * `order_placed` with its payload, or null for anything else (wrong origin, shape or event). Same origin rule as
 * parseMenuSheetMessage; `orderId` / `trackingCode` are kept only when they have the exact expected format, so a
 * malformed value never reaches the claim RPC. Neither value is ever logged.
 */
export function parseMenuOrderPlaced(message: { origin: string; data: unknown }, allowedOrigin: string): OrderPlacedInfo | null {
  if (parseMenuSheetMessage(message, allowedOrigin) !== 'order_placed') return null;
  const { orderId, trackingCode } = message.data as { orderId?: unknown; trackingCode?: unknown };
  const info: OrderPlacedInfo = {};
  if (typeof orderId === 'string' && UUID_RE.test(orderId)) info.orderId = orderId;
  if (typeof trackingCode === 'string' && CODE_RE.test(trackingCode)) info.trackingCode = trackingCode;
  return info;
}
