import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { H1, H2, InlineText, LINK, P } from "@/components/help/HelpRender";
import { loadManual } from "@/content/help/load";
import { HELP_UI, isManualId, MANUAL_IDS, MANUAL_META } from "@/content/help/manuals";
import type { HelpLocale } from "@/content/help/types";
import { stripInline } from "@/lib/helpInline";

export function generateStaticParams() {
  return MANUAL_IDS.map((manual) => ({ manual }));
}

export async function generateMetadata({ params }: { params: Promise<{ manual: string }> }): Promise<Metadata> {
  const { manual } = await params;
  const locale: HelpLocale = (await getLocale()) === "es" ? "es" : "en";
  if (!isManualId(manual)) return { title: HELP_UI[locale].notFoundTitle, robots: { index: false } };
  const meta = MANUAL_META[locale][manual];
  return {
    title: `${meta.title} · ${HELP_UI[locale].siteName}`,
    description: stripInline(meta.description),
    robots: { index: true, follow: true },
    alternates: { canonical: `/help/${manual}` },
  };
}

export default async function ManualIndexPage({ params }: { params: Promise<{ manual: string }> }) {
  const { manual } = await params;
  if (!isManualId(manual)) notFound();
  const locale: HelpLocale = (await getLocale()) === "es" ? "es" : "en";
  const ui = HELP_UI[locale];
  const meta = MANUAL_META[locale][manual];
  const chapters = await loadManual(locale, manual);

  return (
    <>
      <nav aria-label="breadcrumb" style={{ fontSize: "14px", marginBottom: "16px", color: "var(--gray-500)" }}>
        <Link href="/help" style={LINK}>
          {ui.breadcrumbHelp}
        </Link>
        <span aria-hidden="true"> / </span>
        <span>{meta.title}</span>
      </nav>

      <h1 style={H1}>{meta.title}</h1>
      <p style={{ ...P, fontSize: "17px" }}>{meta.audience}. {meta.description}</p>

      <h2 style={H2}>{ui.chaptersTitle}</h2>
      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "12px" }}>
        {chapters.map((chapter, i) => (
          <li key={chapter.id}>
            <Link
              href={`/help/${manual}/${chapter.id}`}
              style={{
                display: "block",
                padding: "14px 18px",
                borderRadius: "12px",
                border: "1px solid var(--gray-200)",
                background: "rgb(var(--white-rgb))",
                textDecoration: "none",
                color: "var(--gray-900)",
              }}
            >
              <span style={{ display: "block", fontWeight: 700, marginBottom: "2px" }}>
                {i + 1}. {chapter.title}
              </span>
              <span style={{ display: "block", color: "var(--gray-700)", lineHeight: 1.5 }}>
                <InlineText text={chapter.summary} />
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </>
  );
}
