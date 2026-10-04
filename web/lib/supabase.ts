/**
 * JChat 3.0 — Web Supabase browser client (Stage 2 prerequisite)
 * Browser/client-side singleton for the Next.js dashboard + public web pages.
 * Uses @supabase/ssr's createBrowserClient so the auth session is stored in
 * cookies (not localStorage) — this lets Server Components, Route Handlers and
 * middleware read the same session (auth gate, RLS owner_id, OAuth callback).
 * Reads NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY.
 * Falls back to placeholders so the app builds before a backend is configured.
 *
 * For Server Components / Route Handlers, use `createSupabaseServerClient`
 * from `@/lib/supabase/server` instead.
 */

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from './database.types';

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co';
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'public-anon-placeholder-key';

/** True when real Supabase credentials are present (guard live calls). */
export const isSupabaseConfigured =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase = createBrowserClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── Session guard for Edge Functions ──────────────────────────────────────────
// A 401 from any Edge Function while we hold a session means the access token is dead (e.g. the
// session was closed elsewhere). Refresh ONCE and retry; if the refresh fails, close the session
// LOCALLY (scope 'local' — other devices keep theirs) and go to the login with an "expired" notice.
// A 401 is never reported as a connection problem.

let sessionExpiring = false;

/** AuthApiError codes that mean "this refresh token / session will never work again". */
const DEAD_SESSION_CODES = new Set([
  'refresh_token_not_found',
  'invalid_refresh_token',
  'refresh_token_already_used',
  'session_not_found',
]);

export function isDeadSessionError(error: unknown): boolean {
  const e = error as { code?: unknown; message?: unknown } | null;
  if (!e) return false;
  if (typeof e.code === 'string' && DEAD_SESSION_CODES.has(e.code)) return true;
  return typeof e.message === 'string' && /invalid refresh token|refresh token not found|session.*not.*found/i.test(e.message);
}

/**
 * The stored session can't be refreshed any more: close it LOCALLY (other devices keep theirs) and go
 * to the login with an "expired" notice. Re-entrant calls are ignored (no refresh → fail loop).
 */
export async function expireSession(): Promise<void> {
  if (sessionExpiring || typeof window === 'undefined') return;
  sessionExpiring = true;
  await supabase.auth.signOut({ scope: 'local' });
  if (window.location.pathname.startsWith('/auth/login')) {
    sessionExpiring = false;
    return;
  }
  const next = encodeURIComponent(window.location.pathname + window.location.search);
  window.location.assign(`/auth/login?next=${next}&expired=1`);
}

function isUnauthorized(error: unknown): boolean {
  const status = (error as { context?: { status?: unknown } } | null)?.context?.status;
  return status === 401;
}

// Every request and page load reads the session through getSession(): if that is where a dead
// refresh token surfaces, end the session instead of staying stuck on it.
const rawGetSession = supabase.auth.getSession.bind(supabase.auth);
supabase.auth.getSession = (async () => {
  const result = await rawGetSession();
  if (result.error && isDeadSessionError(result.error)) void expireSession();
  return result;
}) as typeof supabase.auth.getSession;

const rawInvoke = supabase.functions.invoke.bind(supabase.functions);

supabase.functions.invoke = (async (name: string, options?: Parameters<typeof rawInvoke>[1]) => {
  const result = await rawInvoke(name, options);
  if (!isUnauthorized(result.error) || typeof window === 'undefined') return result;

  const { data: current } = await supabase.auth.getSession();
  if (!current.session) return result; // guest call (e.g. guest-pay): nothing to refresh

  const { data, error } = await supabase.auth.refreshSession();
  if (!error && data.session) {
    return rawInvoke(name, {
      ...options,
      headers: { ...(options?.headers ?? {}), Authorization: `Bearer ${data.session.access_token}` },
    });
  }

  await expireSession();
  return result;
}) as typeof supabase.functions.invoke;
