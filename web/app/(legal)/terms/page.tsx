import type { Metadata } from "next";
import { cookies } from "next/headers";
import { TermsEN } from "@/content/legal/terms.en";
import { TermsES } from "@/content/legal/terms.es";

export const metadata: Metadata = {
  title: "Terms of Service — JChat",
  description:
    "The Terms of Service governing use of JChat and related services by Otunity Labs LLC.",
  robots: { index: true, follow: true },
};

export default async function TermsPage() {
  const cookieStore = await cookies();
  const locale = cookieStore.get("jchat-lang")?.value === "es" ? "es" : "en";
  return locale === "es" ? <TermsES /> : <TermsEN />;
}
