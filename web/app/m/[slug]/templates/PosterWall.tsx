"use client";

/**
 * #36 Poster Wall — board-faithful port ("GIGS" bar & live venue)
 *
 * Every dish is a concert poster — full-bleed photo, bold type at the bottom,
 * a price badge in the corner. The grid feels like a billboard wall.
 * Tap any poster to add; long-tap (or heart) to save.
 *
 * BG: #111111 · Accent: #FF3B30 (red) · Text: #FFFFFF
 *
 * Critical fixes:
 *  • gallery-first photo URL (padding-bottom 0 — poster height is fixed px)
 *  • env(safe-area-inset-bottom) in cart bar
 *  • own cart bar → suppressedTemplates
 *  • own header → showBusinessHeader exclusion
 */

import { useCallback, useState } from "react";
import { IconShoppingBag } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { fmtPrice } from "./shared/format";
import type { MenuTemplateProps } from "./types";
import type { PublicMenuItem } from "../page";

const BG = "#111111";
const SURFACE = "#1E1E1E";
const ACCENT = "#FF3B30"; // red
const ACCENT_ON = "#FFFFFF";
const TEXT = "#FFFFFF";
const CHIP_BG = "rgba(255,59,48,.12)";
const CHIP_TEXT = "#FF3B30";
const CHIP_ACTIVE_BG = "#FF3B30";
const CHIP_ACTIVE_TEXT = "#fff";
const POSTER_GRAD = "linear-gradient(to top, rgba(0,0,0,.90) 0%, rgba(0,0,0,.55) 45%, rgba(0,0,0,0) 75%)";

export default function PosterWall({
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
    setFavIds((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }, []);

  return (
    <div
      style={{
        position: "relative",
        minHeight: "var(--menu-vh, 100dvh)",
        background: BG,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div
        style={{
          flexShrink: 0,
          paddingTop: "max(16px, env(safe-area-inset-top, 0px))",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "4px 20px 0",
          }}
        >
          <div>
            <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: "-0.5px", color: TEXT, textTransform: "uppercase" }}>
              {business.name}
            </div>
            <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "3px", color: ACCENT, marginTop: 1 }}>
              {(business.category ?? "MENU").toUpperCase()}
            </div>
          </div>

          <button
            type="button"
            onClick={onOpenCart}
            aria-label={t("openCartAria")}
            style={{
              position: "relative",
              width: 38,
              height: 38,
              borderRadius: 999,
              background: SURFACE,
              border: "0.5px solid rgba(255,255,255,.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <IconShoppingBag size={18} color={TEXT} />
            {cartCount > 0 && (
              <span
                style={{
                  position: "absolute",
                  top: -4,
                  right: -4,
                  minWidth: 18,
                  height: 18,
                  borderRadius: 99,
                  background: ACCENT,
                  color: ACCENT_ON,
                  fontSize: 10,
                  fontWeight: 900,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  paddingInline: 4,
                }}
              >
                {cartCount}
              </span>
            )}
          </button>
        </div>

        {/* Category chips */}
        <div
          style={{
            display: "flex",
            gap: 8,
            overflowX: "auto",
            padding: "8px 20px 6px",
            scrollbarWidth: "none",
          }}
        >
          {categories.map((cat) => {
            const isActive = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => scrollToCategory(cat.id)}
                style={{
                  flexShrink: 0,
                  fontSize: 11,
                  fontWeight: 900,
                  letterSpacing: "1px",
                  padding: "5px 13px",
                  borderRadius: 99,
                  border: "none",
                  cursor: "pointer",
                  background: isActive ? CHIP_ACTIVE_BG : CHIP_BG,
                  color: isActive ? CHIP_ACTIVE_TEXT : CHIP_TEXT,
                  textTransform: "uppercase",
                  transition: "background .18s ease, color .18s ease",
                }}
              >
                {cat.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Poster grid ────────────────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          paddingBottom: cartCount > 0 ? "calc(74px + env(safe-area-inset-bottom, 0px))" : 20,
        }}
      >
        {categories.map((cat) => (
          <section
            key={cat.id}
            id={`cat-${cat.id}`}
            style={{ scrollMarginTop: 56 }}
            ref={(el) => {
              if (el) sectionRefs.current.set(cat.id, el);
              else sectionRefs.current.delete(cat.id);
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 900,
                letterSpacing: "3px",
                color: "rgba(255,255,255,.35)",
                padding: "10px 20px 6px",
                textTransform: "uppercase",
              }}
            >
              {cat.name}
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 6,
                padding: "0 6px 10px",
              }}
            >
              {cat.items.map((item) => (
                <PosterCard
                  key={item.id}
                  item={item}
                  isFaved={favIds.has(item.id)}
                  onFav={() => toggleFav(item.id)}
                  onAdd={() => onItemAdd(item)}
                  t={t}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* ── Cart bar ──────────────────────────────────────────────── */}
      {cartCount > 0 && (
        <button
          type="button"
          onClick={onOpenCart}
          style={{
            position: "fixed",
            left: 16,
            right: 16,
            bottom: "calc(16px + env(safe-area-inset-bottom, 0px))",
            background: ACCENT,
            borderRadius: 12,
            padding: "13px 18px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            cursor: "pointer",
            border: "none",
            zIndex: 30,
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 900, color: ACCENT_ON, letterSpacing: "1px" }}>
            {cartCount} {cartCount === 1 ? t("item") : t("items")}
          </span>
          <span style={{ fontSize: 13, fontWeight: 900, color: ACCENT_ON }}>
            {fmtPrice(cartTotal)} →
          </span>
        </button>
      )}
    </div>
  );
}

// ── Poster card ──────────────────────────────────────────────────────────────
function PosterCard({
  item,
  isFaved,
  onFav,
  onAdd,
  t,
}: {
  item: PublicMenuItem;
  isFaved: boolean;
  onFav: () => void;
  onAdd: () => void;
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
    if (!item.groups.length) {
      setJustAdded(true);
      setTimeout(() => setJustAdded(false), 1100);
    }
  };

  return (
    <div
      style={{
        position: "relative",
        borderRadius: 6,
        overflow: "hidden",
        aspectRatio: "3/4",
        cursor: "pointer",
        opacity: soldOut ? 0.65 : 1,
      }}
      onClick={handleAdd}
    >
      {/* Photo */}
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoUrl}
          alt={item.name}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        <div
          style={{
            position: "absolute", inset: 0,
            background: "#2A2A2A",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 44,
          }}
        >
          🎸
        </div>
      )}

      {/* Gradient overlay */}
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,.90) 0%, rgba(0,0,0,.55) 45%, rgba(0,0,0,0) 75%)" }} />

      {/* Price badge — top right */}
      <div
        style={{
          position: "absolute",
          top: 10,
          right: 10,
          background: "#FF3B30",
          color: "#fff",
          fontSize: 11,
          fontWeight: 900,
          padding: "3px 8px",
          borderRadius: 6,
        }}
      >
        {soldOut ? t("soldOut") : fmtPrice(item.price_cents)}
      </div>

      {/* Fav — top left */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onFav(); }}
        aria-label={isFaved ? t("removeFavoriteAria") : t("addFavoriteAria")}
        style={{
          position: "absolute",
          top: 10,
          left: 10,
          background: "rgba(0,0,0,.42)",
          border: "none",
          width: 28,
          height: 28,
          borderRadius: 99,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 14,
          cursor: "pointer",
          color: isFaved ? "#FF4D6D" : "#fff",
        }}
      >
        {isFaved ? "♥" : "♡"}
      </button>

      {/* Name + add — bottom */}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "0 10px 12px" }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 900,
            color: "#fff",
            textTransform: "uppercase",
            letterSpacing: "0.5px",
            lineHeight: 1.1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            marginBottom: 8,
          }}
        >
          {item.name}
        </div>

        {/* "Add" button strip */}
        <button
          type="button"
          onClick={handleAdd}
          disabled={soldOut}
          style={{
            width: "100%",
            background: justAdded ? "#059669" : soldOut ? "rgba(255,255,255,.2)" : "#FF3B30",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            padding: "8px",
            fontSize: 12,
            fontWeight: 900,
            letterSpacing: "1px",
            cursor: soldOut ? "not-allowed" : "pointer",
            textTransform: "uppercase",
            transition: "background .2s ease",
          }}
        >
          {justAdded ? "✓ Added" : soldOut ? t("soldOut") : "+ Add"}
        </button>
      </div>
    </div>
  );
}
