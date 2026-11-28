import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { ChapterView, LINK } from "@/components/help/HelpRender";
import { loadChapter, loadManual } from "@/content/help/load";
import { CHAPTERS, HELP_UI, isManualId, MANUAL_META } from "@/content/help/manuals";
import type { HelpLocale } from "@/content/help/types";
import { stripInline } from "@/lib/helpInline";

type Params = Promise<{ manual: string; chapter: string }>;

export function generateStaticParams() {
  return (Object.keys(CHAPTERS) as Array<keyof typeof CHAPTERS>).flatMap((manual) => CHAPTERS[manual].map((chapter) => ({ manual, chapter })));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { manual, chapter: slug } = await params;
  const locale: HelpLocale = (await getLocale()) === "es" ? "es" : "en";
  const chapter = await loadChapter(locale, manual, slug);
  if (!chapter) return { title: HELP_UI[locale].notFoundTitle, robots: { index: false } };
  return {
    title: `${chapter.title} · ${HELP_UI[locale].siteName}`,
    description: stripInline(chapter.summary),
    robots: { index: true, follow: true },
    alternates: { canonical: `/help/${manual}/${slug}` },
  };
}

export default async function ChapterPage({ params }: { params: Params }) {
  const { manual, chapter: slug } = await params;
  if (!isManualId(manual)) notFound();
  const locale: HelpLocale = (await getLocale()) === "es" ? "es" : "en";
  const ui = HELP_UI[locale];
  const chapter = await loadChapter(locale, manual, slug);
  if (!chapter) notFound();

  const chapters = await loadManual(locale, manual);
  const index = chapters.findIndex((c) => c.id === slug);
  const previous = index > 0 ? chapters[index - 1] : null;
  const next = index >= 0 && index < chapters.length - 1 ? chapters[index + 1] : null;
  const meta = MANUAL_META[locale][manual];

  const pagerLink: React.CSSProperties = {
    display: "block",
    padding: "12px 16px",
    borderRadius: "12px",
    border: "1px solid var(--gray-200)",
    background: "rgb(var(--white-rgb))",
    textDecoration: "none",
    color: "var(--gray-900)",
    minWidth: 0,
  };

  return (
    <>
      <nav aria-label="breadcrumb" style={{ fontSize: "14px", marginBottom: "16px", color: "var(--gray-500)" }}>
        <Link href="/help" style={LINK}>
          {ui.breadcrumbHelp}
        </Link>
        <span aria-hidden="true"> / </span>
        <Link href={`/help/${manual}`} style={LINK}>
          {meta.title}
        </Link>
      </nav>

      <ChapterView chapter={chapter} ui={ui} />

      <nav aria-label={ui.navLabel} style={{ marginTop: "40px", display: "grid", gap: "12px", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        {previous ? (
          <Link href={`/help/${manual}/${previous.id}`} style={pagerLink}>
            <span style={{ display: "block", fontSize: "13px", color: "var(--gray-500)" }}>← {ui.previous}</span>
            <span style={{ display: "block", fontWeight: 700 }}>{previous.title}</span>
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link href={`/help/${manual}/${next.id}`} style={{ ...pagerLink, textAlign: "right" }}>
            <span style={{ display: "block", fontSize: "13px", color: "var(--gray-500)" }}>{ui.next} →</span>
            <span style={{ display: "block", fontWeight: 700 }}>{next.title}</span>
          </Link>
        ) : null}
      </nav>
      <p style={{ marginTop: "20px" }}>
        <Link href={`/help/${manual}`} style={LINK}>
          {ui.backToIndex}
        </Link>
      </p>
    </>
  );
}
