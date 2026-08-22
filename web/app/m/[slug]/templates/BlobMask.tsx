"use client";

/**
 * #43 Blob Mask — board-faithful port ("VERDE" smoothie & health bar)
 *
 * Every item photo is clipped inside an organic blob shape (irregular
 * border-radius). The blobs alternate between 3 different shapes so the
 * grid feels alive and handcrafted. Clean white background, emerald accent.
 *
 * BG: #F0FDF4 (light mint) · Accent: #10B981 (emerald) · Text: #064E3B
 *
 * Critical fixes:
 *  • gallery-first photo URL (blob width/height fixed px — no aspect-ratio)
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

const BG = "#F0FDF4";
const SURFACE = "#FFFFFF";
const ACCENT = "#10B981"; // emerald
const ACCENT_ON = "#FFFFFF";
const TEXT = "#064E3B";
const MUTED = "#4B7A67";
const BORDER = "#D1FAE5";
const CHIP_BG = "rgba(16,185,129,.08)";
const CHIP_TEXT = "#10B981";
const CHIP_ACTIVE_BG = "#10B981";
const CHIP_ACTIVE_TEXT = "#fff";

// Three alternating blob shapes (border-radius shorthand for 8 values)
const BLOB_SHAPES = [
  "62% 38% 46% 54% / 60% 44% 56% 40%",
  "38% 62% 63% 37% / 45% 58% 42% 55%",
  "50% 50% 37% 63% / 55% 40% 60% 45%",
];

export default function BlobMask({
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
            <div style={{ fontSize: 24, fontWeight: 900, color: TEXT }}>{business.name}</div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "2px", color: ACCENT, textTransform: "uppercase" }}>{business.category ?? "Menu"}</div>
          </div>
          <button type="button" onClick={onOpenCart} aria-label={t("openCartAria")}
            style={{ position: "relative", width: 38, height: 38, borderRadius: 99, background: SURFACE, border: `1px solid ${BORDER}`, boxShadow: "0 2px 8px rgba(16,185,129,.15)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
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

        <div style={{ height: "0.5px", background: BORDER, margin: "0 22px 4px" }} />
      </div>

      {/* ── Blob grid ─────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: "auto", paddingBottom: cartCount > 0 ? "calc(74px + env(safe-area-inset-bottom, 0px))" : 20 }}>
        {categories.map((cat) => (
          <section
            key={cat.id}
            id={`cat-${cat.id}`}
            style={{ scrollMarginTop: 56 }}
            ref={(el) => { if (el) sectionRefs.current.set(cat.id, el); else sectionRefs.current.delete(cat.id); }}
          >
            <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "2px", color: "rgba(6,78,59,.3)", padding: "10px 22px 8px", textTransform: "uppercase" }}>
              {cat.name}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, padding: "0 22px 8px" }}>
              {cat.items.map((item, i) => (
                <BlobCard
                  key={item.id}
                  item={item}
                  blobShape={BLOB_SHAPES[i % BLOB_SHAPES.length]}
                  isFaved={favIds.has(item.id)}
                  onFav={() => toggleFav(item.id)}
                  onAdd={() => onItemAdd(item)}
                  t={t}
                  accent={ACCENT}
                  text={TEXT}
                  muted={MUTED}
                  border={BORDER}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* ── Cart bar ──────────────────────────────────────────────── */}
      {cartCount > 0 && (
        <button type="button" onClick={onOpenCart}
          style={{ position: "fixed", left: 16, right: 16, bottom: "calc(16px + env(safe-area-inset-bottom, 0px))", background: ACCENT, borderRadius: 99, padding: "13px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", border: "none", zIndex: 30 }}
        >
          <span style={{ fontSize: 13, fontWeight: 800, color: ACCENT_ON }}>{cartCount} {cartCount === 1 ? t("item") : t("items")}</span>
          <span style={{ fontSize: 13, fontWeight: 800, color: ACCENT_ON }}>{fmtPrice(cartTotal)} →</span>
        </button>
      )}
    </div>
  );
}

// ── Blob card ─────────────────────────────────────────────────────────────────
function BlobCard({ item, blobShape, isFaved, onFav, onAdd, t, accent, text, muted, border }: {
  item: PublicMenuItem; blobShape: string; isFaved: boolean; onFav: () => void; onAdd: () => void;
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
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", background: "#fff", borderRadius: 20, border: `0.5px solid ${border}`, padding: "14px 12px 12px", boxShadow: "0 2px 12px rgba(16,185,129,.08)", opacity: soldOut ? 0.65 : 1 }}>
      {/* Blob photo */}
      <div
        style={{
          width: 110,
          height: 110,
          borderRadius: blobShape,
          overflow: "hidden",
          flexShrink: 0,
          position: "relative",
          background: "#D1FAE5",
          marginBottom: 10,
          boxShadow: `0 4px 16px rgba(16,185,129,.2)`,
          transition: "border-radius .4s ease",
        }}
      >
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt={item.name} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40 }}>🥤</div>
        )}

        {/* Fav */}
        <button type="button" onClick={(e) => { e.stopPropagation(); onFav(); }}
          aria-label={isFaved ? t("removeFavoriteAria") : t("addFavoriteAria")}
          style={{ position: "absolute", top: 6, right: 6, background: "rgba(255,255,255,.9)", border: "none", width: 26, height: 26, borderRadius: 99, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, cursor: "pointer", color: isFaved ? "#FF4D6D" : muted }}
        >{isFaved ? "♥" : "♡"}</button>
      </div>

      {/* Name */}
      <div style={{ fontSize: 13, fontWeight: 700, color: text, textAlign: "center", lineHeight: 1.2, marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", maxWidth: "100%" }}>
        {item.name}
      </div>
      {item.description && (
        <div style={{ fontSize: 10, color: muted, textAlign: "center", lineHeight: 1.4, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>
          {item.description}
        </div>
      )}

      {/* Price + add */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", marginTop: 4 }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: accent }}>{soldOut ? t("soldOut") : fmtPrice(item.price_cents)}</span>
        <button type="button" onClick={handleAdd} disabled={soldOut}
          style={{ width: 30, height: 30, borderRadius: 99, background: soldOut ? "rgba(16,185,129,.15)" : justAdded ? "#059669" : accent, color: "#fff", border: "none", fontSize: 18, fontWeight: 300, cursor: soldOut ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "background .2s ease" }}
        >{justAdded ? "✓" : soldOut ? "—" : "+"}</button>
      </div>
    </div>
  );
}
