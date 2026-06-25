/**
 * Chat room role badges for the web QR chat (/c/[token]/room).
 * Ported from mobile/services/permissions.ts — same logic, same queries.
 *
 * PRIVACY RULE: callers must never render a badge for incognito messages,
 * regardless of what this map returns. That check lives in the component.
 */

import { supabase, isSupabaseConfigured } from "./supabase";

export type ChatRole = "owner" | "staff" | null;

/**
 * Returns a map of userId → role for a given business room.
 * Owner wins over staff if a user appears in both lists.
 * Returns an empty Map on error or in demo mode.
 */
export async function getBusinessRoleMap(
  businessId: string
): Promise<Map<string, ChatRole>> {
  if (!isSupabaseConfigured) return new Map();

  const [{ data: bizData }, { data: empData }] = await Promise.all([
    supabase
      .from("businesses")
      .select("owner_id")
      .eq("id", businessId)
      .maybeSingle(),
    supabase
      .from("employees")
      .select("user_id")
      .eq("business_id", businessId)
      .eq("status", "accepted"),
  ]);

  const map = new Map<string, ChatRole>();

  if (Array.isArray(empData)) {
    for (const emp of empData) {
      if (emp.user_id) map.set(emp.user_id, "staff");
    }
  }

  // Owner overwrites staff if the same user is in both lists
  const ownerId = (bizData as { owner_id: string } | null)?.owner_id;
  if (ownerId) map.set(ownerId, "owner");

  return map;
}
