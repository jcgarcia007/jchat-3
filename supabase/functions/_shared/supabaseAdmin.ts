/**
 * JChat 3.0 — shared Supabase key helpers for Edge Functions.
 *
 * Keys are read ONLY from the environment (Edge Function secrets), never from code:
 *   SB_SECRET_KEY       — new-format secret key (sb_secret_…). Server-only, bypasses RLS.
 *   SB_PUBLISHABLE_KEY  — new-format publishable key (sb_publishable_…). Safe for clients.
 * The legacy keys (SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY) are disabled: there is no fallback.
 *
 * Nothing here may assume a JWT shape: the new keys are opaque strings, so never decode or
 * pattern-match them.
 */

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.44.4";

/** Server-side key (service role equivalent). */
export function getSecretKey(): string | undefined {
  return Deno.env.get("SB_SECRET_KEY");
}

/** Public key (anon equivalent), used for the per-request user client that verifies the caller's JWT. */
export function getPublishableKey(): string | undefined {
  return Deno.env.get("SB_PUBLISHABLE_KEY");
}

/** Admin client — bypasses RLS. Throws when the project URL or the secret key is missing. */
export function createAdminClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = getSecretKey();
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SB_SECRET_KEY");
  }
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
