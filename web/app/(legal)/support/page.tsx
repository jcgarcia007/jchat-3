import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { SupportEN } from "@/content/legal/support.en";
import { SupportES } from "@/content/legal/support.es";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return {
    title: t("legal.support.title"),
    description: t("legal.support.description"),
    robots: { index: true, follow: true },
  };
}

export default async function SupportPage() {
  const locale = await getLocale();
  return locale === "es" ? <SupportES /> : <SupportEN />;
}
