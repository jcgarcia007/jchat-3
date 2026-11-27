import type { Metadata } from "next";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { brandFromHost } from "@/lib/brand";

// Tab title follows the brand of the request host (dashboard.tabpos.cloud → Tab POS).
export async function generateMetadata(): Promise<Metadata> {
  const brand = brandFromHost((await headers()).get("host"));
  // Same language as the page body (cookie / Accept-Language through next-intl) — H-070.
  const t = await getTranslations(brand === "tabpos" ? "meta.authTabpos" : "meta.auth");
  return { title: t("title"), description: t("description") };
}

/**
 * Minimal centered shell for auth pages (login, etc.).
 * Uses global Design System tokens — no dashboard theme scope here.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        background: "var(--bg-base)",
        color: "var(--text-primary)",
      }}
    >
      {children}
    </div>
  );
}
