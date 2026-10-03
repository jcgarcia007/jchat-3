/**
 * JChat 3.0 — Account lifecycle helpers.
 *
 * `deleteMyAccount` calls the `delete-account` Edge Function, which verifies the
 * caller's JWT server-side and hard-deletes auth.users (cascades all personal
 * data). Shared by Settings (user-initiated) and the age gate (underage).
 */

import { supabase, isSupabaseConfigured, SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase';

/** Returns true only when the server confirmed the deletion. Never throws. */
export async function deleteMyAccount(): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) return false;

    const res = await fetch(`${SUPABASE_URL}/functions/v1/delete-account`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        apikey: SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
    });
    return res.ok;
  } catch {
    return false;
  }
}
