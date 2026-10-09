import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { DeleteAccountClient } from "./DeleteAccountClient";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return {
    title: t("legal.accountDelete.title"),
    description: t("legal.accountDelete.description"),
    // This is the URL given to Google Play (Data safety → account deletion): it must be public and indexable.
    robots: { index: true, follow: true },
  };
}

export default function AccountDeletePage() {
  return <DeleteAccountClient />;
}
