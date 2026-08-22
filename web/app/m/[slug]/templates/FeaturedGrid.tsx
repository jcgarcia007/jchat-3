"use client";

/**
 * #42 Featured + Grid — board-faithful port ("URBAN KITCHEN" modern casual)
 *
 * The first item per category gets a full-width hero feature card (tall photo,
 * name + price on a bottom panel). The rest of the category fills a 2-column
 * grid of compact square cards below it — a clean, familiar pattern.
 *
 * BG: #F8F7F5 (warm white) · Accent: #E8622A (burnt orange) · Text: #1A1208
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

const BG = "#F8F7F5";
const SURFACE = "#FFFFFF";
const ACCENT = "#E8622A"; // burnt orange
const ACCENT_ON = "#FFFFFF";
const TEXT = "#1A1208";
const MUTED = "#6B5B48";
const BORDER = "#EAE5DE";
const CHIP_BG = "rgba(232,98,42,.08)";
const CHIP_TEXT = "#E8622A";
const CHIP_ACTIVE_BG = "#E8622A";
const CHIP_ACTIVE_TEXT = "#fff";

export default function FeaturedGrid({
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
      <div style={{ flexShrink: 0, paddingTop: "max(16px, env(safe-area-inset-top, 0px))", background: BG }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px 6px" }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 900, color: TEXT, letterSpacing: "-0.5px" }}>{business.name}</div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "2px", color: ACCENT, textTransform: "uppercase" }}>{business.category ?? "Menu"}</div>
          </div>
          <button
            type="button"
            onClick={onOpenCart}
            aria-label={t("openCartAria")}
            style={{
              position: "relative", width: 38, height: 38, borderRadius: 99,
              background: SURFACE, border: `1px solid ${BORDER}`,
              display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
            }}
          >
            <IconShoppingBag size={18} color={TEXT} />
            {cartCount > 0 && (
              <span style={{ position: "absolute", top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 99, background: ACCENT, color: ACCENT_ON, fontSize: 10, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", paddingInline: 4 }}>{cartCount}</span>
            )}
          </button>
        </div>

        {/* Chips */}
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

        <div style={{ height: "0.5px", background: BORDER, margin: "0 20px" }} />
      </div>

      {/* ── Content ───────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: "auto", paddingBottom: cartCount > 0 ? "calc(74px + env(safe-area-inset-bottom, 0px))" : 20 }}>
        {categories.map((cat) => {
          const [featured, ...grid] = cat.items;
          return (
            <section
              key={cat.id}
              id={`cat-${cat.id}`}
              style={{ scrollMarginTop: 56 }}
              ref={(el) => { if (el) sectionRefs.current.set(cat.id, el); else sectionRefs.current.delete(cat.id); }}
            >
              {/* Category label */}
              <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "2px", color: "rgba(26,18,8,.3)", padding: "14px 20px 6px", textTransform: "uppercase" }}>
                {cat.name}
              </div>

              {/* Featured card */}
              {featured && (
                <FeatureCard
                  item={featured}
                  isFaved={favIds.has(featured.id)}
                  onFav={() => toggleFav(featured.id)}
                  onAdd={() => onItemAdd(featured)}
                  t={t}
                  accent={ACCENT}
                  muted={MUTED}
                />
              )}

              {/* Grid */}
              {grid.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "10px 20px 4px" }}>
                  {grid.map((item) => (
                    <GridCard
                      key={item.id}
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
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {/* ── Cart bar ──────────────────────────────────────────────── */}
      {cartCount > 0 && (
        <button type="button" onClick={onOpenCart}
          style={{ position: "fixed", left: 16, right: 16, bottom: "calc(16px + env(safe-area-inset-bottom, 0px))", background: ACCENT, borderRadius: 16, padding: "13px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", border: "none", zIndex: 30 }}
        >
          <span style={{ fontSize: 13, fontWeight: 800, color: ACCENT_ON }}>{cartCount} {cartCount === 1 ? t("item") : t("items")}</span>
          <span style={{ fontSize: 13, fontWeight: 800, color: ACCENT_ON }}>{fmtPrice(cartTotal)} →</span>
        </button>
      )}
    </div>
  );
}

// ── Feature card (full-width hero) ───────────────────────────────────────────
function FeatureCard({ item, isFaved, onFav, onAdd, t, accent, muted }: {
  item: PublicMenuItem; isFaved: boolean; onFav: () => void; onAdd: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any; accent: string; muted: string;
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
    <div style={{ margin: "0 20px 4px", borderRadius: 18, overflow: "hidden", boxShadow: "0 4px 20px rgba(26,18,8,.12)" }}>
      {/* Photo */}
      <div style={{ position: "relative", height: 210, background: "#E8E4DD" }}>
        {photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt={item.name} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
        )}
        {/* Featured badge */}
        <div style={{ position: "absolute", top: 12, left: 12, background: accent, color: "#fff", fontSize: 9, fontWeight: 900, letterSpacing: "1.5px", padding: "4px 10px", borderRadius: 99, textTransform: "uppercase" }}>
          Featured
        </div>
        {/* Fav */}
        <button type="button" onClick={onFav} aria-label={isFaved ? t("removeFavoriteAria") : t("addFavoriteAria")}
          style={{ position: "absolute", top: 10, right: 12, background: "rgba(255,255,255,.85)", border: "none", width: 32, height: 32, borderRadius: 99, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, cursor: "pointer", color: isFaved ? "#FF4D6D" : muted }}
        >{isFaved ? "♥" : "♡"}</button>
      </div>

      {/* Info panel */}
      <div style={{ background: "#fff", padding: "12px 14px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ flex: 1, minWidth: 0, marginRight: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#1A1208", lineHeight: 1.1, marginBottom: 2 }}>{item.name}</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: accent }}>{soldOut ? t("soldOut") : fmtPrice(item.price_cents)}</div>
        </div>
        <button type="button" onClick={handleAdd} disabled={soldOut}
          style={{ background: soldOut ? "rgba(232,98,42,.2)" : justAdded ? "#059669" : accent, color: "#fff", border: "none", borderRadius: 12, padding: "10px 20px", fontSize: 14, fontWeight: 800, cursor: soldOut ? "not-allowed" : "pointer", flexShrink: 0, transition: "background .2s ease" }}
        >{justAdded ? "✓" : soldOut ? "—" : "+ Add"}</button>
      </div>
    </div>
  );
}

// ── Grid card (compact 2-col) ─────────────────────────────────────────────────
function GridCard({ item, isFaved, onFav, onAdd, t, accent, text, muted, border }: {
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
    <div style={{ borderRadius: 14, overflow: "hidden", background: "#fff", border: `0.5px solid ${border}`, boxShadow: "0 2px 8px rgba(26,18,8,.07)" }}>
      {/* Photo */}
      <div style={{ position: "relative", height: 120 }}>
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt={item.name} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <div style={{ position: "absolute", inset: 0, background: "#F0EBE3", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36 }}>🍳</div>
        )}
        {/* Fav */}
        <button type="button" onClick={(e) => { e.stopPropagation(); onFav(); }}
          style={{ position: "absolute", top: 6, right: 6, background: "rgba(255,255,255,.85)", border: "none", width: 26, height: 26, borderRadius: 99, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, cursor: "pointer", color: isFaved ? "#FF4D6D" : muted }}
        >{isFaved ? "♥" : "♡"}</button>
      </div>

      {/* Info */}
      <div style={{ padding: "8px 10px 10px" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: text, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 5 }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: accent }}>{soldOut ? t("soldOut") : fmtPrice(item.price_cents)}</span>
          <button type="button" onClick={handleAdd} disabled={soldOut}
            style={{ width: 28, height: 28, borderRadius: 99, background: soldOut ? "rgba(232,98,42,.2)" : justAdded ? "#059669" : accent, color: "#fff", border: "none", fontSize: 17, fontWeight: 300, cursor: soldOut ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "background .2s ease" }}
          >{justAdded ? "✓" : soldOut ? "—" : "+"}</button>
        </div>
      </div>
    </div>
  );
}
