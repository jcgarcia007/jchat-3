import { getTranslations } from "next-intl/server";

export default async function ReportsPage() {
  const t = await getTranslations("dashboardCommon");
  return (
    <div>
      <h1
        style={{
          fontSize: "22px",
          fontWeight: 700,
          color: "var(--db-text-primary)",
          marginBottom: "8px",
        }}
      >
        {t("navReports")}
      </h1>
      <p style={{ fontSize: "14px", color: "var(--db-text-secondary)" }}>
        {t("reportsPlaceholderBody")}
      </p>
    </div>
  );
}
