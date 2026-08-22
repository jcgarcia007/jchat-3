"use client";

/**
 * #47 Story Chapters — board-faithful port ("CHAPTERS" bookstore café)
 *
 * Each category is a "chapter" — the category selector shows roman-numeral
 * chapter markers. Selecting a chapter slides a full-width chapter title card
 * into view (dark parchment, Playfair Display) and then the items appear as
 * typographic "pages" beneath it: numbered, ruled, story-like.
 *
 * BG: #1C1812 (warm near-black) · Accent: #D4AF6A (parchment gold) · Text: #F5F0E8
 *
 * Critical fixes:
 *  • gallery-first photo URL
 *  • var(--menu-vh, 100dvh)
 *  • env(safe-area-inset-bottom) in cart bar
 *  • own cart bar → suppressedTemplates
 *  • own header → showBusinessHeader exclusion
 *  • section refs + scrollMarginTop: 56
 */

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { fmtPrice } from "./shared/format";
import type { MenuTemplateProps } from "./types";
import type { PublicMenuItem } from "../page";

const BG = "#1C1812";
const SURFACE = "#242018";
const ACCENT = "#D4AF6A"; // parchment gold
const ACCENT_ON = "#1C1812";
const TEXT = "#F5F0E8";
const MUTED = "rgba(245,240,232,.6)";
const FAINT = "rgba(245,240,232,.3)";
const BORDER = "rgba(212,175,106,.2)";
const RULE = "rgba(245,240,232,.12)";
const CHIP_BG = "rgba(212,175,106,.1)";
const CHIP_ACTIVE_BG = "#D4AF6A";
const CHIP_ACTIVE_TEXT = "#1C1812";

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

export default function StoryChapters({
  business,
  categories,
  activeCategory,
  scrollToCategory,
  sectionRefs,
  onItemAdd,
  cartCount,
  cartTotal,
  onOpenCart,
}: MenuTemplateProps) {
  const t = useTranslations("menu");
  const [favIds, setFavIds] = useState<Set<string>>(new Set());

  const toggleFav = useCallback((id: string) => {
    setFavIds((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }, []);

  return (
    <div style={{ position: "relative", minHeight: "var(--menu-vh, 100dvh)", background: BG, display: "flex", flexDirection: "column" }}>

      {/* ── Masthead ───────────────────────────────────────────────── */}
      <div style={{ flexShrink: 0, paddingTop: "max(18px, env(safe-area-inset-top, 0px))" }}>
        <div style={{ textAlign: "center", padding: "4px 24px 10px", borderBottom: `0.5px solid ${BORDER}` }}>
          <div style={{ fontFamily: "var(--font-playfair), 'Playfair Display', Georgia, serif", fontSize: 28, color: TEXT, lineHeight: 0.95, letterSpacing: "-0.5px" }}>
            {business.name}
          </div>
          <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: "3px", color: ACCENT, textTransform: "uppercase", marginTop: 5 }}>
            {business.category ?? "Menu"} · A Collection
          </div>
        </div>

        {/* Chapter nav */}
        <div style={{ display: "flex", overflowX: "auto", padding: "6px 24px 6px", scrollbarWidth: "none", gap: 6, borderBottom: `0.5px solid ${RULE}` }}>
          {categories.map((cat, i) => {
            const isActive = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => scrollToCategory(cat.id)}
                style={{
                  flexShrink: 0,
                  display: "flex", flexDirection: "column", alignItems: "center",
                  padding: "5px 12px", border: "none", cursor: "pointer",
                  background: isActive ? CHIP_ACTIVE_BG : CHIP_BG,
                  borderRadius: 10,
                  transition: "background .18s ease",
                }}
              >
                <span style={{ fontSize: 8, fontWeight: 900, letterSpacing: "1px", color: isActive ? ACCENT_ON : ACCENT, textTransform: "uppercase" }}>{ROMAN[i] ?? String(i + 1)}</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: isActive ? ACCENT_ON : TEXT, marginTop: 2, whiteSpace: "nowrap" }}>{cat.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Chapters ──────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: "auto", paddingBottom: cartCount > 0 ? "calc(74px + env(safe-area-inset-bottom, 0px))" : 20 }}>
        {categories.map((cat, catIdx) => (
          <section
            key={cat.id}
            id={`cat-${cat.id}`}
            style={{ scrollMarginTop: 56 }}
            ref={(el) => { if (el) sectionRefs.current.set(cat.id, el); else sectionRefs.current.delete(cat.id); }}
          >
            {/* Chapter title page */}
            <div
              style={{
                margin: "20px 20px 0",
                borderRadius: 16,
                background: SURFACE,
                border: `0.5px solid ${BORDER}`,
                padding: "22px 24px",
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "space-between",
                position: "relative",
                overflow: "hidden",
              }}
            >
              {/* Background roman numeral */}
              <div
                style={{
                  position: "absolute", top: -10, right: 12,
                  fontFamily: "var(--font-playfair), 'Playfair Display', Georgia, serif",
                  fontSize: 120, fontWeight: 900,
                  color: "rgba(212,175,106,.06)",
                  lineHeight: 1, userSelect: "none", pointerEvents: "none",
                }}
              >
                {ROMAN[catIdx] ?? String(catIdx + 1)}
              </div>

              <div>
                <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: "2.5px", color: ACCENT, textTransform: "uppercase", marginBottom: 6 }}>
                  Chapter {ROMAN[catIdx] ?? String(catIdx + 1)}
                </div>
                <div style={{ fontFamily: "var(--font-playfair), 'Playfair Display', Georgia, serif", fontSize: 24, color: TEXT, lineHeight: 1.05 }}>
                  {cat.name}
                </div>
                <div style={{ fontSize: 11, color: MUTED, marginTop: 5 }}>
                  {cat.items.length} {cat.items.length === 1 ? "selection" : "selections"}
                </div>
              </div>

              <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: "1px", color: FAINT }}>
                {ROMAN[catIdx] ?? String(catIdx + 1)}
              </div>
            </div>

            {/* Item "pages" */}
            <div style={{ padding: "0 20px" }}>
              {cat.items.map((item, itemIdx) => (
                <ChapterPage
                  key={item.id}
                  item={item}
                  pageNum={itemIdx + 1}
                  isFaved={favIds.has(item.id)}
                  onFav={() => toggleFav(item.id)}
                  onAdd={() => onItemAdd(item)}
                  t={t}
                  accent={ACCENT}
                  text={TEXT}
                  muted={MUTED}
                  rule={RULE}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* ── Cart bar ──────────────────────────────────────────────── */}
      {cartCount > 0 && (
        <button type="button" onClick={onOpenCart}
          style={{ position: "fixed", left: 16, right: 16, bottom: "calc(16px + env(safe-area-inset-bottom, 0px))", background: ACCENT, borderRadius: 14, padding: "13px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", border: "none", zIndex: 30 }}
        >
          <span style={{ fontSize: 13, fontWeight: 800, color: ACCENT_ON }}>{cartCount} {cartCount === 1 ? t("item") : t("items")}</span>
          <span style={{ fontSize: 13, fontWeight: 800, color: ACCENT_ON }}>{fmtPrice(cartTotal)} →</span>
        </button>
      )}
    </div>
  );
}

// ── Chapter page row ──────────────────────────────────────────────────────────
function ChapterPage({ item, pageNum, isFaved, onFav, onAdd, t, accent, text, muted, rule }: {
  item: PublicMenuItem; pageNum: number; isFaved: boolean; onFav: () => void; onAdd: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any; accent: string; text: string; muted: string; rule: string;
}) {
  const [justAdded, setJustAdded] = useState(false);
  const soldOut = item.stock_count !== null && item.stock_count === 0;
  const galleryUrl = item.photos?.find((p) => p.url && p.url.trim() !== "")?.url;
  const photoUrl = galleryUrl ?? (item.photo_url?.trim() ? item.photo_url : undefined);

  const handleAdd = () => {
    if (soldOut) return;
    onAdd();
    if (!item.groups.length) { setJustAdded(true); setTimeout(() => setJustAdded(false), 1100); }
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 0", borderBottom: `0.5px solid ${rule}` }}>
      {/* Page number */}
      <div style={{ fontFamily: "var(--font-playfair), 'Playfair Display', Georgia, serif", fontSize: 13, color: accent, width: 20, flexShrink: 0, textAlign: "center", fontStyle: "italic" }}>
        {pageNum}
      </div>

      {/* Thumbnail */}
      {photoUrl ? (
        <div style={{ width: 68, height: 68, borderRadius: 10, overflow: "hidden", flexShrink: 0, position: "relative" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photoUrl} alt={item.name} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
      ) : (
        <div style={{ width: 68, height: 68, borderRadius: 10, background: "#2A241E", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>📖</div>
      )}

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: "var(--font-playfair), 'Playfair Display', Georgia, serif", fontSize: 15, color: text, lineHeight: 1.15 }}>{item.name}</div>
        {item.description && (
          <div style={{ fontSize: 10.5, color: muted, lineHeight: 1.5, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontStyle: "italic" }}>{item.description}</div>
        )}
        <div style={{ fontSize: 13, fontWeight: 700, color: accent, marginTop: 4 }}>{soldOut ? t("soldOut") : fmtPrice(item.price_cents)}</div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flexShrink: 0 }}>
        <button type="button" onClick={handleAdd} disabled={soldOut}
          style={{ width: 34, height: 34, borderRadius: 99, background: soldOut ? "rgba(212,175,106,.2)" : justAdded ? "#059669" : accent, color: soldOut ? text : "#1C1812", border: "none", fontSize: 19, fontWeight: 300, cursor: soldOut ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "background .2s ease" }}
        >{justAdded ? "✓" : soldOut ? "—" : "+"}</button>
        <button type="button" onClick={onFav}
          style={{ background: "none", border: "none", fontSize: 14, cursor: "pointer", color: isFaved ? "#FF4D6D" : muted }}
        >{isFaved ? "♥" : "♡"}</button>
      </div>
    </div>
  );
}
