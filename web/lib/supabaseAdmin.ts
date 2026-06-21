/**
 * JChat 3.0 — Web Supabase admin client (server-side only)
 * For Next.js Route Handlers / server actions that need elevated access
 * (e.g. /api/verify). Uses the service role key — NEVER import this into a
 * Client Component (server-only by convention).
 * Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (server env).
 */

import { createClient } from '@supabase/supabase-js';

// Treat empty-string env vars as missing (`??` only catches null/undefined,
// so an empty SUPABASE_SERVICE_ROLE_KEY="" would otherwise reach createClient
// and throw "supabaseKey is required" at module load — defeating the guard below).
const envOrUndefined = (v: string | undefined): string | undefined =>
  v && v.trim() ? v : undefined;

const SUPABASE_URL =
  envOrUndefined(process.env.SUPABASE_URL) ??
  envOrUndefined(process.env.NEXT_PUBLIC_SUPABASE_URL) ??
  'https://placeholder.supabase.co';
const SERVICE_ROLE_KEY =
  envOrUndefined(process.env.SUPABASE_SERVICE_ROLE_KEY) ??
  'service-role-placeholder-key';

export const isSupabaseAdminConfigured =
  !!envOrUndefined(process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL) &&
  !!envOrUndefined(process.env.SUPABASE_SERVICE_ROLE_KEY);

export const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
