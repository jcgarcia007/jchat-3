/**
 * JChat 3.0 — Client-side account lifecycle (browser).
 * `deleteMyAccount` calls the existing `delete-account` Edge Function, which
 * verifies the caller's JWT and hard-deletes auth.users (cascades personal data).
 * Used for accounts that fail the 18+ check.
 */

import { supabase, authedFetch } from "@/lib/supabase";
import { TERMS_VERSION } from "@/lib/terms";

/** true only when the server confirmed the deletion. Never throws. */
export async function deleteMyAccount(): Promise<boolean> {
  try {
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!base || !anon) return false;
    // authedFetch adds the access token and applies the session guard (401 → refresh once → retry).
    const res = await authedFetch(`${base}/functions/v1/delete-account`, {
      method: "POST",
      headers: {
        apikey: anon,
        "Content-Type": "application/json",
      },
    });
    return res.ok;
  } catch {
    return false;
  }
}

export type ConfirmAgeResult = "ok" | "underage" | "error";

/** Sends the picked date (YYYY-MM-DD) to rpc confirm_age. The date is never stored client-side. */
export async function confirmAge(isoDate: string): Promise<ConfirmAgeResult> {
  try {
    const { data, error } = await supabase.rpc("confirm_age", {
      p_birth_date: isoDate,
      p_terms_version: TERMS_VERSION,
    });
    if (error) return "error";
    const res = data as { ok?: boolean; reason?: string } | null;
    if (res?.ok === true) return "ok";
    if (res?.ok === false && res.reason === "underage") return "underage";
    return "error";
  } catch {
    return "error";
  }
}
