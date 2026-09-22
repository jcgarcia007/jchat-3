import type { Metadata } from "next";
import { cookies } from "next/headers";
import { SupportEN } from "@/content/legal/support.en";
import { SupportES } from "@/content/legal/support.es";

export const metadata: Metadata = {
  title: "Help & Support — JChat",
  description:
    "Get help with JChat: delete your account, report users, manage orders and contact Otunity Labs.",
  robots: { index: true, follow: true },
};

export default async function SupportPage() {
  const cookieStore = await cookies();
  const locale = cookieStore.get("jchat-lang")?.value === "es" ? "es" : "en";
  return locale === "es" ? <SupportES /> : <SupportEN />;
}
