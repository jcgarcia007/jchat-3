import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

// The page is a client component, so its translated metadata lives in this server layout.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("nearby.title"), description: t("nearby.description") };
}

export default function NearbyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
