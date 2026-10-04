/**
 * JChat 3.0 — Shared Supabase client (Stage 1 prerequisite)
 *
 * Single source of truth for the Supabase JS client across the mobile app.
 * Reads EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY from env.
 * Falls back to harmless placeholders so the app still boots (and tsc passes)
 * before a real backend is configured — network calls will simply fail until
 * `.env` is filled in (see .env.example).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';
import { createClient } from '@supabase/supabase-js';
import i18n from '../i18n';

/** Project URL — exported so callers can reach Edge Functions (e.g. delete-account). */
export const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co';
/** Anon key — sent as the `apikey` header when calling Edge Functions via fetch. */
export const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? 'public-anon-placeholder-key';

/** True when real Supabase credentials are present (use to guard live calls). */
export const isSupabaseConfigured =
  !!process.env.EXPO_PUBLIC_SUPABASE_URL &&
  !!process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// ── Session guard for Edge Functions ──────────────────────────────────────────
// A 401 from any Edge Function while we hold a session means the access token is dead (e.g. the
// session was closed elsewhere). Refresh ONCE and retry; if the refresh fails the session is gone:
// close it LOCALLY (scope 'local' — other devices keep theirs), tell the user, and let the auth
// listener send them to the login. A 401 is never reported as a connection problem.

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
 * The stored session can't be refreshed any more: close it LOCALLY (other devices keep theirs), tell
 * the user once, and let the auth listener send them to the login. Re-entrant calls are ignored, so
 * there is no refresh → fail → refresh loop.
 */
export async function expireSession(): Promise<void> {
  if (sessionExpiring) return;
  sessionExpiring = true;
  try {
    await supabase.auth.signOut({ scope: 'local' });
    Alert.alert(i18n.t('errors:sessionExpired') as string);
  } finally {
    setTimeout(() => {
      sessionExpiring = false;
    }, 3000);
  }
}

function isUnauthorized(error: unknown): boolean {
  const status = (error as { context?: { status?: unknown } } | null)?.context?.status;
  return status === 401;
}

// Every request (REST, storage, functions) and the app start read the session through getSession():
// if that is where a dead refresh token surfaces, end the session instead of staying stuck on it.
const rawGetSession = supabase.auth.getSession.bind(supabase.auth);
supabase.auth.getSession = (async () => {
  const result = await rawGetSession();
  if (result.error && isDeadSessionError(result.error)) void expireSession();
  return result;
}) as typeof supabase.auth.getSession;

const rawInvoke = supabase.functions.invoke.bind(supabase.functions);

supabase.functions.invoke = (async (name: string, options?: Parameters<typeof rawInvoke>[1]) => {
  const result = await rawInvoke(name, options);
  if (!isUnauthorized(result.error)) return result;

  const { data: current } = await supabase.auth.getSession();
  if (!current.session) return result; // guest call: nothing to refresh

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
