import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { ContactEN } from "@/content/legal/contact.en";
import { ContactES } from "@/content/legal/contact.es";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return {
    title: t("legal.contact.title"),
    description: t("legal.contact.description"),
    robots: { index: true, follow: true },
  };
}

export default async function ContactPage() {
  const locale = await getLocale();
  return locale === "es" ? <ContactES /> : <ContactEN />;
}
