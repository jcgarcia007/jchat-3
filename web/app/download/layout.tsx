import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

// The page is a client component, so its translated metadata lives in this server layout.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("download.title"), description: t("download.description") };
}

export default function DownloadLayout({ children }: { children: React.ReactNode }) {
  return children;
}
