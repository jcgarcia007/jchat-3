import Link from "next/link";
import { getLocale } from "next-intl/server";
import LegalLangToggle from "./LegalLangToggle";

export default async function LegalLayout({ children }: { children: React.ReactNode }) {
  const isEs = (await getLocale()) === "es";

  return (
    <div
      style={{
        colorScheme: "light",
        minHeight: "100vh",
        background: "var(--land-bg)",
        color: "var(--gray-900)",
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      {/* Header */}
      <header
        style={{
          borderBottom: "1px solid var(--gray-200)",
          background: "rgb(var(--white-rgb))",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <div
          style={{
            maxWidth: "760px",
            margin: "0 auto",
            padding: "14px 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Link
            href="/"
            style={{
              fontWeight: 800,
              fontSize: "20px",
              color: "var(--color-brand)",
              textDecoration: "none",
              letterSpacing: "-0.5px",
            }}
          >
            JChat
          </Link>
          <LegalLangToggle />
        </div>
      </header>

      {/* Page content */}
      <main
        style={{
          maxWidth: "760px",
          margin: "0 auto",
          padding: "48px 24px 96px",
        }}
      >
        {children}
      </main>

      {/* Footer */}
      <footer style={{ borderTop: "1px solid var(--gray-200)", background: "rgb(var(--white-rgb))" }}>
        <div
          style={{
            maxWidth: "760px",
            margin: "0 auto",
            padding: "20px 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "12px",
            fontSize: "13px",
            color: "var(--gray-500)",
          }}
        >
          <nav style={{ display: "flex", gap: "20px" }}>
            <Link href="/privacy" style={{ color: "var(--gray-500)", textDecoration: "none" }}>
              {isEs ? "Privacidad" : "Privacy"}
            </Link>
            <Link href="/terms" style={{ color: "var(--gray-500)", textDecoration: "none" }}>
              {isEs ? "Términos" : "Terms"}
            </Link>
            <Link href="/support" style={{ color: "var(--gray-500)", textDecoration: "none" }}>
              {isEs ? "Soporte" : "Support"}
            </Link>
          </nav>
          <span>© 2026 Otunity Labs LLC</span>
        </div>
      </footer>
    </div>
  );
}
