/**
 * JChat 3.0 — Menu data access (Stage 3, shared by menu/cart/checkout)
 * Reads published menu categories + items for a business.
 * Tables: menu_categories, menu_items (001 + 007_stage3_schema.sql).
 */

import { supabase, isSupabaseConfigured } from './supabase';

export interface MenuOptionChoice {
  label: string;
  price_cents: number;
}

export interface MenuItemOptions {
  /** Required single-choice options (e.g. size). */
  sizes?: MenuOptionChoice[];
  /** Optional multi-choice add-ons. */
  extras?: MenuOptionChoice[];
}

export interface MenuItem {
  id: string;
  category_id: string;
  business_id: string;
  name: string;
  description: string | null;
  price_cents: number;
  photo_url: string | null;
  dietary_tags: string[];
  id_required: boolean;
  badge: 'best_seller' | 'new' | 'hot' | null;
  is_available: boolean;
  is_published: boolean;
  stock_count: number | null;
  options: MenuItemOptions;
  sort: number;
  /** True when the item has linked modifier groups (new Uber-Eats-style system). */
  has_modifiers: boolean;
}

export interface MenuCategory {
  id: string;
  business_id: string;
  name: string;
  icon: string | null;
  sort: number;
  is_published: boolean;
  items: MenuItem[];
}

/**
 * Map a raw menu_items row (with an embedded `menu_item_modifier_groups(count)`)
 * to a MenuItem: derive has_modifiers from the count and strip the nested field.
 */
function mapMenuItem(raw: Record<string, unknown>): MenuItem {
  const nested = raw.menu_item_modifier_groups;
  const linkCount = Array.isArray(nested)
    ? ((nested[0] as { count?: number } | undefined)?.count ?? 0)
    : 0;
  const { menu_item_modifier_groups: _omit, ...rest } = raw;
  void _omit;
  return { ...rest, has_modifiers: linkCount > 0 } as unknown as MenuItem;
}

/** Fetch the published menu (categories with their items) for a business. */
export async function getMenu(businessId: string): Promise<MenuCategory[]> {
  if (!isSupabaseConfigured) return [];
  const { data: cats, error: catErr } = await supabase
    .from('menu_categories')
    .select('*')
    .eq('business_id', businessId)
    .eq('is_published', true)
    .order('sort', { ascending: true });
  if (catErr) throw catErr;

  const { data: items, error: itemErr } = await supabase
    .from('menu_items')
    // Embedded count of linked modifier groups (one-to-many; FK unambiguous).
    .select('*, menu_item_modifier_groups(count)')
    .eq('business_id', businessId)
    .eq('is_published', true)
    .order('sort', { ascending: true });
  if (itemErr) throw itemErr;

  const byCat = new Map<string, MenuItem[]>();
  for (const raw of (items ?? []) as Record<string, unknown>[]) {
    const it = mapMenuItem(raw);
    // Auto-hide out-of-stock items (stock_count === 0)
    if (it.stock_count === 0) continue;
    const arr = byCat.get(it.category_id) ?? [];
    arr.push(it);
    byCat.set(it.category_id, arr);
  }

  return ((cats ?? []) as unknown as MenuCategory[]).map((c) => ({
    ...c,
    items: byCat.get(c.id) ?? [],
  }));
}

export async function getMenuItem(itemId: string): Promise<MenuItem | null> {
  if (!isSupabaseConfigured) return null;
  const { data, error } = await supabase
    .from('menu_items')
    .select('*, menu_item_modifier_groups(count)')
    .eq('id', itemId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapMenuItem(data as Record<string, unknown>) : null;
}

// ── Modifier groups (new Uber-Eats-style system; migrations 030-032) ──────────

export interface ModifierChoice {
  label: string;
  price_cents: number;
}

export interface ModifierGroup {
  id: string;
  label: string;
  type: 'single' | 'multi';
  min_select: number;
  max_select: number;
  choices: ModifierChoice[];
}

/** Fetch modifier groups (with choices) linked to a menu item, in link order. */
export async function getItemModifierGroups(itemId: string): Promise<ModifierGroup[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from('menu_item_modifier_groups')
    .select('sort, modifier_groups(id, label, type, min_select, max_select, choices)')
    .eq('menu_item_id', itemId)
    .order('sort', { ascending: true });
  if (error) throw error;

  const groups: ModifierGroup[] = [];
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    // Many-to-one → PostgREST returns an object; tolerate an array shape just in case.
    const rel = row.modifier_groups;
    const g = (Array.isArray(rel) ? rel[0] : rel) as ModifierGroup | null | undefined;
    if (g) {
      groups.push({
        ...g,
        choices: Array.isArray(g.choices) ? g.choices : [],
      });
    }
  }
  return groups;
}
