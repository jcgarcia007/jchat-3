/**
 * JChat 3.0 — User-facing error messages.
 *
 * Never show `error.message` raw: backend/Stripe/service messages are English-only and may
 * leak internals. `toUserMessage` maps known errors to translated strings (namespace `errors`)
 * and falls back to a translated generic message. The raw error only goes to console.warn.
 *
 * Resolution order: AppError code → Supabase AuthError code → network failure →
 * PostgREST/Postgres/Stripe `code` → fallback.
 */

import { isAuthError } from '@supabase/supabase-js';
import i18n from '../i18n';

/** A known application error. `code` maps to `errors:app.<code>`; `params` are interpolated. */
export class AppError extends Error {
  readonly code: string;
  readonly params?: Record<string, unknown>;
  readonly status?: number | null;

  constructor(code: string, params?: Record<string, unknown>, status?: number | null) {
    super(code);
    this.name = 'AppError';
    this.code = code;
    this.params = params;
    this.status = status;
  }
}

function tr(key: string, params?: Record<string, unknown>): string | null {
  return i18n.exists(key) ? (i18n.t(key, params) as string) : null;
}

function isNetworkFailure(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return (
    err.name === 'AuthRetryableFetchError' ||
    /network request failed|failed to fetch|network error|timed out/i.test(err.message)
  );
}

/**
 * Translated message for `err`. `fallbackKey` (a full i18n key, default `errors:generic`)
 * is used when the error is not recognised.
 */
export function toUserMessage(err: unknown, fallbackKey = 'errors:generic'): string {
  let message: string | null = null;

  if (err instanceof AppError) {
    message = tr(`errors:app.${err.code}`, err.params);
  } else if (isAuthError(err)) {
    const code = typeof err.code === 'string' ? err.code : null;
    if (code) message = tr(`errors:auth.${code}`);
    if (!message && err.status === 429) message = tr('errors:auth.over_request_rate_limit');
    if (!message && isNetworkFailure(err)) message = tr('errors:network');
  } else if (isNetworkFailure(err)) {
    message = tr('errors:network');
  } else if (err && typeof err === 'object') {
    const code = (err as { code?: unknown }).code;
    if (typeof code === 'string') {
      message = tr(`errors:db.${code}`) ?? tr(`errors:stripe.${code}`) ?? tr(`errors:app.${code}`);
    }
  }

  if (!message) {
    console.warn('[errors] unmapped error:', err);
    message = (i18n.t(fallbackKey) as string) || (i18n.t('errors:generic') as string);
  }
  return message;
}
