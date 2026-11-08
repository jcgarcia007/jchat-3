import type { Metadata } from "next";
import { Big_Shoulders } from "next/font/google";
import { getTranslations } from "next-intl/server";

// The page is a client component, so its translated metadata lives in this server layout (same pattern as /download).
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return {
    title: t("pricingBusiness.title"),
    description: t("pricingBusiness.description"),
    // Built but not published: reachable only by typing the URL. Remove this line (and add the page back to app/sitemap.ts) — activar en spec 4.
    robots: { index: false, follow: false },
  };
}

// Display face of the "MÁS PEDIDO" stamp only (Google Fonts merged "Big Shoulders Display" into the "Big Shoulders" family). Self-hosted by next/font (CSP font-src 'self'); weight 800, latin subset.
const bigShoulders = Big_Shoulders({
  variable: "--font-big-shoulders",
  subsets: ["latin"],
  weight: "800",
  display: "swap",
});

export default function PricingBusinessLayout({ children }: { children: React.ReactNode }) {
  return <div className={bigShoulders.variable}>{children}</div>;
}
