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
    .select('*')
    .eq('business_id', businessId)
    .eq('is_published', true)
    .order('sort', { ascending: true });
  if (itemErr) throw itemErr;

  const byCat = new Map<string, MenuItem[]>();
  for (const it of (items ?? []) as unknown as MenuItem[]) {
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
    .select('*')
    .eq('id', itemId)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as MenuItem) ?? null;
}
