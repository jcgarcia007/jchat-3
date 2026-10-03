import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

// The page is a client component, so its translated metadata lives in this server layout.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("pricing.title"), description: t("pricing.description") };
}

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
