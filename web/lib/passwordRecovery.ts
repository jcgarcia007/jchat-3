/**
 * JChat 3.0 — Password recovery on the web (pure helpers; the pages are app/forgot-password and app/reset-password).
 *
 * Same flow as the app: the email gets a 6-digit code (supabase.auth.resetPasswordForEmail), the code is verified with
 * verifyOtp({ type: 'recovery' }), then updateUser({ password }) and signOut({ scope: 'others' }). The limits mirror the app:
 * a 60-second wait between codes, and the server's own rate limit. On top, the browser stops after 5 wrong codes for 15 minutes.
 * Nothing here talks to the network.
 */

/** Seconds to wait before another code can be requested (the app's RESEND_DELAY_SECONDS). */
export const RESEND_COOLDOWN_S = 60;
/** Wrong codes accepted before the browser locks the form. */
export const MAX_CODE_ATTEMPTS = 5;
export const LOCKOUT_MS = 15 * 60 * 1000;
export const MIN_PASSWORD_LENGTH = 8;

/** The email travels between the two pages in sessionStorage (never in the URL). */
export const RECOVERY_EMAIL_KEY = "jchat.recovery.email";
export const RECOVERY_SENT_AT_KEY = "jchat.recovery.sentAt";

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isPlausibleEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
}

/** Keeps only the digits, at most 6 (pasting "123 456" or "123-456" works). */
export function normalizeCode(value: string): string {
  return value.replace(/\D/g, "").slice(0, 6);
}

export function isCodeComplete(value: string): boolean {
  return /^\d{6}$/.test(value);
}

export type PasswordProblem = "tooShort" | "mismatch" | null;

export function passwordProblem(password: string, confirm: string): PasswordProblem {
  if (password.length < MIN_PASSWORD_LENGTH) return "tooShort";
  if (password !== confirm) return "mismatch";
  return null;
}

/** Whole seconds left of the wait since the last code was sent (0 = can send now). */
export function cooldownRemaining(lastSentAt: number | null, now: number): number {
  if (lastSentAt === null || !Number.isFinite(lastSentAt)) return 0;
  return Math.max(0, Math.ceil(RESEND_COOLDOWN_S - (now - lastSentAt) / 1000));
}

export interface AttemptState {
  fails: number;
  lockedUntil: number | null;
}

export const FRESH_ATTEMPTS: AttemptState = { fails: 0, lockedUntil: null };

/** Whole minutes (rounded up) the form stays locked; 0 when it is not locked. */
export function lockMinutesLeft(state: AttemptState, now: number): number {
  if (state.lockedUntil === null || state.lockedUntil <= now) return 0;
  return Math.ceil((state.lockedUntil - now) / 60_000);
}

/** The state after one more wrong code: the 5th locks the form for 15 minutes. An expired lock starts the count again. */
export function registerFailure(state: AttemptState, now: number): AttemptState {
  const base = state.lockedUntil !== null && state.lockedUntil <= now ? FRESH_ATTEMPTS : state;
  const fails = base.fails + 1;
  return fails >= MAX_CODE_ATTEMPTS ? { fails, lockedUntil: now + LOCKOUT_MS } : { fails, lockedUntil: base.lockedUntil };
}

export type RecoveryErrorKind = "rateLimited" | "captcha" | "generic";

/** What to tell the person about an error of resetPasswordForEmail (never the raw message; "no such account" is never revealed). */
export function recoveryErrorKind(error: { code?: string; status?: number } | null | undefined): RecoveryErrorKind | null {
  if (!error) return null;
  if (error.code === "over_email_send_rate_limit" || error.code === "over_request_rate_limit" || error.status === 429) return "rateLimited";
  if (error.code === "captcha_failed") return "captcha";
  return "generic";
}
