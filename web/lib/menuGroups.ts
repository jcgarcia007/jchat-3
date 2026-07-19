/**
 * Load a menu item's modifier groups, in the shape ModifierSheet expects.
 *
 * Shared by the terminal's take-order screen (bulk, for the whole menu) and the
 * table detail (one dish, on demand when the waiter edits a line). Same bridge
 * table + same parsing as the public menu page, in one place — the choice prices
 * shown to the waiter must come from the same rows the server prices with.
 */

import { supabase } from "@/lib/supabase";
import type { ModGroup } from "@/components/terminal/ModifierSheet";

/** menu_item_id → its modifier groups, ordered by the bridge table's sort. */
export async function loadModifierGroups(itemIds: string[]): Promise<Map<string, ModGroup[]>> {
  const byItem = new Map<string, ModGroup[]>();
  if (itemIds.length === 0) return byItem;

  const bridgeRes = await supabase
    .from("menu_item_modifier_groups")
    .select("menu_item_id, modifier_group_id, sort")
    .in("menu_item_id", itemIds)
    .order("sort");
  if (bridgeRes.error) throw bridgeRes.error;
  const bridge = (bridgeRes.data ?? []) as { menu_item_id: string; modifier_group_id: string }[];

  const groupIds = [...new Set(bridge.map((b) => b.modifier_group_id))];
  if (groupIds.length === 0) return byItem;

  const gRes = await supabase
    .from("modifier_groups")
    .select("id, label, type, min_select, max_select, choices")
    .in("id", groupIds);
  if (gRes.error) throw gRes.error;

  const byId = new Map<string, ModGroup>(
    ((gRes.data ?? []) as Record<string, unknown>[]).map((g) => [
      g.id as string,
      {
        id: g.id as string,
        label: g.label as string,
        type: (g.type === "multi" ? "multi" : "single") as "single" | "multi",
        min_select: (g.min_select as number) ?? 0,
        max_select: (g.max_select as number) ?? 1,
        choices: (Array.isArray(g.choices) ? g.choices : [])
          .filter((c): c is Record<string, unknown> => !!c && typeof c === "object")
          .map((c) => ({
            label: typeof c.label === "string" ? c.label : String(c.label ?? ""),
            price_cents: typeof c.price_cents === "number" ? c.price_cents : 0,
          })),
      },
    ]),
  );

  for (const b of bridge) {
    const g = byId.get(b.modifier_group_id);
    if (!g) continue;
    const arr = byItem.get(b.menu_item_id) ?? [];
    arr.push(g);
    byItem.set(b.menu_item_id, arr);
  }
  return byItem;
}
