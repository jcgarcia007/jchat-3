"use client";

// Empty menu state — moved verbatim from MenuPageClient.

import { useTranslations } from "next-intl";

export function EmptyMenu({ bizName }: { bizName: string }) {
  const t = useTranslations("menu");
  return (
    <div
      style={{
        textAlign: "center",
        padding: "60px 24px",
        color: "var(--text-tertiary)",
      }}
    >
      <div style={{ fontSize: 48, marginBottom: 12 }}>🍽️</div>
      <h2
        style={{
          fontSize: 16,
          fontWeight: 600,
          color: "var(--text-secondary)",
          margin: "0 0 8px",
        }}
      >
        {t("emptyMenuTitle", { bizName })}
      </h2>
      <p style={{ fontSize: 13, margin: 0, lineHeight: 1.6 }}>
        {t("emptyMenuBody")}
      </p>
    </div>
  );
}
