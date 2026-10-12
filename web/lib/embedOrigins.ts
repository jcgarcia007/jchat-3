/**
 * JChat 3.0 — who may embed the public menu (/m/<slug>) in an iframe, and who the menu may talk to.
 *
 * The Expo web app (the replacement of the old Next chat) shows the menu in a sheet over the chat: an <iframe> of
 * https://jchat.cloud/m/<slug>?embed=1 inside the app's own domains. Only /m/* may be framed, and only by these
 * origins; every other page keeps `X-Frame-Options: DENY` + `frame-ancestors 'none'` (clickjacking protection).
 * NEVER add `https://*.vercel.app`: anyone could frame the site from their own Vercel project.
 *
 * The same list validates the parent that receives `postMessage` from the embedded menu (never `'*'`).
 */

/** Origins allowed in production. */
export const EMBED_PARENT_ORIGINS = ['https://jchat.cloud', 'https://jchat-app-web.vercel.app'] as const;

/** Wildcard host sources allowed in production (CSP source expressions). */
export const EMBED_PARENT_WILDCARDS = ['https://*.jchat.cloud'] as const;

/** Extra sources outside production, to test against a local Expo web build. */
export const EMBED_DEV_SOURCES = ['http://localhost:*', 'http://127.0.0.1:*'] as const;

/** The value of the CSP `frame-ancestors` directive for /m/*. */
export function frameAncestorsForEmbed(isProduction: boolean): string {
  const sources = ["'self'", ...EMBED_PARENT_ORIGINS, ...EMBED_PARENT_WILDCARDS, ...(isProduction ? [] : EMBED_DEV_SOURCES)];
  return sources.join(' ');
}

/** Is `origin` (as in `event.origin` / `new URL(x).origin`) allowed to embed the menu / receive its messages? */
export function isAllowedParentOrigin(origin: string | null | undefined, isProduction: boolean): boolean {
  if (!origin) return false;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.origin !== origin) return false; // an origin has no path, query or trailing slash
  if ((EMBED_PARENT_ORIGINS as readonly string[]).includes(origin)) return true;
  if (url.protocol === 'https:' && url.hostname.endsWith('.jchat.cloud') && url.hostname !== '.jchat.cloud') return true;
  if (!isProduction && url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')) return true;
  return false;
}

/**
 * The origin of the page that embeds us, from the browser's own evidence (never from the query string):
 * `location.ancestorOrigins[0]` (Chromium / Safari) or the origin of `document.referrer`. Null when it is not an
 * allowed parent — then nothing is posted.
 */
export function resolveParentOrigin(candidates: Array<string | null | undefined>, isProduction: boolean): string | null {
  for (const candidate of candidates) {
    if (!candidate) continue;
    let origin: string;
    try {
      origin = new URL(candidate).origin;
    } catch {
      continue;
    }
    if (isAllowedParentOrigin(origin, isProduction)) return origin;
  }
  return null;
}
