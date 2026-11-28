/**
 * The ONE template of the help center: paints a HelpChapter (content/help/types.ts) with the look of the legal pages (always light, tokens only).
 * Server component. Headings go h1 (chapter) → h2 (sections); the layout around it owns the single <main>.
 */

import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import type { HelpUi } from "@/content/help/manuals";
import type { HelpBlock, HelpChapter } from "@/content/help/types";
import { parseInline } from "@/lib/helpInline";

export const H1: React.CSSProperties = { fontSize: "28px", fontWeight: 800, color: "var(--gray-900)", margin: "0 0 8px", letterSpacing: "-0.5px", lineHeight: 1.2 };
export const H2: React.CSSProperties = { fontSize: "20px", fontWeight: 700, color: "var(--gray-900)", margin: "36px 0 10px", lineHeight: 1.3 };
export const P: React.CSSProperties = { lineHeight: 1.7, margin: "0 0 14px", color: "var(--gray-700)" };
export const LINK: React.CSSProperties = { color: "var(--color-brand-text-light)", textDecoration: "underline" };
const LIST: React.CSSProperties = { lineHeight: 1.8, paddingLeft: "22px", margin: "0 0 14px", color: "var(--gray-700)" };

/** A text with its inline markup (`**bold**`, `[label](/path)`) as React nodes. */
export function InlineText({ text }: { text: string }): ReactNode {
  return (
    <>
      {parseInline(text).map((segment, i) => {
        if (segment.type === "bold") return <strong key={i} style={{ color: "var(--gray-900)" }}>{segment.text}</strong>;
        if (segment.type === "link") {
          return segment.external ? (
            <a key={i} href={segment.href} style={LINK} {...(segment.href.startsWith("https:") ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
              {segment.text}
            </a>
          ) : (
            <Link key={i} href={segment.href} style={LINK}>
              {segment.text}
            </Link>
          );
        }
        return <span key={i}>{segment.text}</span>;
      })}
    </>
  );
}

function Block({ block, ui, eager }: { block: HelpBlock; ui: HelpUi; eager: boolean }) {
  switch (block.type) {
    case "p":
      return (
        <p style={P}>
          <InlineText text={block.text} />
        </p>
      );
    case "steps":
      return (
        <ol aria-label={ui.stepsLabel} style={LIST}>
          {block.items.map((item, i) => (
            <li key={i} style={{ marginBottom: "6px" }}>
              <InlineText text={item} />
            </li>
          ))}
        </ol>
      );
    case "list":
      return (
        <ul style={LIST}>
          {block.items.map((item, i) => (
            <li key={i}>
              <InlineText text={item} />
            </li>
          ))}
        </ul>
      );
    case "note": {
      const important = block.kind === "important";
      return (
        <aside
          style={{
            borderLeft: `4px solid ${important ? "var(--color-warning-text-light, #92400e)" : "var(--color-brand-text-light)"}`,
            background: "var(--gray-100)",
            borderRadius: "8px",
            padding: "12px 16px",
            margin: "0 0 16px",
            lineHeight: 1.65,
            color: "var(--gray-800, var(--gray-700))",
          }}
        >
          <strong style={{ color: "var(--gray-900)" }}>{important ? ui.noteImportant : ui.noteTip}. </strong>
          <InlineText text={block.text} />
        </aside>
      );
    }
    case "image": {
      // A phone screenshot (780 px wide) is shown at most 340 px wide, centered; a dashboard one takes the column. Never wider than the screen (320 px phones).
      const phone = block.platform !== "web";
      return (
        <figure style={{ margin: "0 0 18px", textAlign: phone ? "center" : undefined }}>
          <Image
            src={block.src}
            alt={block.alt}
            width={block.width}
            height={block.height}
            unoptimized
            loading={eager ? "eager" : "lazy"}
            style={{
              display: phone ? "inline-block" : "block",
              width: "100%",
              maxWidth: phone ? "340px" : "100%",
              height: "auto",
              borderRadius: "10px",
              border: "1px solid var(--gray-200)",
            }}
          />
        </figure>
      );
    }
  }
}

/** The body of one chapter: title, goal, table of contents and sections. */
export function ChapterView({ chapter, ui }: { chapter: HelpChapter; ui: HelpUi }) {
  // The first image of the chapter loads at once; the rest are lazy.
  const firstImage = chapter.sections.flatMap((s, si) => s.blocks.map((b, bi) => ({ b, si, bi }))).find((x) => x.b.type === "image");
  return (
    <article>
      <h1 style={H1}>{chapter.title}</h1>
      <p style={{ ...P, fontSize: "17px", color: "var(--gray-700)" }}>
        <strong style={{ color: "var(--gray-900)" }}>{ui.goalLabel}: </strong>
        <InlineText text={chapter.goal} />
      </p>

      {chapter.sections.length > 1 ? (
        <nav aria-label={ui.onThisPage} style={{ background: "var(--gray-100)", borderRadius: "10px", padding: "14px 20px", margin: "0 0 8px" }}>
          <p style={{ margin: "0 0 6px", fontWeight: 700, color: "var(--gray-900)" }}>{ui.onThisPage}</p>
          <ul style={{ margin: 0, paddingLeft: "20px", lineHeight: 1.8 }}>
            {chapter.sections.map((section) => (
              <li key={section.id}>
                <a href={`#${section.id}`} style={LINK}>
                  {section.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      {chapter.sections.map((section, sectionIndex) => (
        <section key={section.id} aria-labelledby={`h-${section.id}`}>
          <h2 id={section.id} style={H2}>
            <span id={`h-${section.id}`}>{section.title}</span>
          </h2>
          {section.blocks.map((block, i) => (
            <Block key={i} block={block} ui={ui} eager={firstImage?.si === sectionIndex && firstImage.bi === i} />
          ))}
        </section>
      ))}
    </article>
  );
}
