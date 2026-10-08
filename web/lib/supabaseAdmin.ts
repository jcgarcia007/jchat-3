/**
 * JChat 3.0 — Web Supabase admin client (server-side only)
 * For Next.js Route Handlers / server actions that need elevated access
 * (e.g. /api/verify). Uses the service role key — NEVER import this into a
 * Client Component (server-only by convention).
 * Reads SUPABASE_URL + SB_SECRET_KEY (server env). The key is opaque (sb_secret_…): never decode or pattern-match it.
 */

import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

// Treat empty-string env vars as missing (`??` only catches null/undefined,
// so an empty SB_SECRET_KEY="" would otherwise reach createClient
// and throw "supabaseKey is required" at module load — defeating the guard below).
const envOrUndefined = (v: string | undefined): string | undefined =>
  v && v.trim() ? v : undefined;

const SUPABASE_URL =
  envOrUndefined(process.env.SUPABASE_URL) ??
  envOrUndefined(process.env.NEXT_PUBLIC_SUPABASE_URL) ??
  'https://placeholder.supabase.co';
const SECRET_KEY =
  envOrUndefined(process.env.SB_SECRET_KEY) ??
  'service-role-placeholder-key';

export const isSupabaseAdminConfigured =
  !!envOrUndefined(process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL) &&
  !!envOrUndefined(process.env.SB_SECRET_KEY);

export const supabaseAdmin = createClient<Database>(SUPABASE_URL, SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
