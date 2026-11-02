/**
 * JChat 3.0 — Account lifecycle helpers.
 *
 * `deleteMyAccount` calls the `delete-account` Edge Function, which verifies the
 * caller's JWT server-side and hard-deletes auth.users (cascades all personal
 * data). Shared by Settings (user-initiated) and the age gate (underage).
 */

import { isSupabaseConfigured, SUPABASE_URL, SUPABASE_ANON_KEY, authedFetch } from './supabase';
import {
  deleteOutcomeFromResponse,
  NETWORK_FAILURE,
  NOT_CONFIGURED,
  type DeleteAccountOutcome,
  type DeleteAccountResult,
} from '../utils/deleteAccountOutcome';

export type { DeleteAccountOutcome, DeleteAccountResult };

/**
 * Deletes the account and says why it did not: 'owns_business' (409) when the user still owns a business — they must close or
 * transfer it first, nothing was deleted — or 'error' with a short code of the failure (fk_violation, delete_failed, network…).
 * Never throws.
 */
export async function deleteMyAccountWithCode(): Promise<DeleteAccountOutcome> {
  if (!isSupabaseConfigured) return NOT_CONFIGURED;
  try {
    // authedFetch adds the access token and applies the session guard (401 → refresh once → retry).
    const res = await authedFetch(`${SUPABASE_URL}/functions/v1/delete-account`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
    });
    const body = res.ok ? null : await res.json().catch(() => null);
    return deleteOutcomeFromResponse(res.status, res.ok, body);
  } catch {
    return NETWORK_FAILURE;
  }
}

/** Same as {@link deleteMyAccountWithCode} but only the result (used where the reason is not shown). */
export async function deleteMyAccountDetailed(): Promise<DeleteAccountResult> {
  return (await deleteMyAccountWithCode()).result;
}

/** Returns true only when the server confirmed the deletion. Never throws. */
export async function deleteMyAccount(): Promise<boolean> {
  return (await deleteMyAccountDetailed()) === 'ok';
}
