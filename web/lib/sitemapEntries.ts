// Pure builder for app/sitemap.ts (H-072). `lastModified` is only set when it is a real date: the page's own
// updated_at for businesses, the legal revision date for the legal pages, nothing for the rest (never "now").

export type SitemapBusiness = { slug: string | null; status: string | null; is_active: boolean | null; updated_at: string | null };

export type SitemapEntry = {
  url: string;
  lastModified?: Date;
  changeFrequency?: "weekly" | "monthly";
  priority: number;
};

export const LEGAL_DATE = new Date("2026-09-21");

/** Only verified, active businesses with a usable slug have a public /b/<slug> card worth indexing. */
export function isIndexableBusiness(b: SitemapBusiness): b is SitemapBusiness & { slug: string } {
  return !!b.slug && /^[a-z0-9][a-z0-9-]*$/i.test(b.slug) && b.status === "verified" && b.is_active === true;
}

/** `helpPaths`: every page of the help center (content/help/manuals.ts helpPaths()); no date, they have no revision date of their own. */
export function buildSitemap(base: string, businesses: SitemapBusiness[], helpPaths: readonly string[] = []): SitemapEntry[] {
  const page = (path: string, priority: number, changeFrequency: SitemapEntry["changeFrequency"], lastModified?: Date): SitemapEntry => ({
    url: `${base}${path}`,
    priority,
    changeFrequency,
    ...(lastModified ? { lastModified } : {}),
  });
  const fixed: SitemapEntry[] = [
    page("", 1, "weekly"),
    page("/pricing", 0.8, "weekly"),
    // /pricing/business is NOT listed until spec 4 publishes it (it also carries robots noindex, see app/pricing/business/layout.tsx).
    page("/download", 0.7, "monthly"),
    page("/privacy", 0.5, "monthly", LEGAL_DATE),
    page("/terms", 0.5, "monthly", LEGAL_DATE),
    page("/support", 0.7, "monthly", LEGAL_DATE),
    page("/safety", 0.6, "monthly", LEGAL_DATE),
    page("/account/delete", 0.5, "monthly", LEGAL_DATE),
    page("/contact", 0.5, "monthly", LEGAL_DATE),
  ];
  const venues = businesses.filter(isIndexableBusiness).map((b) => {
    const updated = b.updated_at ? new Date(b.updated_at) : undefined;
    return page(`/b/${b.slug}`, 0.6, "weekly", updated && !Number.isNaN(updated.getTime()) ? updated : undefined);
  });
  const help = helpPaths.map((path) => page(path, path === "/help" ? 0.7 : 0.6, "monthly"));
  return [...fixed, ...help, ...venues];
}
