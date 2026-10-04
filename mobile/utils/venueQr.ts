/**
 * JChat 3.0 — Venue QR token parsing (Match check-in).
 *
 * The venue's printed QR encodes `https://<host>/c/{rooms.qr_token}`. Match sends that token
 * to match_check_in (p_qr_token); the server validates it against the venue's active rooms.
 * A bare token is accepted too. Anything else → null.
 */

const URL_TOKEN_RE = /\/c\/([A-Za-z0-9_-]{6,128})(?:[/?#]|$)/;
const BARE_TOKEN_RE = /^[A-Za-z0-9_-]{6,128}$/;

export function parseVenueQrToken(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  const fromUrl = URL_TOKEN_RE.exec(value);
  if (fromUrl) return fromUrl[1];
  return BARE_TOKEN_RE.test(value) ? value : null;
}
