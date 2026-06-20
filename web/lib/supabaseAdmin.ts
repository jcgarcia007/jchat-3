/**
 * JChat 3.0 — Web Supabase admin client (server-side only)
 * For Next.js Route Handlers / server actions that need elevated access
 * (e.g. /api/verify). Uses the service role key — NEVER import this into a
 * Client Component (server-only by convention).
 * Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (server env).
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL =
  process.env.SUPABASE_URL ??
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  'https://placeholder.supabase.co';
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'service-role-placeholder-key';

export const isSupabaseAdminConfigured =
  !!(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) &&
  !!process.env.SUPABASE_SERVICE_ROLE_KEY;

export const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
