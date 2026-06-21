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

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co';
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'public-anon-placeholder-key';

/** True when real Supabase credentials are present (guard live calls). */
export const isSupabaseConfigured =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
