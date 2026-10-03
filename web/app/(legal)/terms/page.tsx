import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { TermsEN } from "@/content/legal/terms.en";
import { TermsES } from "@/content/legal/terms.es";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return {
    title: t("legal.terms.title"),
    description: t("legal.terms.description"),
    robots: { index: true, follow: true },
  };
}

export default async function TermsPage() {
  const locale = await getLocale();
  return locale === "es" ? <TermsES /> : <TermsEN />;
}
