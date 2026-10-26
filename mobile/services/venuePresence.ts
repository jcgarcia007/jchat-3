/**
 * JChat 3.0 — the venue-presence calls of migration 237 (Paso 0): people counts, session end, session resume.
 *
 * The database functions may not exist yet (the migration is applied by Juan, not by the app): every call here NEVER
 * throws, treats any failure as "not available", and logs the first failure of each function once (not on every map
 * refresh). The app keeps working without them: the counts stay 0, a confirmed exit still ends the session locally,
 * and a re-entry just shows what the server already shows.
 */

import { isSupabaseConfigured, supabase } from './supabase';
import { limitCountIds, parsePeopleCounts } from '../utils/venuePeople';
import { PRESENT_QUERY_LIMIT } from '../utils/presentUsers';

const warned = new Set<string>();

function warnOnce(fn: string, detail: unknown): void {
  if (warned.has(fn)) return;
  warned.add(fn);
  const message = detail && typeof detail === 'object' && 'message' in detail ? (detail as { message: string }).message : String(detail);
  console.warn(`[venue] ${fn} is not available yet (logged once): ${message}`);
}

/**
 * People in each of these venues now, as { business_id: people } (a venue with nobody is simply absent). Null when the
 * call fails or the function does not exist (the caller keeps 0 and does not retry on a timer). Never throws.
 */
export async function fetchPeopleCounts(businessIds: readonly string[]): Promise<Record<string, number> | null> {
  const ids = limitCountIds(businessIds);
  if (!isSupabaseConfigured || ids.length === 0) return {};
  try {
    const { data, error } = await supabase.rpc('venue_people_counts', { p_business_ids: ids });
    if (error) {
      warnOnce('venue_people_counts', error);
      return null;
    }
    return parsePeopleCounts(data);
  } catch (err) {
    warnOnce('venue_people_counts', err);
    return null;
  }
}

/**
 * The exit was CONFIRMED (three good readings outside): the server hides the venue's ephemeral content for an hour
 * and purges it later. Resolves true when the call went through. Never throws.
 */
export async function endVenueSessionOnServer(businessId: string): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  try {
    const { error } = await supabase.rpc('venue_session_end', { p_business_id: businessId, p_reason: 'outside_radius' });
    if (error) {
      warnOnce('venue_session_end', error);
      return false;
    }
    return true;
  } catch (err) {
    warnOnce('venue_session_end', err);
    return false;
  }
}

/**
 * Entering the venue again: resolves true when the server gave back a pending exit (the hidden history is visible
 * again), false in any other case, also when the function does not exist. Never throws.
 */
export async function resumeVenueSessionOnServer(businessId: string): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  try {
    const { data, error } = await supabase.rpc('venue_session_resume', { p_business_id: businessId });
    if (error) {
      warnOnce('venue_session_resume', error);
      return false;
    }
    return data === true;
  } catch (err) {
    warnOnce('venue_session_resume', err);
    return false;
  }
}

/**
 * Migration 243: of these people (the room's presence list), who is still CONFIRMED in the venue by the server's clock (the same
 * room_geo_presence that gift_available needs). At most PRESENT_QUERY_LIMIT ids are sent. Null when the call fails or the
 * function does not exist yet (the caller then leaves the list as it is). Never throws.
 */
export async function fetchPresentUsers(businessId: string, userIds: readonly string[]): Promise<string[] | null> {
  if (!isSupabaseConfigured || !businessId || userIds.length === 0) return null;
  try {
    const { data, error } = await supabase.rpc('venue_present_users' as never, { p_business_id: businessId, p_user_ids: userIds.slice(0, PRESENT_QUERY_LIMIT) } as never);
    if (error) {
      warnOnce('venue_present_users', error);
      return null;
    }
    if (!Array.isArray(data)) return null;
    return (data as unknown[]).filter((id): id is string => typeof id === 'string');
  } catch (err) {
    warnOnce('venue_present_users', err);
    return null;
  }
}
