import type { Metadata } from "next";
import { cookies } from "next/headers";
import { PrivacyEN } from "@/content/legal/privacy.en";
import { PrivacyES } from "@/content/legal/privacy.es";

export const metadata: Metadata = {
  title: "Privacy Policy — JChat",
  description:
    "How JChat (operated by Otunity Labs LLC) collects, uses and protects your information.",
  robots: { index: true, follow: true },
};

export default async function PrivacyPage() {
  const cookieStore = await cookies();
  const locale = cookieStore.get("jchat-lang")?.value === "es" ? "es" : "en";
  return locale === "es" ? <PrivacyES /> : <PrivacyEN />;
}
