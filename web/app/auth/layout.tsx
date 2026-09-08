import type { Metadata } from "next";
import { headers } from "next/headers";
import { brandFromHost } from "@/lib/brand";

// Tab title follows the brand of the request host (dashboard.tabpos.cloud → Tab POS).
export async function generateMetadata(): Promise<Metadata> {
  const brand = brandFromHost((await headers()).get("host"));
  if (brand === "tabpos") {
    return {
      title: "Iniciar sesión — Tab POS",
      description: "Accede a tu punto de venta Tab POS",
    };
  }
  return {
    title: "Sign in — JChat",
    description: "Sign in to your JChat business dashboard",
  };
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
