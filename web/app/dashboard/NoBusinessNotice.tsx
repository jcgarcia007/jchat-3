import Link from "next/link";
import { getTranslations } from "next-intl/server";

/**
 * Shown by /dashboard (layout) to a signed-in account that owns no venue and is not accepted staff of one (B11-7):
 * a plain member who logged in on the web. It explains what the dashboard is for and offers the two ways out. Server component:
 * no JavaScript needed. Uses the global tokens (it renders outside the dashboard theme scope).
 */
export default async function NoBusinessNotice() {
  const t = await getTranslations("dashboardNotice");
  const button: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", justifyContent: "center", minHeight: 44, padding: "0 20px", borderRadius: 10,
    fontSize: 14, fontWeight: 600, textDecoration: "none",
  };
  return (
    <main
      style={{
        minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
        background: "var(--bg-base)", color: "var(--text-primary)",
      }}
    >
      <div
        role="status"
        style={{
          width: "100%", maxWidth: 440, background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 16, padding: 28,
          boxShadow: "0 10px 30px var(--bg-overlay)",
        }}
      >
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 8px" }}>{t("title")}</h1>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: "var(--text-secondary)", margin: "0 0 20px" }}>{t("body")}</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link href="/business/register" style={{ ...button, background: "var(--color-brand)", color: "var(--on-brand)" }}>
            {t("register")}
          </Link>
          <Link href="/" style={{ ...button, background: "var(--bg-elevated)", color: "var(--text-primary)", border: "1px solid var(--border-subtle)" }}>
            {t("back")}
          </Link>
        </div>
      </div>
    </main>
  );
}
