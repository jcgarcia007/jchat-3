/**
 * JChat 3.0 — Client-side account lifecycle (browser).
 * `deleteMyAccount` calls the existing `delete-account` Edge Function, which
 * verifies the caller's JWT and hard-deletes auth.users (cascades personal data).
 * Used for accounts that fail the 18+ check.
 */

import { supabase } from "@/lib/supabase";

/** true only when the server confirmed the deletion. Never throws. */
export async function deleteMyAccount(): Promise<boolean> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!session?.access_token || !base || !anon) return false;
    const res = await fetch(`${base}/functions/v1/delete-account`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
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
    const { data, error } = await supabase.rpc("confirm_age", { p_birth_date: isoDate });
    if (error) return "error";
    const res = data as { ok?: boolean; reason?: string } | null;
    if (res?.ok === true) return "ok";
    if (res?.ok === false && res.reason === "underage") return "underage";
    return "error";
  } catch {
    return "error";
  }
}
