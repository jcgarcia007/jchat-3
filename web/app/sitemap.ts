import type { MetadataRoute } from "next";
import { SITE_ORIGIN } from "@/lib/appLinks";
import { createSupabaseAnonServerClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { buildSitemap, type SitemapBusiness } from "@/lib/sitemapEntries";

// Fresh enough for the crawler without querying on every hit.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let businesses: SitemapBusiness[] = [];
  if (isSupabaseConfigured) {
    try {
      const { data } = await createSupabaseAnonServerClient()
        .from("businesses")
        .select("slug, status, is_active, updated_at")
        .eq("status", "verified")
        .eq("is_active", true)
        .order("updated_at", { ascending: false })
        .limit(5000);
      businesses = (data ?? []) as SitemapBusiness[];
    } catch {
      // A failed read must not take the sitemap down: the static pages are still listed.
    }
  }
  return buildSitemap(SITE_ORIGIN, businesses);
}
