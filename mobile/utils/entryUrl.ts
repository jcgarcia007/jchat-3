/**
 * JChat 3.0 — entry URL parser (QR → venue chat). Pure: no I/O, no React, runs in Node tests.
 *
 * Accepted forms (decided in Fase 2):
 *   https://<venue>.jchat.cloud/                  → { kind: 'venue' }
 *   https://<venue>.jchat.cloud/<mesa>-<código>   → { kind: 'table' }   (e.g. /8-k3f9)
 *   https://jchat.cloud/c/<token>                 → { kind: 'token' }   (apex: /c/<token> and /t/<token>)
 *   https://<venue>.jchat.cloud/c/<token>         → { kind: 'token', venue }
 *   https://jchat.cloud/t/<token>                 → { kind: 'tabletoken' }  (the table's QR token, as printed from the dashboard)
 *   https://<venue>.jchat.cloud/t/<token>         → { kind: 'tabletoken', venue }
 *   jchat://c/<token>   jchat://v/<venue>[/<mesa>-<código>]
 * `<venue>` is businesses.subdomain or, when it has none, businesses.slug. A QR only says WHICH venue to go
 * to; presence is still enforced by the server (check_geofence_and_join_room), never by this parser.
 *
 * Web testing aid: with `allowVenueQuery` (web only) a host that is NOT *.jchat.cloud (localhost, *.vercel.app)
 * takes the venue from `?venue=<venue>` with the same paths. On *.jchat.cloud the query is ignored.
 *
 * Not entries (→ null): jchat://room/:id, jchat://post/:id, jchat://confirm… (auth) and anything else.
 */

import { BARE_TOKEN_RE } from './venueQr';

export type EntryTarget =
  | { kind: 'venue'; venue: string }
  | { kind: 'table'; venue: string; label: string; code: string }
  | { kind: 'token'; token: string; venue?: string }
  /** The table's own QR token (tables.qr_token, the /t/<token> of the printed QR): resolve_table_qr turns it into the table. */
  | { kind: 'tabletoken'; token: string; venue?: string };

export interface ParseEntryOptions {
  /** Web only: accept `?venue=<venue>` on hosts that are not *.jchat.cloud. Never in native. */
  allowVenueQuery?: boolean;
}

/** Same list as the subdomain trigger of migration 199 (validate_business_subdomain). */
export const RESERVED_VENUE_SUBDOMAINS: readonly string[] = [
  'www', 'app', 'api', 'admin', 'dashboard', 'mail', 'soporte', 'support', 'help', 'ayuda', 'static', 'cdn',
  'assets', 'm', 'c', 't', 'auth', 'login', 'pos', 'kds', 'superadmin', 'status', 'docs', 'blog', 'jchat', 'otunity',
];

const RESERVED = new Set(RESERVED_VENUE_SUBDOMAINS);
const VENUE_RE = /^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?$/;
/** `<mesa>-<código>`; the code alphabet is gen_short_code's (23456789abcdefghjkmnpqrstuvwxyz). */
const TABLE_RE = /^([a-z0-9]{1,8})-([2-9a-hjkmnp-z]{4,8})$/;
const ROOT_HOST = 'jchat.cloud';
const HOST_SUFFIX = '.jchat.cloud';
const URL_RE = /^([a-z][a-z0-9+.-]*):\/\/([^/?#]*)([^?#]*)(?:\?([^#]*))?(?:#.*)?$/i;

function validVenue(value: string | null | undefined): string | null {
  if (!value) return null;
  const venue = value.toLowerCase();
  return VENUE_RE.test(venue) && !RESERVED.has(venue) ? venue : null;
}

function segmentsOf(path: string): string[] {
  return path.split('/').filter((segment) => segment.length > 0);
}

function queryParam(query: string | undefined, name: string): string | null {
  if (!query) return null;
  for (const pair of query.split('&')) {
    const eq = pair.indexOf('=');
    const key = eq < 0 ? pair : pair.slice(0, eq);
    if (key !== name) continue;
    const raw = eq < 0 ? '' : pair.slice(eq + 1);
    try {
      return decodeURIComponent(raw.replace(/\+/g, ' '));
    } catch {
      return null;
    }
  }
  return null;
}

/** Venue-relative path: [] → venue, [<mesa>-<código>] → table, ['c', <token>] → token, ['t', <token>] → tabletoken. */
function fromVenuePath(venue: string, segments: string[]): EntryTarget | null {
  if (segments.length === 0) return { kind: 'venue', venue };
  if (segments.length === 1) {
    const table = TABLE_RE.exec(segments[0].toLowerCase());
    return table ? { kind: 'table', venue, label: table[1], code: table[2] } : null;
  }
  if (segments.length === 2 && segments[0] === 'c' && BARE_TOKEN_RE.test(segments[1])) {
    return { kind: 'token', token: segments[1], venue };
  }
  if (segments.length === 2 && segments[0] === 't' && BARE_TOKEN_RE.test(segments[1])) {
    return { kind: 'tabletoken', token: segments[1], venue };
  }
  return null;
}

export function parseEntryUrl(raw: string, opts: ParseEntryOptions = {}): EntryTarget | null {
  if (typeof raw !== 'string') return null;
  const match = URL_RE.exec(raw.trim());
  if (!match) return null;

  const scheme = match[1].toLowerCase();
  const authority = match[2].toLowerCase();
  const segments = segmentsOf(match[3] ?? '');
  const query = match[4];

  // ── jchat://c/<token>   jchat://v/<venue>[/<mesa>-<código>] ──────────────────
  if (scheme === 'jchat') {
    if (authority === 'c' && segments.length === 1 && BARE_TOKEN_RE.test(segments[0])) {
      return { kind: 'token', token: segments[0] };
    }
    if (authority === 'v' && segments.length >= 1 && segments.length <= 2) {
      const venue = validVenue(segments[0]);
      if (!venue) return null;
      return fromVenuePath(venue, segments.slice(1));
    }
    return null;
  }

  // ── https hosts (http only for the web testing aid on localhost) ─────────────
  if (scheme !== 'https' && !(scheme === 'http' && opts.allowVenueQuery)) return null;
  if (authority.includes('@')) return null;
  const host = authority.replace(/:\d+$/, '');
  if (!host) return null;

  if (host === ROOT_HOST) {
    if (scheme !== 'https') return null;
    if (segments.length === 2 && segments[0] === 'c' && BARE_TOKEN_RE.test(segments[1])) {
      return { kind: 'token', token: segments[1] };
    }
    if (segments.length === 2 && segments[0] === 't' && BARE_TOKEN_RE.test(segments[1])) {
      return { kind: 'tabletoken', token: segments[1] };
    }
    return null;
  }

  if (host.endsWith(HOST_SUFFIX)) {
    if (scheme !== 'https') return null;
    const venue = validVenue(host.slice(0, -HOST_SUFFIX.length));
    return venue ? fromVenuePath(venue, segments) : null;
  }

  // Foreign host: only the web testing aid (localhost, *.vercel.app) with ?venue=.
  if (!opts.allowVenueQuery) return null;
  const rawVenue = queryParam(query, 'venue');
  if (rawVenue === null) {
    // /c/<token> and /t/<token> are self-contained: no venue needed.
    if (segments.length === 2 && BARE_TOKEN_RE.test(segments[1])) {
      if (segments[0] === 'c') return { kind: 'token', token: segments[1] };
      if (segments[0] === 't') return { kind: 'tabletoken', token: segments[1] };
    }
    return null;
  }
  const venue = validVenue(rawVenue);
  return venue ? fromVenuePath(venue, segments) : null;
}

/**
 * `filter` of React Navigation's `linking` (native; web does not support it): false = "do not navigate to this URL".
 * jchat://v/…, jchat://c/… (and any other venue-entry URL) enter through the `jchat://` prefix but match no
 * screen (`room/:id`, `post/:postId` only), so without this React Navigation would try to open a screen named
 * "v" / "c". Entries are handled solely by hooks/useEntryLinkCapture → EntryBridge. Everything else
 * (room/:id, post/:id, confirm…) is left to linking exactly as before.
 */
export function shouldLinkingHandle(url: string): boolean {
  return parseEntryUrl(url) === null;
}
