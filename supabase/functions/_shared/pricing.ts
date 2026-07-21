/**
 * Shared server-side price calculator — the ONE source of truth about line prices.
 *
 * Extracted from payments/index.ts so every flow that must NOT trust client amounts
 * (customer checkout, waiter orders, editing a dish, guest checkout) prices from the
 * same code. Both modifier systems (legacy menu_items.options sizes/extras and the
 * modifier_groups.choices system) resolve here. Every price comes from the DB.
 *
 * Deno Edge Functions: lives in _shared and is bundled into each function that
 * imports it via `../_shared/pricing.ts` (same mechanism as _shared/connect.ts).
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.44.4";

// deno-lint-ignore no-explicit-any
type Db = SupabaseClient<any, "public", any>;

// 8% fallback when businesses.tax_rate IS NULL — matches the client default.
export const TAX_FALLBACK = 0.08;

/**
 * THE tax rounding. Every flow must round identically — two roundings of the same
 * subtotal that differ by a cent is a money bug that only shows up in reconciliation.
 */
export function computeTaxCents(subtotalCents: number, taxRate: number): number {
  return Math.round(subtotalCents * taxRate);
}

/**
 * FIX #6: resolve the DB price of a line's legacy size/extras selection, reading
 * prices from the server-owned menu_items.options jsonb — never the client.
 */
function resolveModifierCents(
  // deno-lint-ignore no-explicit-any
  row: any,
  options: Record<string, unknown> | undefined,
  itemName: string,
): { cents: number } | { error: string } {
  const sel = options ?? {};
  const sizes = (row.options?.sizes ?? []) as Array<{ label?: string; price_cents?: number }>;
  const extras = (row.options?.extras ?? []) as Array<{ label?: string; price_cents?: number }>;
  let cents = 0;

  const selSize = typeof sel.size === "string" ? sel.size : null;
  if (selSize) {
    const match = sizes.find((s) => s.label === selSize);
    if (!match) return { error: `Invalid size "${selSize}" for ${itemName}` };
    cents += typeof match.price_cents === "number" ? match.price_cents : 0;
  }

  const selExtras = Array.isArray(sel.extras) ? sel.extras : [];
  for (const label of selExtras) {
    if (typeof label !== "string") continue;
    const match = extras.find((e) => e.label === label);
    if (!match) return { error: `Invalid extra "${label}" for ${itemName}` };
    cents += typeof match.price_cents === "number" ? match.price_cents : 0;
  }

  return { cents };
}

/**
 * Resolve the DB price of a line's modifier-group selections (new system). The
 * client sends only { g: groupId, c: [choiceLabel] }; ALL prices come from
 * modifier_groups.choices. Rejects unknown groups/choices. Returns the cents to add
 * + the verified labels (for the kitchen), or { error } for a 400.
 */
function resolveGroupModifierCents(
  itemId: string,
  itemName: string,
  selections: unknown,
  // deno-lint-ignore no-explicit-any
  groupsByItem: Map<string, Map<string, any>>,
): { cents: number; labels: string[] } | { error: string } {
  if (!Array.isArray(selections) || selections.length === 0) return { cents: 0, labels: [] };
  // deno-lint-ignore no-explicit-any
  const groups = groupsByItem.get(itemId) ?? new Map<string, any>();
  let cents = 0;
  const labels: string[] = [];
  // deno-lint-ignore no-explicit-any
  for (const sel of selections as any[]) {
    const gid = typeof sel?.g === "string" ? sel.g : null;
    if (!gid) return { error: `Invalid modifier group for ${itemName}` };
    const group = groups.get(gid);
    if (!group) return { error: `Modifier group not available for ${itemName}` };
    const choices = Array.isArray(group.choices) ? group.choices : [];
    const chosen = Array.isArray(sel.c) ? sel.c : [];
    for (const label of chosen) {
      if (typeof label !== "string") continue;
      // deno-lint-ignore no-explicit-any
      const match = choices.find((c: any) => c?.label === label);
      if (!match) return { error: `Invalid choice "${label}" for ${itemName}` };
      cents += typeof match.price_cents === "number" ? match.price_cents : 0;
      labels.push(label);
    }
  }
  return { cents, labels };
}

/** Minimum shape a line needs to be priced. */
export interface PriceableItem {
  menu_item_id: string;
  qty: number;
  options?: Record<string, unknown>;
}

export interface PricedLines {
  /** Per-line unit price: DB base + DB modifiers. Index-aligned with items[]. */
  lineUnitCents: number[];
  /** Server-VERIFIED option labels per line (what the kitchen should see). */
  resolvedOptions: Record<string, unknown>[];
  /** Sum of lineUnitCents[i] * items[i].qty. */
  subtotalCents: number;
}

/**
 * Validate each line against the DB (exists / same business / available), resolve
 * both modifier systems, and return server-owned amounts. Client price_cents and any
 * prices in it.options are ignored. Returns { error, status } so callers own the HTTP shape.
 */
export async function priceLinesFromDb(
  db: Db,
  businessId: string,
  items: PriceableItem[],
): Promise<PricedLines | { error: string; status?: number }> {
  // De-duplicate IDs for the IN query; duplicates in items[] are intentional
  // (same dish added twice → two cart lines) and summed in recalculation below.
  const itemIds = [...new Set(items.map((it) => it.menu_item_id))];
  const { data: dbItems, error: itemsErr } = await db
    .from("menu_items")
    .select("id, price_cents, is_available, business_id, name, options")
    .in("id", itemIds);
  if (itemsErr) return { error: `DB error fetching items: ${itemsErr.message}`, status: 500 };

  // deno-lint-ignore no-explicit-any
  const dbMap = new Map<string, any>((dbItems ?? []).map((r: any) => [r.id as string, r]));

  for (const it of items) {
    const row = dbMap.get(it.menu_item_id);
    if (!row)                           return { error: `Item not found: ${it.menu_item_id}` };
    if (row.business_id !== businessId) return { error: "Item does not belong to this business" };
    if (!row.is_available)              return { error: `Item not available: ${row.name}` };
  }

  // Modifier groups linked to the ordered items (new system). Prices come from here,
  // never from the client.
  const { data: mimgRows, error: mgErr } = await db
    .from("menu_item_modifier_groups")
    .select("menu_item_id, modifier_groups(id, label, choices)")
    .in("menu_item_id", itemIds);
  if (mgErr) return { error: `DB error fetching modifier groups: ${mgErr.message}`, status: 500 };

  // menu_item_id → (group_id → group)
  // deno-lint-ignore no-explicit-any
  const groupsByItem = new Map<string, Map<string, any>>();
  // deno-lint-ignore no-explicit-any
  for (const row of (mimgRows ?? []) as any[]) {
    const g = Array.isArray(row.modifier_groups) ? row.modifier_groups[0] : row.modifier_groups;
    if (!g) continue;
    const mid = row.menu_item_id as string;
    if (!groupsByItem.has(mid)) groupsByItem.set(mid, new Map());
    groupsByItem.get(mid)!.set(g.id as string, g);
  }

  // Uses DB base price per item AND DB modifier prices; the client's price_cents
  // and any prices inside it.options are ignored.
  const lineUnitCents: number[] = [];
  const resolvedOptions: Record<string, unknown>[] = [];
  for (const it of items) {
    const row = dbMap.get(it.menu_item_id)!;
    const legacy = resolveModifierCents(row, it.options, row.name as string);
    if ("error" in legacy) return { error: legacy.error };
    const mods = resolveGroupModifierCents(
      it.menu_item_id,
      row.name as string,
      (it.options as Record<string, unknown> | undefined)?.modifiers,
      groupsByItem,
    );
    if ("error" in mods) return { error: mods.error };

    lineUnitCents.push((row.price_cents as number) + legacy.cents + mods.cents);

    const sel = (it.options ?? {}) as Record<string, unknown>;
    resolvedOptions.push({
      ...(typeof sel.size === "string" ? { size: sel.size } : {}),
      ...(Array.isArray(sel.extras) && sel.extras.length ? { extras: sel.extras } : {}),
      ...(mods.labels.length ? { modifiers: mods.labels } : {}),
    });
  }

  const subtotalCents = items.reduce((sum, it, idx) => sum + lineUnitCents[idx] * it.qty, 0);
  return { lineUnitCents, resolvedOptions, subtotalCents };
}
