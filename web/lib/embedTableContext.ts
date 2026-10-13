/**
 * JChat 3.0 — the table of the person who opens the menu from the app's sheet (embedded /m/<slug>?embed=1).
 *
 * The Expo app knows the table the person entered by (its QR). The framed menu lives in another site, so it cannot
 * read the app's storage (sessionStorage is partitioned per site). The two talk by postMessage:
 *
 *   menu → parent   { type: 'jchat:menu', event: 'ready' }                          (target: the validated parent origin)
 *   parent → menu   { type: 'jchat:menu', event: 'context', table: { token, label } } (target: the menu's own origin)
 *
 * The menu accepts a `context` only from window.parent AND from an origin on the allow-list (lib/embedOrigins.ts),
 * and only when the payload has exactly this shape. The table token NEVER travels in a URL (it would end up in logs,
 * history and Referer headers) and is never logged. Whether the person is really inside the venue is still decided
 * by the server when an order is placed (venue_order_access); this only carries which table they said they are at.
 */

export const MENU_MESSAGE_TYPE = "jchat:menu";

export interface TableContext {
  token: string;
  label: string;
}

// tables.qr_token is `<venue slug, <= 16 chars>-table-<8 hex>` (migration 073): lowercase letters, digits and dashes.
const TOKEN_RE = /^[a-z0-9][a-z0-9-]{5,62}$/;
// A table label is what the venue typed ("5", "T8", "Terraza 2"): short, printable, no control characters.
const LABEL_RE = /^[^\u0000-\u001f\u007f<>]{1,40}$/u;

/** Validates the `context` message the app sends. Anything else — wrong type, event, shape or values — is null. */
export function parseTableContextMessage(data: unknown): TableContext | null {
  if (!data || typeof data !== "object") return null;
  const msg = data as Record<string, unknown>;
  if (msg.type !== MENU_MESSAGE_TYPE || msg.event !== "context") return null;
  const keys = Object.keys(msg).sort().join(",");
  if (keys !== "event,table,type") return null;
  const table = msg.table;
  if (!table || typeof table !== "object") return null;
  const t = table as Record<string, unknown>;
  if (Object.keys(t).sort().join(",") !== "label,token") return null;
  if (typeof t.token !== "string" || !TOKEN_RE.test(t.token)) return null;
  if (typeof t.label !== "string" || !LABEL_RE.test(t.label)) return null;
  return { token: t.token, label: t.label };
}

/** The message the menu sends so the app answers with the context. */
export function readyMessage(): { type: string; event: "ready" } {
  return { type: MENU_MESSAGE_TYPE, event: "ready" };
}
