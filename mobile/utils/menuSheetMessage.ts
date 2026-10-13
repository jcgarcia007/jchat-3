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
