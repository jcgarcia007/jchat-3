import type { Metadata } from "next";
import Link from "next/link";
import { getLocale } from "next-intl/server";
import { H1, LINK, P } from "@/components/help/HelpRender";
import { CHAPTERS, HELP_UI, MANUAL_IDS, MANUAL_META } from "@/content/help/manuals";
import type { HelpLocale } from "@/content/help/types";

export async function generateMetadata(): Promise<Metadata> {
  const locale = (await getLocale()) as HelpLocale;
  const ui = HELP_UI[locale === "es" ? "es" : "en"];
  return {
    title: ui.portadaTitle,
    description: ui.portadaIntro,
    robots: { index: true, follow: true },
    alternates: { canonical: "/help" },
  };
}

export default async function HelpHomePage() {
  const locale: HelpLocale = (await getLocale()) === "es" ? "es" : "en";
  const ui = HELP_UI[locale];

  return (
    <>
      <h1 style={H1}>{ui.portadaTitle}</h1>
      <p style={{ ...P, fontSize: "17px", marginBottom: "28px" }}>{ui.portadaIntro}</p>

      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "16px", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
        {MANUAL_IDS.map((manual) => {
          const meta = MANUAL_META[locale][manual];
          return (
            <li key={manual}>
              <Link
                href={`/help/${manual}`}
                style={{
                  display: "block",
                  height: "100%",
                  padding: "20px",
                  borderRadius: "14px",
                  border: "1px solid var(--gray-200)",
                  background: "rgb(var(--white-rgb))",
                  textDecoration: "none",
                  color: "var(--gray-900)",
                }}
              >
                <span style={{ display: "block", fontSize: "20px", fontWeight: 700, marginBottom: "6px" }}>{meta.title}</span>
                <span style={{ display: "block", color: "var(--gray-700)", lineHeight: 1.5, marginBottom: "10px" }}>{meta.audience}</span>
                <span style={{ display: "block", color: "var(--gray-500)", fontSize: "14px", marginBottom: "12px" }}>{ui.chapterCount(CHAPTERS[manual].length)}</span>
                <span style={{ ...LINK, fontWeight: 600 }}>{ui.openManual}</span>
              </Link>
            </li>
          );
        })}
      </ul>

      <section aria-labelledby="help-contact" style={{ marginTop: "40px" }}>
        <h2 id="help-contact" style={{ fontSize: "20px", fontWeight: 700, margin: "0 0 8px", color: "var(--gray-900)" }}>
          {ui.contactTitle}
        </h2>
        <p style={P}>
          {ui.contactText}{" "}
          <a href={`mailto:${ui.contactEmail}`} style={LINK}>
            {ui.contactEmail}
          </a>
        </p>
      </section>

      <nav aria-label={ui.legalTitle} style={{ marginTop: "24px", display: "flex", flexWrap: "wrap", gap: "8px 20px" }}>
        <Link href="/privacy" style={LINK}>
          {locale === "es" ? "Privacidad" : "Privacy"}
        </Link>
        <Link href="/terms" style={LINK}>
          {locale === "es" ? "Términos" : "Terms"}
        </Link>
        <Link href="/safety" style={LINK}>
          {locale === "es" ? "Seguridad" : "Safety"}
        </Link>
        <Link href="/account/delete" style={LINK}>
          {locale === "es" ? "Eliminar cuenta" : "Delete account"}
        </Link>
      </nav>
    </>
  );
}
