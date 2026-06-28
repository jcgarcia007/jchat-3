/**
 * JChat 3.0 — Active business resolver (web dashboard)
 * Single source of truth for "which business does the signed-in owner manage".
 * An owner may have multiple businesses, so we pick the most recently created.
 * Using .maybeSingle() (not .single()) avoids the "multiple rows" error that
 * surfaced as a false "Business not found".
 */

import { supabase, isSupabaseConfigured } from "./supabase";

export interface ActiveBusiness {
  id: string;
  name: string;
  slug: string | null;
  status: string | null;
  plan: string | null;
  is_verified: boolean;
  menu_enabled: boolean;
  menu_mode: "none" | "external" | "web";
  external_menu_url: string | null;
}

export type BusinessResolution =
  | { ok: true; business: ActiveBusiness }
  | { ok: false; reason: "demo" | "unauthenticated" | "no_business" | "error"; message: string };

export async function resolveActiveBusiness(): Promise<BusinessResolution> {
  if (!isSupabaseConfigured) {
    return { ok: false, reason: "demo", message: "Supabase not configured (demo mode)." };
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, reason: "unauthenticated", message: "You are not signed in." };
  }
  const { data, error } = await supabase
    .from("businesses")
    .select("id, name, slug, status, plan, is_verified, menu_enabled, menu_mode, external_menu_url")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return { ok: false, reason: "error", message: error.message };
  }
  if (!data) {
    return {
      ok: false,
      reason: "no_business",
      message:
        "No business is linked to the signed-in account. Make sure you are logged in with the account that registered the business, or register one.",
    };
  }
  return { ok: true, business: data as ActiveBusiness };
}

/** Convenience: returns the business or null (most-recent for the current owner). */
export async function getActiveBusiness(): Promise<ActiveBusiness | null> {
  const res = await resolveActiveBusiness();
  return res.ok ? res.business : null;
}
