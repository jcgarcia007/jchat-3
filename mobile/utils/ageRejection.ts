/**
 * JChat 3.0 — "you don't meet the requirements" is remembered on the device for 24 h (audit B2-13).
 *
 * Only the TIME of the rejection is stored, never the date of birth or the age (services/age.ts: the birth date is not persisted
 * client-side). While the block lasts the sign-up form does not open and the same neutral dialog is shown again, so the age can not be
 * retyped until it passes. Pure (no React, no I/O): a Node test drives it.
 */

export const AGE_REJECTION_KEY = 'jchat.ageRejectedAt';
export const AGE_REJECTION_TTL_MS = 24 * 60 * 60 * 1000;

/** The stored value → a timestamp (ms), or null when missing or not a number. */
export function parseAgeRejection(raw: string | null | undefined): number | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** True while the block is in force. A time in the future (clock changed) is not trusted: it counts as expired. */
export function isAgeRejectionActive(rejectedAt: number | null | undefined, now: number = Date.now()): boolean {
  if (typeof rejectedAt !== 'number' || !Number.isFinite(rejectedAt)) return false;
  const elapsed = now - rejectedAt;
  return elapsed >= 0 && elapsed < AGE_REJECTION_TTL_MS;
}
