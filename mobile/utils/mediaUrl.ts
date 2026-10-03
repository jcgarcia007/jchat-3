import { SUPABASE_URL } from '../services/supabase';

/** Scheme + authority ("host[:port]", userinfo included) and path of an https URL; null otherwise. */
function splitHttpsUrl(url: string): { authority: string; path: string } | null {
  const match = /^https:\/\/([^/?#]+)(\/[^?#]*)?/i.exec(url.trim());
  if (!match) return null;
  return { authority: match[1].toLowerCase(), path: match[2] ?? '' };
}

/**
 * Chat media may only come from this project's public Supabase Storage. Anything else
 * (another host, http, userinfo tricks like https://x@host/...) is not rendered, so a
 * crafted media_url cannot make every viewer's device call an arbitrary server.
 * The authority must match exactly, which also rejects "project.supabase.co@evil.com".
 */
export function isTrustedMediaUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const target = splitHttpsUrl(url);
  const base = splitHttpsUrl(SUPABASE_URL);
  if (!target || !base) return false;
  return target.authority === base.authority && target.path.startsWith('/storage/v1/object/public/');
}
