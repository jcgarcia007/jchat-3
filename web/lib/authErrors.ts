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
}

/** Key inside `authErrors` for this error (falls back to `generic`). */
export function authErrorKey(err: ErrorLike | null | undefined): string {
  if (!err) return "generic";
  if (err.code && KNOWN_AUTH_CODES.has(err.code)) return err.code;
  if (err.status === 429) return "over_request_rate_limit";
  if (err.name === "AuthRetryableFetchError") return "network";
  return "generic";
}
