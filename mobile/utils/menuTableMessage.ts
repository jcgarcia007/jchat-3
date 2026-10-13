/**
 * JChat 3.0 — the message the menu sheet sends to the framed menu with the table of the venue entry (pure).
 *
 *   { type: 'jchat:menu', event: 'context', table: { token, label } }
 *
 * Mirrors web/lib/embedTableContext.ts (which validates it on the other side: same token and label rules). Returns
 * null — nothing is sent — when there is no table or either value does not pass, so a malformed token never leaves
 * the app. The token is never logged and never goes into a URL.
 */

const TOKEN_RE = /^[a-z0-9][a-z0-9-]{5,62}$/;
// eslint-disable-next-line no-control-regex
const LABEL_RE = /^[^\u0000-\u001f\u007f<>]{1,40}$/u;

export interface MenuTableMessage {
  type: 'jchat:menu';
  event: 'context';
  table: { token: string; label: string };
}

export function buildTableContextMessage(token: string | null | undefined, label: string | null | undefined): MenuTableMessage | null {
  if (!token || !label) return null;
  if (!TOKEN_RE.test(token) || !LABEL_RE.test(label)) return null;
  return { type: 'jchat:menu', event: 'context', table: { token, label } };
}
