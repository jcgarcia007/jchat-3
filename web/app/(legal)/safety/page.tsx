import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { SafetyEN } from "@/content/legal/safety.en";
import { SafetyES } from "@/content/legal/safety.es";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return {
    title: t("legal.safety.title"),
    description: t("legal.safety.description"),
    robots: { index: true, follow: true },
  };
}

export default async function SafetyPage() {
  const locale = await getLocale();
  return locale === "es" ? <SafetyES /> : <SafetyEN />;
}
