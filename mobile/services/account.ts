/**
 * JChat 3.0 — Account lifecycle helpers.
 *
 * `deleteMyAccount` calls the `delete-account` Edge Function, which verifies the
 * caller's JWT server-side and hard-deletes auth.users (cascades all personal
 * data). Shared by Settings (user-initiated) and the age gate (underage).
 */

import { isSupabaseConfigured, SUPABASE_URL, SUPABASE_ANON_KEY, authedFetch } from './supabase';

/** Returns true only when the server confirmed the deletion. Never throws. */
export async function deleteMyAccount(): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  try {
    // authedFetch adds the access token and applies the session guard (401 → refresh once → retry).
    const res = await authedFetch(`${SUPABASE_URL}/functions/v1/delete-account`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
    });
    return res.ok;
  } catch {
    return false;
  }
}
