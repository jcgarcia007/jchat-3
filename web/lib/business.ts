/**
 * JChat 3.0 — Active business resolver (web dashboard)
 * Single source of truth for "which business does the signed-in owner manage".
 * An owner may have multiple businesses; they pick one via users.active_business_id.
 * When no selection is set we fall back to the most recently created business.
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

  // Which business has the owner explicitly chosen to manage (if any)?
  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("active_business_id")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) {
    return { ok: false, reason: "error", message: profileError.message };
  }
  const activeBusinessId = profile?.active_business_id ?? null;

  // Explicit selection: load exactly that business (must belong to the user).
  // Option B — if it's gone or not theirs, do NOT silently fall back.
  if (activeBusinessId !== null) {
    const { data, error } = await supabase
      .from("businesses")
      .select("id, name, slug, status, plan, is_verified, menu_enabled, menu_mode, external_menu_url")
      .eq("id", activeBusinessId)
      .eq("owner_id", user.id)
      .maybeSingle();

    if (error) {
      return { ok: false, reason: "error", message: error.message };
    }
    if (!data) {
      return {
        ok: false,
        reason: "no_business",
        message: "Your selected business is no longer available. Please choose another.",
      };
    }
    return { ok: true, business: data as ActiveBusiness };
  }

  // No explicit selection: fall back to the most recently created business.
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

// ─── Multi-business support ─────────────────────────────────────────────────────

export interface BusinessListItem {
  id: string;
  name: string;
  slug: string | null;
  is_verified: boolean;
}

/** All businesses owned by the signed-in user (for the business switcher). */
export async function listUserBusinesses(): Promise<BusinessListItem[]> {
  if (!isSupabaseConfigured) return [];
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("businesses")
    .select("id, name, slug, is_verified")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[business] listUserBusinesses:", error);
    return [];
  }
  return (data ?? []) as BusinessListItem[];
}

/**
 * Set (or clear) the owner's active business.
 * Pass null / "" to deselect → resolveActiveBusiness falls back to most-recent.
 * A non-empty id is verified to belong to the user before it's written.
 * Returns true on success, false on any failure.
 */
export async function setActiveBusiness(businessId: string | null): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  // Deselect: clear the active business without an ownership check.
  if (businessId === null || businessId === "") {
    const { error } = await supabase
      .from("users")
      .update({ active_business_id: null })
      .eq("id", user.id);
    if (error) {
      console.error("[business] setActiveBusiness (clear):", error);
      return false;
    }
    return true;
  }

  // Ownership guard: the business must exist and belong to the user.
  const { count, error: checkError } = await supabase
    .from("businesses")
    .select("id", { count: "exact", head: true })
    .eq("id", businessId)
    .eq("owner_id", user.id);
  if (checkError || !count || count === 0) {
    console.error(
      "[business] setActiveBusiness: business not found or not owned",
      checkError ?? businessId,
    );
    return false;
  }

  const { error: updateError } = await supabase
    .from("users")
    .update({ active_business_id: businessId })
    .eq("id", user.id);
  if (updateError) {
    console.error("[business] setActiveBusiness (update):", updateError);
    return false;
  }
  return true;
}
