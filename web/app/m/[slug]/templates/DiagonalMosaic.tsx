"use client";

/**
 * #45 Diagonal Mosaic — board-faithful port ("SLANT" modern wine bar)
 *
 * A 3-column masonry grid where every middle column is offset downward by
 * exactly 50% of a card height, creating an interlocking diagonal stagger.
 * Each card has a subtle tilt (±1–2°) and a diagonal cut dividing the photo
 * from the text area via a CSS clip-path polygon.
 *
 * BG: #FAF7F2 (warm stone) · Accent: #7C3AED (deep purple) · Text: #1C1428
 *
 * Critical fixes:
 *  • gallery-first photo URL (card photo height fixed px)
 *  • env(safe-area-inset-bottom) in cart bar
 *  • section refs + scrollMarginTop: 56
 *  • own cart bar → suppressedTemplates
 *  • own header → showBusinessHeader exclusion
 */

import { useCallback, useState } from "react";
import { IconShoppingBag } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { fmtPrice } from "./shared/format";
import type { MenuTemplateProps } from "./types";
import type { PublicMenuItem } from "../page";

const BG = "#FAF7F2";
const SURFACE = "#FFFFFF";
const ACCENT = "#7C3AED"; // deep purple
const ACCENT_ON = "#FFFFFF";
const TEXT = "#1C1428";
const MUTED = "#6B5A7E";
const BORDER = "#EBE5F0";
const CHIP_BG = "rgba(124,58,237,.08)";
const CHIP_TEXT = "#7C3AED";
const CHIP_ACTIVE_BG = "#7C3AED";
const CHIP_ACTIVE_TEXT = "#fff";

// Small tilts for the diagonal mosaic feel
const TILTS = ["-1.2deg", "0deg", "1.2deg"];

export default function DiagonalMosaic({
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

      {/* ── Header ────────────────────────────────────────────────── */}
      <div style={{ flexShrink: 0, paddingTop: "max(16px, env(safe-area-inset-top, 0px))" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 22px 6px" }}>
          <div>
            <div style={{ fontFamily: "var(--font-playfair), 'Playfair Display', Georgia, serif", fontSize: 26, color: TEXT, lineHeight: 0.95 }}>{business.name}</div>
            <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: "2.5px", color: ACCENT, textTransform: "uppercase", marginTop: 4 }}>{business.category ?? "Menu"}</div>
          </div>
          <button type="button" onClick={onOpenCart} aria-label={t("openCartAria")}
            style={{ position: "relative", width: 38, height: 38, borderRadius: 10, background: SURFACE, border: `1px solid ${BORDER}`, boxShadow: "0 2px 8px rgba(124,58,237,.12)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
          >
            <IconShoppingBag size={18} color={ACCENT} />
            {cartCount > 0 && (
              <span style={{ position: "absolute", top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 99, background: ACCENT, color: ACCENT_ON, fontSize: 10, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", paddingInline: 4 }}>{cartCount}</span>
            )}
          </button>
        </div>

        {/* Chips */}
        <div style={{ display: "flex", gap: 8, overflowX: "auto", padding: "0 22px 8px", scrollbarWidth: "none" }}>
          {categories.map((cat) => {
            const isActive = activeCategory === cat.id;
            return (
              <button key={cat.id} type="button" onClick={() => scrollToCategory(cat.id)}
                style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, padding: "5px 14px", borderRadius: 99, border: "none", cursor: "pointer", background: isActive ? CHIP_ACTIVE_BG : CHIP_BG, color: isActive ? CHIP_ACTIVE_TEXT : CHIP_TEXT, transition: "background .18s, color .18s" }}
              >{cat.name}</button>
            );
          })}
        </div>

        <div style={{ height: "0.5px", background: BORDER, margin: "0 22px" }} />
      </div>

      {/* ── Diagonal mosaic grid ──────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: "auto", paddingBottom: cartCount > 0 ? "calc(74px + env(safe-area-inset-bottom, 0px))" : 20 }}>
        {categories.map((cat) => (
          <section
            key={cat.id}
            id={`cat-${cat.id}`}
            style={{ scrollMarginTop: 56 }}
            ref={(el) => { if (el) sectionRefs.current.set(cat.id, el); else sectionRefs.current.delete(cat.id); }}
          >
            <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "2px", color: "rgba(28,20,40,.3)", padding: "12px 22px 8px", textTransform: "uppercase" }}>
              {cat.name}
            </div>

            {/* Staggered 3-col grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, padding: "0 14px 8px", alignItems: "start" }}>
              {cat.items.map((item, i) => {
                const col = i % 3; // 0, 1, 2
                const isMiddle = col === 1;
                return (
                  <div
                    key={item.id}
                    style={{
                      marginTop: isMiddle ? 32 : 0, // stagger the middle column
                      transform: `rotate(${TILTS[col]})`,
                      transformOrigin: "center center",
                      willChange: "transform",
                    }}
                  >
                    <MosaicCard
                      item={item}
                      isFaved={favIds.has(item.id)}
                      onFav={() => toggleFav(item.id)}
                      onAdd={() => onItemAdd(item)}
                      t={t}
                      accent={ACCENT}
                      text={TEXT}
                      muted={MUTED}
                      border={BORDER}
                    />
                  </div>
                );
              })}
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

// ── Mosaic card ───────────────────────────────────────────────────────────────
function MosaicCard({ item, isFaved, onFav, onAdd, t, accent, text, muted, border }: {
  item: PublicMenuItem; isFaved: boolean; onFav: () => void; onAdd: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any; accent: string; text: string; muted: string; border: string;
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
    <div
      style={{
        borderRadius: 12,
        overflow: "hidden",
        background: "#fff",
        border: `0.5px solid ${border}`,
        boxShadow: "0 3px 10px rgba(28,20,40,.08)",
        opacity: soldOut ? 0.65 : 1,
      }}
    >
      {/* Photo with diagonal clip on bottom */}
      <div style={{ position: "relative", height: 120, flexShrink: 0 }}>
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl}
            alt={item.name}
            style={{
              position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover",
              // Diagonal clip: top-left → top-right → bottom-right with notch → bottom-left
              clipPath: "polygon(0 0, 100% 0, 100% 80%, 0% 100%)",
            }}
          />
        ) : (
          <div style={{ position: "absolute", inset: 0, background: "#EBE5F0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, clipPath: "polygon(0 0, 100% 0, 100% 80%, 0% 100%)" }}>🍷</div>
        )}

        {/* Fav */}
        <button type="button" onClick={(e) => { e.stopPropagation(); onFav(); }}
          aria-label={isFaved ? t("removeFavoriteAria") : t("addFavoriteAria")}
          style={{ position: "absolute", top: 6, right: 6, background: "rgba(255,255,255,.85)", border: "none", width: 22, height: 22, borderRadius: 99, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, cursor: "pointer", color: isFaved ? "#FF4D6D" : muted }}
        >{isFaved ? "♥" : "♡"}</button>
      </div>

      {/* Info */}
      <div style={{ padding: "8px 10px 10px" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: text, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", marginBottom: 5 }}>
          {item.name}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: accent }}>{soldOut ? "—" : fmtPrice(item.price_cents)}</span>
          <button type="button" onClick={handleAdd} disabled={soldOut}
            style={{ width: 24, height: 24, borderRadius: 6, background: soldOut ? "rgba(124,58,237,.15)" : justAdded ? "#059669" : accent, color: "#fff", border: "none", fontSize: 15, fontWeight: 300, cursor: soldOut ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "background .2s ease" }}
          >{justAdded ? "✓" : soldOut ? "—" : "+"}</button>
        </div>
      </div>
    </div>
  );
}
