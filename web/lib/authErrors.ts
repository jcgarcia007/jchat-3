/**
 * JChat 3.0 — Maps Supabase Auth / Postgres errors to message keys in the `authErrors`
 * next-intl namespace. Pages must never render `error.message` raw (English-only, internal).
 */

const KNOWN_AUTH_CODES = new Set([
  "invalid_credentials",
  "email_not_confirmed",
  "user_already_exists",
  "email_exists",
  "weak_password",
  "over_email_send_rate_limit",
  "over_request_rate_limit",
  "captcha_failed",
  "signup_disabled",
  "email_address_invalid",
  "email_address_not_authorized",
  "same_password",
  "otp_expired",
  "validation_failed",
  "session_expired",
  "reauthentication_needed",
  "user_banned",
  "provider_disabled",
  "oauth_provider_not_supported",
  "bad_oauth_callback",
  "flow_state_expired",
  "request_timeout",
]);

interface ErrorLike {
  code?: string;
  status?: number;
  name?: string;
  message?: string;
}

/**
 * D6: a sign-up the database refused. The trigger on auth.users raises `signup_blocked` for an e-mail on the ban list and Supabase Auth
 * answers `unexpected_failure` / "Database error saving new user". The page shows a generic text that does not reveal the block.
 */
export function isSignupBlocked(err: ErrorLike | null | undefined): boolean {
  if (!err) return false;
  return err.code === "unexpected_failure" || /database error saving new user/i.test(err.message ?? "");
}

/** Key inside `authErrors` for this error (falls back to `generic`). */
export function authErrorKey(err: ErrorLike | null | undefined): string {
  if (!err) return "generic";
  if (err.code && KNOWN_AUTH_CODES.has(err.code)) return err.code;
  if (err.status === 429) return "over_request_rate_limit";
  if (err.name === "AuthRetryableFetchError") return "network";
  return "generic";
}
