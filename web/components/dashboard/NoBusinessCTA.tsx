"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { IconBuildingStore, IconArrowRight } from "@tabler/icons-react";

/**
 * Shown on dashboard pages when the signed-in account has no business.
 * Uses --db-* design tokens only.
 *
 * Client Component: every caller today is a "use client" dashboard page.tsx,
 * so this can't be an async Server Component (getTranslations() needs
 * next/headers, which isn't available once bundled for the client).
 */
export function NoBusinessCTA({ message }: { message?: string }) {
  const t = useTranslations("dashboardCommon");
  return (
    <section
      style={{
        background: "var(--db-bg-surface)",
        border: "1px solid var(--db-border)",
        borderRadius: "14px",
        padding: "32px 24px",
        maxWidth: "640px",
        textAlign: "center",
      }}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: "52px",
          height: "52px",
          borderRadius: "14px",
          background: "var(--db-accent-bg)",
          color: "var(--db-accent)",
          marginBottom: "14px",
        }}
      >
        <IconBuildingStore size={28} />
      </span>
      <h2 style={{ fontSize: "17px", fontWeight: 700, color: "var(--db-text-primary)", margin: "0 0 6px" }}>
        {t("noBusinessTitle")}
      </h2>
      <p
        style={{
          fontSize: "13px",
          color: "var(--db-text-secondary)",
          margin: "0 auto 18px",
          maxWidth: "420px",
        }}
      >
        {message ?? t("noBusinessDefaultMessage")}
      </p>
      <Link
        href="/business/register"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "8px",
          padding: "11px 18px",
          borderRadius: "10px",
          background: "var(--db-accent)",
          color: "var(--db-accent-text)",
          fontSize: "14px",
          fontWeight: 600,
          textDecoration: "none",
        }}
      >
        <IconBuildingStore size={18} />
        {t("registerBusinessLink")}
        <IconArrowRight size={16} />
      </Link>
    </section>
  );
}
