/**
 * JChat 3.0 — Public Menu Page
 *
 * Route: /m/[slug]
 * Auth: NONE — fully public. menu_categories, menu_items and menu_item_photos
 * all have RLS SELECT = true.
 *
 * Server Component: fetches business + categories + items + photos, then hands
 * everything to <MenuPageClient> for interactive cart / customizer / pickup.
 *
 * Next.js 16: params is a Promise — must be awaited.
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  createSupabaseServerClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";
import type { Json } from "@/lib/database.types";
import MenuPageClient from "./MenuPageClient";

// ── Types (shared via export so MenuPageClient can import them) ───────────────

export interface MenuItemOption {
  label: string;
  price_cents: number;
}

export interface ItemOptions {
  sizes: MenuItemOption[];
  extras: MenuItemOption[];
}

export interface MenuPhoto {
  id: string;
  menu_item_id: string;
  url: string;
  sort: number;
}

export interface PublicMenuItem {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  price_cents: number;
  photo_url: string | null;
  dietary_tags: string[];
  badge: string | null;
  stock_count: number | null;
  options: ItemOptions;
  sort: number;
  photos: MenuPhoto[];
}

export interface PublicMenuCategory {
  id: string;
  name: string;
  icon: string | null;
  sort: number;
  items: PublicMenuItem[];
}

export interface PublicBusiness {
  id: string;
  slug: string;
  name: string;
  category: string | null;
  description: string | null;
  cover_url: string | null;
  icon_emoji: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseOptions(raw: Json | null | undefined): ItemOptions {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { sizes: [], extras: [] };
  }
  const obj = raw as Record<string, unknown>;
  const sizes = Array.isArray(obj.sizes)
    ? (obj.sizes as MenuItemOption[]).filter(
        (s) => s && typeof s.label === "string"
      )
    : [];
  const extras = Array.isArray(obj.extras)
    ? (obj.extras as MenuItemOption[]).filter(
        (e) => e && typeof e.label === "string"
      )
    : [];
  return { sizes, extras };
}

// ── Data fetching ─────────────────────────────────────────────────────────────

async function getMenuData(slug: string): Promise<{
  business: PublicBusiness;
  categories: PublicMenuCategory[];
} | null> {
  if (!isSupabaseConfigured) return null;

  const supabase = await createSupabaseServerClient();

  const { data: biz, error: bizErr } = await supabase
    .from("businesses")
    .select("id, slug, name, category, description, cover_url, icon_emoji")
    .eq("slug", slug)
    .single();

  if (bizErr || !biz) return null;

  const business: PublicBusiness = {
    id: biz.id,
    slug: biz.slug,
    name: biz.name,
    category: biz.category ?? null,
    description: biz.description ?? null,
    cover_url: biz.cover_url ?? null,
    icon_emoji: biz.icon_emoji ?? null,
  };

  // Published categories ordered by sort
  const { data: cats } = await supabase
    .from("menu_categories")
    .select("id, name, icon, sort")
    .eq("business_id", biz.id)
    .eq("is_published", true)
    .order("sort");

  if (!cats || cats.length === 0) {
    return { business, categories: [] };
  }

  // All published items for this business
  const { data: rawItems } = await supabase
    .from("menu_items")
    .select(
      "id, category_id, name, description, price_cents, photo_url, dietary_tags, badge, stock_count, options, sort"
    )
    .eq("business_id", biz.id)
    .eq("is_published", true)
    .order("sort");

  const items = rawItems ?? [];
  const itemIds = items.map((i) => i.id);

  // Photos for all items (one query, then group client-side)
  let photos: MenuPhoto[] = [];
  if (itemIds.length > 0) {
    const { data: rawPhotos } = await supabase
      .from("menu_item_photos")
      .select("id, menu_item_id, url, sort")
      .in("menu_item_id", itemIds)
      .order("sort");
    photos = (rawPhotos ?? []) as MenuPhoto[];
  }

  // Group photos by item id
  const photosByItem: Record<string, MenuPhoto[]> = {};
  for (const p of photos) {
    if (!photosByItem[p.menu_item_id]) photosByItem[p.menu_item_id] = [];
    photosByItem[p.menu_item_id].push(p);
  }

  // Assemble categories with their items
  const categories: PublicMenuCategory[] = cats.map((cat) => ({
    id: cat.id,
    name: cat.name,
    icon: cat.icon ?? null,
    sort: cat.sort,
    items: items
      .filter((i) => i.category_id === cat.id)
      .map((i) => ({
        id: i.id,
        category_id: i.category_id,
        name: i.name,
        description: i.description ?? null,
        price_cents: i.price_cents,
        photo_url: i.photo_url ?? null,
        dietary_tags: ((i.dietary_tags ?? []) as string[]),
        badge: i.badge ?? null,
        stock_count: i.stock_count ?? null,
        options: parseOptions(i.options as Json | null),
        sort: i.sort,
        photos: photosByItem[i.id] ?? [],
      })),
  }));

  return { business, categories };
}

// ── SEO ───────────────────────────────────────────────────────────────────────

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const data = await getMenuData(slug);
  if (!data) return { title: "Menú no encontrado — JChat" };

  const { business: biz } = data;
  const title = `Menú · ${biz.name}`;
  const description =
    biz.description ?? `Ver el menú de ${biz.name} y hacer tu pedido.`;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      siteName: "JChat",
      ...(biz.cover_url
        ? { images: [{ url: biz.cover_url, alt: biz.name }] }
        : {}),
    },
    twitter: {
      card: biz.cover_url ? "summary_large_image" : "summary",
      title,
      description,
      ...(biz.cover_url ? { images: [biz.cover_url] } : {}),
    },
  };
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function MenuPublicPage({ params }: PageProps) {
  const { slug } = await params;
  const data = await getMenuData(slug);

  if (!data && isSupabaseConfigured) notFound();

  if (!data) {
    return (
      <main
        data-theme="dark"
        style={{
          background: "var(--bg-base)",
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>
          Configura Supabase para ver el menú.
        </p>
      </main>
    );
  }

  return (
    <MenuPageClient
      business={data.business}
      categories={data.categories}
    />
  );
}
