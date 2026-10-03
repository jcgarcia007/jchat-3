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

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

/**
 * Voice notes live in PRIVATE buckets and are stored as a PATH (never a URL, never file://).
 * A room voice note must be exactly room/{room_id}/{sender_uid}/{file}.m4a for THIS room.
 */
export function isRoomVoicePath(path: string | null | undefined, roomId: string): boolean {
  if (!path) return false;
  const re = new RegExp(`^room/${roomId.toLowerCase()}/${UUID}/[A-Za-z0-9_-]+\\.m4a$`, 'i');
  return /^[0-9a-f-]{36}$/i.test(roomId) && re.test(path);
}

/** A DM voice note must be exactly {conversation_id}/{sender_uid}/{file}.m4a for THIS conversation. */
export function isDmVoicePath(path: string | null | undefined, conversationId: string): boolean {
  if (!path) return false;
  const re = new RegExp(`^${conversationId.toLowerCase()}/${UUID}/[A-Za-z0-9_-]+\\.m4a$`, 'i');
  return /^[0-9a-f-]{36}$/i.test(conversationId) && re.test(path);
}
