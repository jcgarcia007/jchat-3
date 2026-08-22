"use client";

/**
 * #49 Duotone Spotlight — board-faithful port ("PRISM" modern tapas bar)
 *
 * Every photo gets a graphic two-color treatment: a vivid color tint overlay
 * (mix-blend-mode: multiply) turns the image into a duotone punch of yellow
 * on black. Items in a 2-col masonry-like grid, each card full-bleed.
 * A category-color accent shifts per section so the wall feels like a gallery.
 *
 * BG: #0F0F0F · Accent: #FACC15 (electric yellow) · Text: #FFFFFF
 *
 * Critical fixes:
 *  • gallery-first photo URL
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

const BG = "#0F0F0F";
const SURFACE = "#1A1A1A";
const TEXT = "#FFFFFF";
const MUTED = "rgba(255,255,255,.6)";
const CHIP_BG = "rgba(250,204,21,.1)";
const CHIP_TEXT = "#FACC15";
const CHIP_ACTIVE_BG = "#FACC15";
const CHIP_ACTIVE_TEXT = "#0F0F0F";
const ACCENT_DEFAULT = "#FACC15"; // electric yellow

// Per-category duotone tints (cycle through these)
const CAT_ACCENTS = ["#FACC15", "#F43F5E", "#06B6D4", "#A78BFA", "#34D399", "#FB923C"];

export default function DuotoneSpotlight({
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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px 6px" }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 900, color: TEXT, letterSpacing: "-0.5px", textTransform: "uppercase" }}>{business.name}</div>
            <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: "3px", color: ACCENT_DEFAULT, textTransform: "uppercase" }}>{business.category ?? "Menu"}</div>
          </div>
          <button
            type="button"
            onClick={onOpenCart}
            aria-label={t("openCartAria")}
            style={{ position: "relative", width: 38, height: 38, borderRadius: 99, background: SURFACE, border: "0.5px solid rgba(255,255,255,.1)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
          >
            <IconShoppingBag size={18} color={ACCENT_DEFAULT} />
            {cartCount > 0 && (
              <span style={{ position: "absolute", top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 99, background: ACCENT_DEFAULT, color: CHIP_ACTIVE_TEXT, fontSize: 10, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", paddingInline: 4 }}>{cartCount}</span>
            )}
          </button>
        </div>

        {/* Category chips */}
        <div style={{ display: "flex", gap: 8, overflowX: "auto", padding: "0 20px 8px", scrollbarWidth: "none" }}>
          {categories.map((cat) => {
            const isActive = activeCategory === cat.id;
            return (
              <button key={cat.id} type="button" onClick={() => scrollToCategory(cat.id)}
                style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, padding: "5px 14px", borderRadius: 99, border: "none", cursor: "pointer", background: isActive ? CHIP_ACTIVE_BG : CHIP_BG, color: isActive ? CHIP_ACTIVE_TEXT : CHIP_TEXT, transition: "background .18s, color .18s" }}
              >{cat.name}</button>
            );
          })}
        </div>
      </div>

      {/* ── Duotone grid ──────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: "auto", paddingBottom: cartCount > 0 ? "calc(74px + env(safe-area-inset-bottom, 0px))" : 20 }}>
        {categories.map((cat, catIdx) => {
          const catAccent = CAT_ACCENTS[catIdx % CAT_ACCENTS.length];
          return (
            <section
              key={cat.id}
              id={`cat-${cat.id}`}
              style={{ scrollMarginTop: 56 }}
              ref={(el) => { if (el) sectionRefs.current.set(cat.id, el); else sectionRefs.current.delete(cat.id); }}
            >
              {/* Category label */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 20px 8px" }}>
                <div style={{ width: 8, height: 8, borderRadius: 99, background: catAccent, flexShrink: 0 }} />
                <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "2px", color: catAccent, textTransform: "uppercase" }}>{cat.name}</div>
                <div style={{ flex: 1, height: "0.5px", background: `${catAccent}30` }} />
              </div>

              {/* 2-col grid */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, padding: "0 4px 4px" }}>
                {cat.items.map((item, itemIdx) => (
                  <DuotoneCard
                    key={item.id}
                    item={item}
                    accent={catAccent}
                    tall={itemIdx % 5 === 0} // first card of each "row group" is taller
                    isFaved={favIds.has(item.id)}
                    onFav={() => toggleFav(item.id)}
                    onAdd={() => onItemAdd(item)}
                    t={t}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {/* ── Cart bar ──────────────────────────────────────────────── */}
      {cartCount > 0 && (
        <button type="button" onClick={onOpenCart}
          style={{ position: "fixed", left: 16, right: 16, bottom: "calc(16px + env(safe-area-inset-bottom, 0px))", background: ACCENT_DEFAULT, borderRadius: 14, padding: "13px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", border: "none", zIndex: 30 }}
        >
          <span style={{ fontSize: 13, fontWeight: 800, color: CHIP_ACTIVE_TEXT }}>{cartCount} {cartCount === 1 ? t("item") : t("items")}</span>
          <span style={{ fontSize: 13, fontWeight: 800, color: CHIP_ACTIVE_TEXT }}>{fmtPrice(cartTotal)} →</span>
        </button>
      )}
    </div>
  );
}

// ── Duotone card ──────────────────────────────────────────────────────────────
function DuotoneCard({ item, accent, tall, isFaved, onFav, onAdd, t }: {
  item: PublicMenuItem; accent: string; tall: boolean;
  isFaved: boolean; onFav: () => void; onAdd: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any;
}) {
  const [justAdded, setJustAdded] = useState(false);
  const soldOut = item.stock_count !== null && item.stock_count === 0;
  const galleryUrl = item.photos?.find((p) => p.url && p.url.trim() !== "")?.url;
  const photoUrl = galleryUrl ?? (item.photo_url?.trim() ? item.photo_url : undefined);

  const handleAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (soldOut) return;
    onAdd();
    if (!item.groups.length) { setJustAdded(true); setTimeout(() => setJustAdded(false), 1100); }
  };

  const cardH = tall ? 280 : 200;

  return (
    <div
      style={{
        position: "relative",
        height: cardH,
        borderRadius: 8,
        overflow: "hidden",
        cursor: "pointer",
        opacity: soldOut ? 0.65 : 1,
      }}
      onClick={handleAdd}
    >
      {/* Photo layer */}
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl} alt={item.name} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", filter: "grayscale(100%) contrast(1.1)" }} />
      ) : (
        <div style={{ position: "absolute", inset: 0, background: "#2A2A2A", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 44 }}>🍽</div>
      )}

      {/* Duotone color overlay */}
      {photoUrl && (
        <div style={{ position: "absolute", inset: 0, background: accent, mixBlendMode: "multiply", opacity: 0.72 }} />
      )}

      {/* Dark gradient for legibility */}
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,.88) 0%, rgba(0,0,0,.25) 55%, rgba(0,0,0,0) 75%)" }} />

      {/* Fav */}
      <button type="button" onClick={(e) => { e.stopPropagation(); onFav(); }}
        aria-label={isFaved ? t("removeFavoriteAria") : t("addFavoriteAria")}
        style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,.4)", border: "none", width: 28, height: 28, borderRadius: 99, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, cursor: "pointer", color: isFaved ? "#FF4D6D" : "#fff" }}
      >{isFaved ? "♥" : "♡"}</button>

      {/* Price badge */}
      <div style={{ position: "absolute", top: 8, left: 8, background: accent, color: "#000", fontSize: 11, fontWeight: 900, padding: "3px 8px", borderRadius: 6 }}>
        {soldOut ? t("soldOut") : fmtPrice(item.price_cents)}
      </div>

      {/* Name + add */}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "0 10px 10px" }}>
        <div style={{ fontSize: 12, fontWeight: 900, color: "#fff", textTransform: "uppercase", letterSpacing: "0.5px", lineHeight: 1.15, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", marginBottom: 6 }}>
          {item.name}
        </div>
        <button type="button" onClick={handleAdd} disabled={soldOut}
          style={{ width: "100%", background: justAdded ? "#059669" : soldOut ? "rgba(255,255,255,.2)" : accent, color: soldOut ? "#fff" : "#000", border: "none", borderRadius: 6, padding: "7px", fontSize: 11, fontWeight: 900, cursor: soldOut ? "not-allowed" : "pointer", textTransform: "uppercase", letterSpacing: "0.5px", transition: "background .2s ease" }}
        >{justAdded ? "✓" : soldOut ? "—" : "+ Add"}</button>
      </div>
    </div>
  );
}
