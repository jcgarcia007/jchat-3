/**
 * JChat 3.0 — Web Supabase server client (App Router)
 * For Server Components, Server Actions and Route Handlers that need a
 * session-aware Supabase client. Built on @supabase/ssr's createServerClient,
 * reading/writing the auth session via Next.js cookies (async in Next 15+).
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY (anon key —
 * RLS still applies). For elevated access use `@/lib/supabaseAdmin`.
 */

import { createServerClient } from '@supabase/ssr';
import type { Database } from '@/lib/database.types';
import { cookies } from 'next/headers';

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co';
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'public-anon-placeholder-key';

/** True when real Supabase credentials are present (guard live calls + gate). */
export const isSupabaseConfigured =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Create a per-request server-side Supabase client bound to the request cookies.
 * Must be called within a request scope (Server Component / Route Handler).
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // `setAll` was called from a Server Component (read-only cookies).
          // Safe to ignore — the middleware refreshes the session cookies.
        }
      },
    },
  });
}
