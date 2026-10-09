/**
 * JChat 3.0 — Account lifecycle helpers.
 *
 * `deleteMyAccount` calls the `delete-account` Edge Function, which verifies the
 * caller's JWT server-side and hard-deletes auth.users (cascades all personal
 * data). Shared by Settings (user-initiated) and the age gate (underage).
 */

import { isSupabaseConfigured, SUPABASE_URL, SUPABASE_ANON_KEY, authedFetch } from './supabase';

export type DeleteAccountResult = 'ok' | 'owns_business' | 'error';

/**
 * Deletes the account and says why it did not: 'owns_business' (409) when the user still owns a business — they must close or
 * transfer it first, nothing was deleted. Never throws.
 */
export async function deleteMyAccountDetailed(): Promise<DeleteAccountResult> {
  if (!isSupabaseConfigured) return 'error';
  try {
    // authedFetch adds the access token and applies the session guard (401 → refresh once → retry).
    const res = await authedFetch(`${SUPABASE_URL}/functions/v1/delete-account`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
    });
    if (res.ok) return 'ok';
    if (res.status === 409) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (body?.error === 'owns_business') return 'owns_business';
    }
    return 'error';
  } catch {
    return 'error';
  }
}

/** Returns true only when the server confirmed the deletion. Never throws. */
export async function deleteMyAccount(): Promise<boolean> {
  return (await deleteMyAccountDetailed()) === 'ok';
}
