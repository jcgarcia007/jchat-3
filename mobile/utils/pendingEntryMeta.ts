/**
 * JChat 3.0 — the pending venue entry carried in the account itself (pure: no React, no Supabase, runs in Node tests).
 *
 * The entry scanned/opened before registering lives in this browser's storage (PENDING_KEY). When the e-mail is confirmed and the
 * user signs in somewhere else (another browser, the Mail app's browser) that storage is empty and the venue was lost. So the sign-up
 * ALSO stores it in the new account's user_metadata.pending_entry — the same channel pending_profile already uses — and the first
 * authenticated session, wherever it is, adopts it and clears it.
 *
 * What travels is only the EntryTarget plus the moment the QR was opened (savedAt): the 2 h expiry keeps counting from the scan,
 * so a forgotten sign-up cannot hijack a later session. Nothing here logs or builds text from the target (it may carry a table code).
 */

import type { EntryTarget } from './entryUrl';
import { isEntryTarget } from './reenterEntry';

export interface DatedEntry {
  target: EntryTarget;
  savedAt: number;
}

/** A well-formed, not-expired dated entry from untrusted input (storage or user_metadata), or null. */
export function validDatedEntry(value: unknown, now: number, ttlMs: number): DatedEntry | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as { target?: unknown; savedAt?: unknown };
  if (typeof v.savedAt !== 'number' || !Number.isFinite(v.savedAt)) return null;
  const age = now - v.savedAt;
  if (age < 0 || age > ttlMs) return null;
  if (!isEntryTarget(v.target)) return null;
  return { target: v.target, savedAt: v.savedAt };
}

/** What the sign-up writes into user_metadata.pending_entry: undefined (nothing) when there is no valid entry. */
export function metadataForSignUp(stored: unknown, now: number, ttlMs: number): DatedEntry | undefined {
  return validDatedEntry(stored, now, ttlMs) ?? undefined;
}

/** What the first session adopts from user_metadata.pending_entry (null when absent, malformed or expired). */
export function entryFromMetadata(meta: unknown, now: number, ttlMs: number): DatedEntry | null {
  return validDatedEntry(meta, now, ttlMs);
}
