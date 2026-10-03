import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { PrivacyEN } from "@/content/legal/privacy.en";
import { PrivacyES } from "@/content/legal/privacy.es";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return {
    title: t("legal.privacy.title"),
    description: t("legal.privacy.description"),
    robots: { index: true, follow: true },
  };
}

export default async function PrivacyPage() {
  const locale = await getLocale();
  return locale === "es" ? <PrivacyES /> : <PrivacyEN />;
}
