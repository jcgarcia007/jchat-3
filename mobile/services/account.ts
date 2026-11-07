/**
 * JChat 3.0 — Account lifecycle helpers.
 *
 * `deleteMyAccount` calls the `delete-account` Edge Function, which verifies the
 * caller's JWT server-side and hard-deletes auth.users (cascades all personal
 * data). Shared by Settings (user-initiated) and the age gate (underage).
 */

import { isSupabaseConfigured, SUPABASE_URL, SUPABASE_ANON_KEY, authedFetch } from './supabase';
import { ownerCheckFromResponse, type OwnerCheck } from '../utils/ownerDelete';
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
export async function deleteMyAccountWithCode(opts: { confirmOwnerClose?: boolean } = {}): Promise<DeleteAccountOutcome> {
  if (!isSupabaseConfigured) return NOT_CONFIGURED;
  try {
    // authedFetch adds the access token and applies the session guard (401 → refresh once → retry).
    const res = await authedFetch(`${SUPABASE_URL}/functions/v1/delete-account`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      // A venue owner's delete only goes through with this flag (the screen "Tienes un local" was shown and confirmed); the server answers the legacy
      // 409 owner_has_business without it. Accounts that own nothing ignore it.
      body: JSON.stringify(opts.confirmOwnerClose ? { confirmOwnerClose: true } : {}),
    });
    const body = res.ok ? null : await res.json().catch(() => null);
    return deleteOutcomeFromResponse(res.status, res.ok, body);
  } catch {
    return NETWORK_FAILURE;
  }
}

/**
 * D4 dry run: asks the server whether this account owns venues and whether something blocks closing them. A GET on purpose: an older deployed
 * function rejects every non-POST with 405 (→ 'unsupported', the generic flow), so asking can never delete anything. Changes nothing. Never throws.
 */
export async function checkOwnerDeletion(): Promise<OwnerCheck> {
  if (!isSupabaseConfigured) return { kind: 'error', code: 'not_configured' };
  try {
    const res = await authedFetch(`${SUPABASE_URL}/functions/v1/delete-account`, {
      method: 'GET',
      headers: { apikey: SUPABASE_ANON_KEY },
    });
    const body = await res.json().catch(() => null);
    return ownerCheckFromResponse(res.status, res.ok, body);
  } catch {
    return { kind: 'error', code: 'network' };
  }
}

/** The Stripe Express dashboard link of one of the owner's venues (stripe-connect, create_login_link), or null: the caller falls back to the public dashboard. */
export async function getStripeDashboardUrl(businessId: string): Promise<string | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const res = await authedFetch(`${SUPABASE_URL}/functions/v1/stripe-connect`, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create_login_link', business_id: businessId }),
    });
    if (!res.ok) return null;
    const body = (await res.json().catch(() => null)) as { url?: unknown } | null;
    return typeof body?.url === 'string' && body.url.startsWith('https://') ? body.url : null;
  } catch {
    return null;
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
