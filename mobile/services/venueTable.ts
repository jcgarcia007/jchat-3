/**
 * JChat 3.0 — the table QR token of the current venue entry, kept IN MEMORY only.
 *
 * resolve_venue_entry returns `table_qr_token` when the person came in through a table QR. The framed menu on the web
 * (menu sheet) needs it to put the order on that table, so the chat's menu sheet hands it over by postMessage.
 * It is deliberately not a navigation param and not persisted: route params can be written to the browser URL and
 * history, and storage survives the visit. A new entry (with or without a table) replaces it; leaving the venue
 * clears it. Never log it.
 */

let current: { roomId: string; token: string } | null = null;

/** Called by the entry flow with the room it opens and the table token (null when the entry had no table). */
export function setEntryTableToken(roomId: string, token: string | null | undefined): void {
  current = token ? { roomId, token } : null;
}

/** The token for this room's entry, or null (no table / another room). */
export function getEntryTableToken(roomId: string | null | undefined): string | null {
  return current && roomId && current.roomId === roomId ? current.token : null;
}

export function clearEntryTableToken(): void {
  current = null;
}
