/**
 * JChat 3.0 — what the delete-account Edge Function answered (pure: no React, no I/O; a Node test drives it).
 *
 * The function answers { error: <code>, code: <code> }. The app shows "We couldn't delete your account. Write to us at <contact> and
 * include this code: <code>" for every failure except the owner one (nothing was deleted: close or transfer the business first).
 * The 409 owner code used to be "owns_business"; the function now sends "owner_has_business": both are accepted while the update rolls out.
 */

import { blockerFromBody, type OwnerBlocker } from './ownerDelete';

/** 'blocked' (D4): a venue owner's delete was refused because of open orders / tabs or money still at Stripe; nothing was closed. */
export type DeleteAccountResult = 'ok' | 'owns_business' | 'blocked' | 'error';

export interface DeleteAccountOutcome {
  result: DeleteAccountResult;
  /** A short machine code of the failure (never user text), or null when the account was deleted. */
  code: string | null;
  /** Set when result is 'blocked': what to show instead of an error. */
  blocker?: OwnerBlocker;
}

const OWNER_CODES = ['owner_has_business', 'owns_business'];

/** Only short snake_case codes reach the screen: anything else (an HTML error page, a stack, a sentence) becomes 'unknown'. */
export function sanitizeCode(value: unknown): string {
  return typeof value === 'string' && /^[a-z][a-z0-9_]{0,39}$/.test(value) ? value : 'unknown';
}

export function deleteOutcomeFromResponse(status: number, ok: boolean, body: unknown): DeleteAccountOutcome {
  if (ok) return { result: 'ok', code: null };
  const record = body && typeof body === 'object' ? (body as { code?: unknown; error?: unknown }) : null;
  const raw = record?.code ?? record?.error;
  const blocker = blockerFromBody(status, body);
  if (blocker) return { result: 'blocked', code: typeof raw === 'string' ? sanitizeCode(raw) : null, blocker };
  if (status === 409 && typeof raw === 'string' && OWNER_CODES.includes(raw)) return { result: 'owns_business', code: 'owner_has_business' };
  const code = sanitizeCode(raw);
  return { result: 'error', code: code === 'unknown' ? `http_${status}` : code };
}

export const NETWORK_FAILURE: DeleteAccountOutcome = { result: 'error', code: 'network' };
export const NOT_CONFIGURED: DeleteAccountOutcome = { result: 'error', code: 'not_configured' };
